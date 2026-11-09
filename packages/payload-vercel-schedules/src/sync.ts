// Jobs run one after the other: in order, and without a burst of database connections
/* oxlint-disable no-await-in-loop */
import type { Payload, Where } from 'payload';
import type { ResolvedOptions } from './options';
import { createJobSchedule, deleteJobSchedule, dueAt, type JobState } from './schedule';

/** Most runs of one job in a row (retries without backoff) and of jobs waiting for its key */
const maxRuns = 10;

// `payload-jobs` isn't in the generated collection slugs of every project
const jobsCollection = 'payload-jobs' as Parameters<Payload['findByID']>[0]['collection'];

const dueJobs = (): Where[] => [
  { completedAt: { exists: false } },
  { hasError: { not_equals: true } },
  { processing: { equals: false } },
  {
    or: [{ waitUntil: { exists: false } }, { waitUntil: { less_than: new Date().toISOString() } }],
  },
];

export async function findJob(payload: Payload, id: number | string): Promise<JobState | null> {
  return await payload.findByID({
    collection: jobsCollection,
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  });
}

function sameTime(a: Date | 'now' | undefined, b: Date | 'now' | undefined) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

/** Runs a due job after the response, so the request that queued it never waits for it */
function runSoon(options: ResolvedOptions, payload: Payload, job: JobState) {
  try {
    options.runAfterResponse(async () => {
      try {
        await runJob(options, payload, job);
      } catch (error) {
        payload.logger.error({ err: error, jobId: job.id }, `Could not run job ${job.id}`);
      }
    });
  } catch (error) {
    payload.logger.warn(
      { err: error, jobId: job.id },
      `Could not run job ${job.id} after the response; it runs when something runs the jobs`,
    );
  }
}

/**
 * Keeps a job's schedule in sync with its `waitUntil` after it changed from `previous`: a pending
 * job that's due later gets a one-time schedule, a due one runs after the response, and the
 * schedule of a job that's rescheduled, completed or cancelled before its time is deleted.
 */
export async function syncJob(
  options: ResolvedOptions,
  payload: Payload,
  job: JobState | null | undefined,
  previous?: JobState | null,
): Promise<void> {
  const now = Date.now();
  const next = dueAt(job, now);
  const before = dueAt(previous, now);

  if (sameTime(next, before)) return;

  const schedules = options.schedules();
  if (schedules) {
    if (before instanceof Date && previous) {
      await deleteJobSchedule(schedules, payload.logger, previous.id, before);
    }
    if (next instanceof Date && job)
      await createJobSchedule(schedules, payload.logger, job.id, next);
  } else if (next instanceof Date) {
    payload.logger.debug(
      { jobId: job?.id, waitUntil: job?.waitUntil },
      'Vercel Schedules is off: not scheduling the job',
    );
  }

  if (next === 'now' && job) runSoon(options, payload, job);
}

/**
 * Runs one job if it's still due, through `payload.jobs.run` so Payload claims it atomically: a job
 * that's completed, running, failed for good or not due yet is skipped, so a second delivery is
 * harmless. (`runByID` skips these checks.) Returns whether the job ran.
 *
 * Payload writes jobs during a run without the collection's hooks (unless `jobs.runHooks` is on),
 * so this reads the job afterwards: a retry with a backoff gets its schedule, and one without runs
 * again right away. And as no polling cron picks up a job that was skipped because another one with
 * the same concurrency key was running, the due jobs that waited for this one run next.
 */
export async function runJob(
  options: ResolvedOptions,
  payload: Payload,
  job: Pick<JobState, 'id' | 'concurrencyKey'>,
  depth = 0,
): Promise<boolean> {
  let ran = false;

  for (let run = 0; run < maxRuns; run++) {
    const result = await payload.jobs.run({
      allQueues: true,
      limit: 1,
      where: { id: { equals: job.id } },
    });
    if (!result.jobStatus || !(String(job.id) in result.jobStatus)) break;
    ran = true;

    const after = await findJob(payload, job.id);
    const due = dueAt(after);
    if (due === 'now') continue;

    if (after && due instanceof Date) {
      const schedules = options.schedules();
      if (schedules) await createJobSchedule(schedules, payload.logger, after.id, due);
    }
    break;
  }

  if (ran && job.concurrencyKey && depth < maxRuns) {
    const { docs } = await payload.find({
      collection: jobsCollection,
      where: { and: [{ concurrencyKey: { equals: job.concurrencyKey } }, ...dueJobs()] },
      sort: 'createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const next = docs[0] as JobState | undefined;
    if (next) await runJob(options, payload, next, depth + 1);
  }

  return ran;
}

/** Runs the jobs that are due, one after the other (e.g. after queueing scheduled tasks) */
export async function runDueJobs(options: ResolvedOptions, payload: Payload, limit = 10) {
  const { docs } = await payload.find({
    collection: jobsCollection,
    where: { and: dueJobs() },
    sort: 'createdAt',
    limit,
    depth: 0,
    overrideAccess: true,
  });

  for (const job of docs as JobState[]) await runJob(options, payload, job);
}

/**
 * Schedules (or runs) every job Payload queues, and deletes the schedules of the jobs it cancels:
 * Payload writes them without the collection's hooks.
 */
export function wrapJobsAPI(options: ResolvedOptions, payload: Payload) {
  const { jobs } = payload;
  const queue = jobs.queue.bind(jobs);
  const cancel = jobs.cancel.bind(jobs);
  const cancelByID = jobs.cancelByID.bind(jobs);

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- keeps `queue`'s generic signature
  jobs.queue = (async (...parameters: Parameters<typeof queue>) => {
    const job = await queue(...parameters);
    await syncJob(options, payload, job);
    return job;
  }) as typeof queue;

  jobs.cancelByID = async (parameters) => {
    const job = await findJob(payload, parameters.id);
    await cancelByID(parameters);
    await syncJob(options, payload, undefined, job);
  };

  jobs.cancel = async (parameters) => {
    const { docs } = await payload.find({
      collection: jobsCollection,
      where: {
        and: [
          parameters.where,
          { completedAt: { exists: false } },
          { hasError: { not_equals: true } },
          { waitUntil: { greater_than: new Date().toISOString() } },
          ...(parameters.queue ? [{ queue: { equals: parameters.queue } }] : []),
        ],
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });
    await cancel(parameters);
    for (const job of docs as JobState[]) await syncJob(options, payload, undefined, job);
  };
}
