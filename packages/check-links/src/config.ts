import type { LinkResult } from 'linkinator';

export interface LinkContext {
  /** Origin of the checked site, e.g. `https://preview.example.com` */
  origin: string;
  /** The URL the crawl started at */
  url: string;
  /**
   * The URL that was requested for the link: the link itself, or its path on the checked origin
   * for a link to a production origin (see `productionOrigin`)
   */
  requestUrl: string;
}

export interface CheckLinksConfig {
  /** URL to check when none is passed on the command line (e.g. the local dev server) */
  url?: string;
  /**
   * Origin(s) of the live site, e.g. `https://www.example.com`. Links to them (canonical and
   * hreflang URLs, `og:url`, …) are requested on the checked origin instead, since a deployment
   * that isn't live yet can't be reached through them. Has no effect when the checked origin is
   * one of them.
   */
  productionOrigin?: string | string[];
  /** Links not to check. Strings are matched as regular expression sources. */
  skip?: (string | RegExp)[];
  /**
   * Broken links that only count as warnings (e.g. content you don't control). They are not
   * requested a second time.
   */
  isWarningOnly?: (link: LinkResult, context: LinkContext) => boolean;
  /** Heading printed above the `isWarningOnly` links */
  warningTitle?: string;
  /** Wait before broken links are requested a second time (ms), default 5000 */
  retryAfterMs?: number;
  /** Parallel requests of the second pass, default 5. Low on purpose: see the README. */
  recheckConcurrency?: number;
  /** Parallel requests of the crawl, default 20 */
  concurrency?: number;
  /** Timeout per request (ms), default 30000 */
  timeout?: number;
}

/** Type helper for `check-links.config.ts` */
export const defineConfig = (config: CheckLinksConfig): CheckLinksConfig => config;
