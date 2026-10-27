import { check, type LinkResult, LinkState } from 'linkinator';
import { classify } from './classify';
import type { CheckLinksConfig } from './config';

const BYPASS_ENV = 'VERCEL_AUTOMATION_BYPASS_SECRET';

const print = (title: string, results: LinkResult[]) => {
  if (results.length === 0) return;
  console.log(`\n${title}`);
  for (const link of results) {
    console.log(`  [${link.status ?? 'error'}] ${link.url}\n    on ${link.parent}`);
  }
};

/** Crawls `url` and prints the result. Returns the process exit code. */
export async function run(url: string, config: CheckLinksConfig): Promise<number> {
  const { origin } = new URL(url);
  const bypassSecret = process.env[BYPASS_ENV];
  // Lets the crawler through Vercel's deployment protection
  const headers: Record<string, string> = bypassSecret
    ? { 'x-vercel-protection-bypass': bypassSecret }
    : {};

  // A protected deployment redirects to Vercel's login page, which linkinator would happily
  // check instead of the site
  const start = await fetch(url, { headers, redirect: 'manual' });
  if (!start.ok) {
    console.error(
      `${url} answered with ${start.status} ${start.headers.get('location') ?? ''}`.trim() +
        (bypassSecret ? '' : `\nIf the deployment is protected, set ${BYPASS_ENV}.`),
    );
    return 1;
  }

  const skip = (config.skip ?? []).map((pattern) =>
    typeof pattern === 'string' ? new RegExp(pattern) : pattern,
  );
  const { links } = await check({
    path: url,
    recurse: true,
    concurrency: config.concurrency ?? 20,
    timeout: config.timeout ?? 30_000,
    // Retries 5xx responses and network errors, which are mostly temporary
    retryErrors: true,
    retryErrorsCount: 2,
    retry: true,
    headers,
    linksToSkip: async (link) => skip.some((pattern) => pattern.test(link)),
  });

  const isWarningOnly = (link: LinkResult) =>
    config.isWarningOnly?.(link, { origin, url }) ?? false;

  /** Whether `link` works when requested again, a while after the crawl */
  const recovers = async (link: LinkResult) => {
    try {
      const response = await fetch(link.url, {
        headers: link.url.startsWith(origin) ? headers : {},
      });
      await response.body?.cancel();
      return response.ok;
    } catch {
      return false;
    }
  };

  const broken = links.filter((link) => link.state === LinkState.BROKEN);
  const { errors, flaky, warnings } = await classify(broken, {
    isWarningOnly,
    recovers,
    wait: () => new Promise((resolve) => setTimeout(resolve, config.retryAfterMs ?? 5000)),
    concurrency: config.recheckConcurrency ?? 5,
  });

  print(`${config.warningTitle ?? 'Broken links that are only warnings'} (warnings):`, warnings);
  print('Links that worked on a second request (warnings):', flaky);
  print('Broken links:', errors);
  // The last line is the summary the workflow shows as the check run's title
  console.log(
    `\nChecked ${links.length} links on ${origin}: ${errors.length} broken, ${warnings.length + flaky.length} warnings`,
  );

  return errors.length > 0 ? 1 : 0;
}
