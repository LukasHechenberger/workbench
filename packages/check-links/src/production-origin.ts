import { type LinkResult, LinkState } from 'linkinator';
import { mapInBatches } from './batches';

/** The URL to request instead of a link, or `undefined` to request the link as it is */
export type Rewrite = (link: string) => string | undefined;

const parseOrigin = (value: string) => {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(
      `productionOrigin "${value}" is not a URL (expected e.g. https://www.example.com)`,
    );
  }
};

/**
 * Maps links to the production origins (`productionOrigin` in the config) onto the checked
 * origin, so that they are requested on the deployment under test. Links to other origins stay
 * as they are. When the checked origin is one of the production origins, the site under test is
 * the live site and nothing is rewritten.
 */
export function createRewrite(
  checkedUrl: string,
  productionOrigin: string | string[] = [],
): Rewrite {
  const { origin } = new URL(checkedUrl);
  const origins = new Set(
    (Array.isArray(productionOrigin) ? productionOrigin : [productionOrigin]).map(parseOrigin),
  );
  if (origins.has(origin)) return () => undefined;

  return (link) => {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return undefined;
    }
    if (!origins.has(url.origin)) return undefined;
    return new URL(`${url.pathname}${url.search}${url.hash}`, origin).href;
  };
}

const withoutFragment = (url: string) => url.replace(/#.*$/, '');

/**
 * Requests the links the crawl skipped because they point at a production origin, on the checked
 * origin (see `createRewrite`). The results carry the links as written on the page, so a broken
 * link is reported as the user sees it. Like the crawl, a working link is reported once and a
 * broken one once per page it is on.
 *
 * @param request Requests a URL and resolves to the status code, or `undefined` if the request failed
 */
export async function checkRewrittenLinks(
  skipped: LinkResult[],
  rewrite: Rewrite,
  request: (url: string) => Promise<number | undefined>,
  concurrency: number,
): Promise<LinkResult[]> {
  // The crawl records a skipped link once per page it appears on; one request per link is enough
  const parents = new Map<string, Set<string | undefined>>();
  for (const link of skipped) {
    const url = withoutFragment(link.url);
    if (rewrite(url) === undefined) continue;
    parents.set(url, (parents.get(url) ?? new Set()).add(link.parent));
  }

  const urls = [...parents.keys()];
  const statuses = await mapInBatches(urls, concurrency, (url) => request(rewrite(url) ?? url));

  return urls.flatMap((url, index) => {
    const status = statuses[index];
    const ok = status !== undefined && status >= 200 && status < 300;
    const result = (parent?: string): LinkResult => ({
      url,
      parent,
      status,
      state: ok ? LinkState.OK : LinkState.BROKEN,
    });
    const [first] = parents.get(url) ?? [];
    return ok ? [result(first)] : [...(parents.get(url) ?? [])].map(result);
  });
}
