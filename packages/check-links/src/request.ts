const MAX_REDIRECTS = 10;

const isRedirect = (status: number) => [301, 302, 303, 307, 308].includes(status);

/** Set `CHECK_LINKS_DEBUG` to log every request the package makes itself, hop by hop */
const debug = process.env.CHECK_LINKS_DEBUG
  ? (message: string) => console.error(`[check-links] ${message}`)
  : () => {};

/**
 * Creates a function that requests a URL and resolves to the final status code, or `undefined`
 * if the request failed or timed out. A request that carries headers (`headersFor` gives them
 * per URL) follows redirects one hop at a time, with the headers for each hop's URL, so that
 * headers meant for one origin never reach another one (a plain `fetch` keeps custom headers
 * across cross-origin redirects). A request without headers lets the runtime follow redirects.
 */
export const createRequest =
  (headersFor: (url: string) => Record<string, string>, timeout: number) =>
  async (requestUrl: string): Promise<number | undefined> => {
    try {
      let url = requestUrl;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const headers = headersFor(url);
        // oxlint-disable-next-line no-await-in-loop -- one hop after the other, by nature
        const response = await fetch(url, {
          headers,
          redirect: Object.keys(headers).length > 0 ? 'manual' : 'follow',
          signal: AbortSignal.timeout(timeout),
        });
        // oxlint-disable-next-line no-await-in-loop
        await response.body?.cancel();
        const location = response.headers.get('location');
        debug(`GET ${url} -> ${response.status}${location ? ` -> ${location}` : ''}`);
        if (!isRedirect(response.status) || !location) return response.status;
        url = new URL(location, url).href;
      }
      debug(`GET ${requestUrl}: more than ${MAX_REDIRECTS} redirects`);
      return undefined;
    } catch (error) {
      debug(`GET ${requestUrl} failed: ${String(error)}`);
      return undefined;
    }
  };
