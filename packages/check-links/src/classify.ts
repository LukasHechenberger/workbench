import type { LinkResult } from 'linkinator';
import { mapInBatches } from './batches';

export interface Classification {
  /** Still broken on the second request */
  errors: LinkResult[];
  /** Worked on the second request */
  flaky: LinkResult[];
  /** Broken, but allowed to be (see `isWarningOnly`) */
  warnings: LinkResult[];
}

export interface ClassifyOptions {
  isWarningOnly: (link: LinkResult) => boolean;
  /** Requests `link` again and tells whether it works now */
  recovers: (link: LinkResult) => Promise<boolean>;
  /** Waits before the second pass; only called if there is something to re-request */
  wait: () => Promise<void>;
  /** Parallel `recovers` calls */
  concurrency: number;
}

/**
 * Sorts broken links into real errors, flaky links (fine on a second request) and tolerated
 * warnings. Fresh deployments answer some first requests with errors, e.g. image optimizations
 * from a function that has just started, so a failure on the first request isn't proof.
 */
export async function classify(
  broken: LinkResult[],
  { isWarningOnly, recovers, wait, concurrency }: ClassifyOptions,
): Promise<Classification> {
  const warnings = broken.filter((link) => isWarningOnly(link));
  const toRecheck = broken.filter((link) => !isWarningOnly(link));
  const errors: LinkResult[] = [];
  const flaky: LinkResult[] = [];
  if (toRecheck.length === 0) return { errors, flaky, warnings };

  await wait();
  // A burst of requests is what failed in the first place, so the second pass is gentle
  const results = await mapInBatches(toRecheck, concurrency, recovers);
  for (const [index, link] of toRecheck.entries()) (results[index] ? flaky : errors).push(link);
  return { errors, flaky, warnings };
}
