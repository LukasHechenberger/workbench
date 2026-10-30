const MAX_REDIRECTS = 10;

const isRedirect = (status: number) => [301, 302, 303, 307, 308].includes(status);

/**
 * Creates a function that requests a URL and resolves to the final status code, or `undefined`
 * if the request failed. Redirects are followed one hop at a time, with the headers `headersFor`
 * gives for each hop's URL, so that headers meant for one origin never reach another one (a
 * plain `fetch` keeps custom headers across cross-origin redirects).
 */
export const createRequest =
  (headersFor: (url: string) => Record<string, string>) =>
  async (requestUrl: string): Promise<number | undefined> => {
    try {
      let url = requestUrl;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        // oxlint-disable-next-line no-await-in-loop -- one hop after the other, by nature
        const response = await fetch(url, { headers: headersFor(url), redirect: 'manual' });
        // oxlint-disable-next-line no-await-in-loop
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!isRedirect(response.status) || !location) return response.status;
        url = new URL(location, url).href;
      }
      return undefined;
    } catch {
      return undefined;
    }
  };
