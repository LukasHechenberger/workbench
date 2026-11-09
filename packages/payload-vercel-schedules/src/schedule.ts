import type { CreateScheduleParams, SchedulesClient } from '@vercel/schedules';
import { SchedulesApiError } from '@vercel/schedules';

/** The fields of a `payload-jobs` document the plugin reads */
export interface JobState {
  id: number | string;
  completedAt?: string | null;
  hasError?: boolean | null;
  processing?: boolean | null;
  waitUntil?: string | null;
  concurrencyKey?: string | null;
}

/** The payload of every schedule the plugin creates */
export interface JobSchedulePayload {
  jobId: number | string;
}

/** What the plugin needs from a Schedules client (`Schedules` from `@vercel/schedules`, or a mock) */
export type ScheduleClient = Pick<SchedulesClient, 'create' | 'delete'>;

export interface ScheduleLogger {
  debug: (object: object, message: string) => void;
  error: (object: object, message: string) => void;
  warn: (object: object, message: string) => void;
}

export interface ScheduleOptions {
  client: ScheduleClient;
  /** Schedule namespace (Vercel keeps separate schedules per environment and branch anyway) */
  namespace?: string;
  /** Prefix of the schedule names: `<prefix>-<job id>-<UTC minute>` */
  prefix: string;
  /** Queue topic the schedules publish to */
  topic: string;
}

const minute = 60_000;

/** A job Payload will still run: not completed, not running and without a final error */
function isPending(job: JobState | null | undefined): job is JobState {
  return Boolean(job && !job.completedAt && !job.processing && !job.hasError);
}

/**
 * When a pending job is due, as a schedule's minute: `waitUntil` rounded **up** to the next full
 * minute, as one-time schedules have minute precision and must not fire before the job is due.
 * `undefined` for jobs that aren't pending, `'now'` for jobs that are due already.
 */
export function dueAt(
  job: JobState | null | undefined,
  now = Date.now(),
): Date | 'now' | undefined {
  if (!isPending(job)) return undefined;
  if (!job.waitUntil) return 'now';

  const waitUntil = new Date(job.waitUntil).getTime();
  if (Number.isNaN(waitUntil) || waitUntil <= now) return 'now';

  return new Date(Math.ceil(waitUntil / minute) * minute);
}

/** `YYYY-MM-DDTHH:mm` in UTC, the format of a one-time schedule's `at` */
export function scheduleAt(date: Date): string {
  return date.toISOString().slice(0, 16);
}

/**
 * The name of the schedule that runs a job at a time. It's derived from the job and the time only,
 * so creating it is idempotent and the plugin never needs to store it: a retry or a rescheduled job
 * gets a new schedule (a one-time schedule can't be changed once it fired).
 */
export function scheduleName(prefix: string, jobId: number | string, at: Date): string {
  return `${prefix}-${jobId}-${scheduleAt(at).replaceAll(/\D/g, '')}`;
}

function isApiError(error: unknown, ...codes: string[]): error is SchedulesApiError {
  return error instanceof SchedulesApiError && codes.includes(error.code ?? '');
}

/** Creates the one-time schedule that runs a job at `at`. Never throws: errors are logged. */
export async function createJobSchedule(
  options: ScheduleOptions,
  logger: ScheduleLogger,
  jobId: number | string,
  at: Date,
): Promise<void> {
  const name = scheduleName(options.prefix, jobId, at);
  const parameters: CreateScheduleParams = {
    name,
    namespace: options.namespace,
    expression: { type: 'single', at: scheduleAt(at) },
    timezone: 'UTC',
    target: { topic: options.topic },
    payload: { jobId } satisfies JobSchedulePayload,
  };

  try {
    await options.client.create(parameters);
    logger.debug({ jobId, schedule: name }, 'Scheduled job');
  } catch (error) {
    if (isApiError(error, 'schedule_already_exists')) return;

    if (isApiError(error, 'single_at_in_past')) {
      // The minute passed while the request was on its way: schedule the next one instead
      await createJobSchedule(options, logger, jobId, new Date(at.getTime() + minute));
      return;
    }

    logger.error(
      { err: error, jobId, schedule: name },
      `Could not schedule job ${jobId}: it won't run at ${at.toISOString()} unless something else runs the jobs`,
    );
  }
}

/** Deletes the schedule that runs a job at `at`, if it hasn't fired yet. Never throws. */
export async function deleteJobSchedule(
  options: ScheduleOptions,
  logger: ScheduleLogger,
  jobId: number | string,
  at: Date,
): Promise<void> {
  const name = scheduleName(options.prefix, jobId, at);

  try {
    await options.client.delete({ name, namespace: options.namespace });
    logger.debug({ jobId, schedule: name }, 'Deleted job schedule');
  } catch (error) {
    // Gone already, or firing right now: the handler skips jobs that aren't due or don't exist
    if (isApiError(error, 'not_found', 'schedule_single_at_passed')) return;

    logger.warn(
      { err: error, jobId, schedule: name },
      `Could not delete the schedule of job ${jobId}; it will fire and do nothing`,
    );
  }
}
