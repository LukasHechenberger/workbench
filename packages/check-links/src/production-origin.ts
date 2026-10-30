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
