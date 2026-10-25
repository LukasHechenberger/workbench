import type { LinkResult } from 'linkinator';

export interface LinkContext {
  /** Origin of the checked site, e.g. `https://preview.example.com` */
  origin: string;
  /** The URL the crawl started at */
  url: string;
}

export interface CheckLinksConfig {
  /** URL to check when none is passed on the command line (e.g. the local dev server) */
  url?: string;
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
