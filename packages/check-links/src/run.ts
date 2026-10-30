import { check, type LinkResult, LinkState } from 'linkinator';
import { classify } from './classify';
import type { CheckLinksConfig } from './config';
import { checkRewrittenLinks, createRewrite } from './production-origin';

const BYPASS_ENV = 'VERCEL_AUTOMATION_BYPASS_SECRET';

const print = (title: string, results: LinkResult[], describe: (link: LinkResult) => string) => {
  if (results.length === 0) return;
  console.log(`\n${title}`);
  for (const link of results) {
    console.log(`  [${link.status ?? 'error'}] ${describe(link)}\n    on ${link.parent}`);
  }
};

/** Crawls `url` and prints the result. Returns the process exit code. */
export async function run(url: string, config: CheckLinksConfig): Promise<number> {
  const { origin } = new URL(url);
  const rewrite = createRewrite(url, config.productionOrigin);
  const bypassSecret = process.env[BYPASS_ENV];
  // Lets the crawler through Vercel's deployment protection
  const headers: Record<string, string> = bypassSecret
    ? { 'x-vercel-protection-bypass': bypassSecret }
    : {};
  const headersFor = (requestUrl: string) => (new URL(requestUrl).origin === origin ? headers : {});

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
  const isSkipped = (link: string) => skip.some((pattern) => pattern.test(link));
  const concurrency = config.concurrency ?? 20;
  const { links: crawled } = await check({
    path: url,
    recurse: true,
    concurrency,
    timeout: config.timeout ?? 30_000,
    // Retries 5xx responses and network errors, which are mostly temporary
    retryErrors: true,
    retryErrorsCount: 2,
    retry: true,
    headers,
    // Links to a production origin are requested on the checked origin below instead
    linksToSkip: async (link) => isSkipped(link) || rewrite(link) !== undefined,
  });

  /** Requests `requestUrl` and tells the status; `undefined` if the request failed */
  const request = async (requestUrl: string) => {
    try {
      const response = await fetch(requestUrl, { headers: headersFor(requestUrl) });
      await response.body?.cancel();
      return response.status;
    } catch {
      return undefined;
    }
  };

  const pointsAtProduction = (link: LinkResult) => rewrite(link.url) !== undefined;
  const rewritten = await checkRewrittenLinks(
    crawled.filter((link) => link.state === LinkState.SKIPPED && !isSkipped(link.url)),
    rewrite,
    request,
    concurrency,
  );
  const links = [
    ...crawled.filter((link) => link.state !== LinkState.SKIPPED || !pointsAtProduction(link)),
    ...rewritten,
  ];

  const isWarningOnly = (link: LinkResult) =>
    config.isWarningOnly?.(link, { origin, url, requestUrl: rewrite(link.url) ?? link.url }) ??
    false;

  /** Whether `link` works when requested again, a while after the crawl */
  const recovers = async (link: LinkResult) => {
    const status = await request(rewrite(link.url) ?? link.url);
    return status !== undefined && status >= 200 && status < 300;
  };

  const broken = links.filter((link) => link.state === LinkState.BROKEN);
  const { errors, flaky, warnings } = await classify(broken, {
    isWarningOnly,
    recovers,
    wait: () => new Promise((resolve) => setTimeout(resolve, config.retryAfterMs ?? 5000)),
    concurrency: config.recheckConcurrency ?? 5,
  });

  const describe = (link: LinkResult) => {
    const requestUrl = rewrite(link.url);
    return requestUrl ? `${link.url} (checked as ${requestUrl})` : link.url;
  };
  print(
    `${config.warningTitle ?? 'Broken links that are only warnings'} (warnings):`,
    warnings,
    describe,
  );
  print('Links that worked on a second request (warnings):', flaky, describe);
  print('Broken links:', errors, describe);
  // The last line is the summary the workflow shows as the check run's title
  console.log(
    `\nChecked ${links.length} links on ${origin}: ${errors.length} broken, ${warnings.length + flaky.length} warnings`,
  );

  return errors.length > 0 ? 1 : 0;
}
