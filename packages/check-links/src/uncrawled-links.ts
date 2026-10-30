import { type LinkResult, LinkState } from 'linkinator';
import { mapInBatches } from './batches';

const withoutFragment = (url: string) => url.replace(/#.*$/, '');

/**
 * Requests the links the crawl left out: links to other sites, which the crawler mustn't request
 * because it sends the deployment protection bypass secret with every request, and links to a
 * production origin, which are requested on the checked origin (see `createRewrite`). The results
 * carry the links as written on the page, so a broken link is reported as the user sees it. Like
 * the crawl, a working link is reported once and a broken one once per page it is on.
 *
 * @param requestUrl The URL to request for a link
 * @param request Requests a URL and resolves to the status code, or `undefined` if the request failed
 */
export async function checkUncrawledLinks(
  skipped: LinkResult[],
  requestUrl: (link: string) => string,
  request: (url: string) => Promise<number | undefined>,
  concurrency: number,
): Promise<LinkResult[]> {
  // The crawl records a skipped link once per page it appears on; one request per link is enough
  const parents = new Map<string, Set<string | undefined>>();
  for (const link of skipped) {
    const url = withoutFragment(link.url);
    parents.set(url, (parents.get(url) ?? new Set()).add(link.parent));
  }

  const urls = [...parents.keys()];
  const statuses = await mapInBatches(urls, concurrency, (url) => request(requestUrl(url)));

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
