import { handleCallback, type MessageMetadata } from '@vercel/queue';
import { handleSchedule, type ScheduleQueueMessage } from '@vercel/schedules';
import type { Payload } from 'payload';
import { getPluginOptions, type ResolvedOptions } from './options';
import { createJobSchedule, dueAt, type JobSchedulePayload } from './schedule';
import { findJob, runDueJobs, runJob } from './sync';

/** Returns the Payload instance, e.g. `() => getPayload({ config })` */
export type GetPayload = () => Payload | Promise<Payload>;

export interface JobQueueHandlerOptions {
  payload: GetPayload;
  /**
   * Seconds until a job that couldn't run yet (another job with its concurrency key, or the job
   * itself, is still running) is tried again.
   * @default 60
   */
  retryAfterSeconds?: number;
  /**
   * Deliveries after which the handler gives up on a job that still couldn't run (e.g. one that's
   * stuck as processing after its function was cut off). It's logged as an error.
   * @default 30
   */
  maxDeliveries?: number;
  /** How long a delivery is locked while the job runs, see `handleCallback` of `@vercel/queue` */
  visibilityTimeoutSeconds?: number;
}

function pluginOptions(payload: Payload): ResolvedOptions {
  const options = getPluginOptions(payload);
  if (!options) throw new Error('Add the vercelSchedules plugin to the Payload config');
  return options;
}

export class JobNotReadyError extends Error {
  override name = 'JobNotReadyError';
}

/**
 * Handles the messages the job schedules publish (`POST` of a route subscribed to the plugin's topic
 * with a `queue/v2beta` trigger). Runs the job if it's still due. Delivery is at least once, and
 * Payload claims the job atomically, so a repeated delivery does nothing.
 */
/**
 * Runs the job of a schedule message if it's still due. Throws `JobNotReadyError` for a job that
 * can't run yet (so the queue delivers the message again), and returns otherwise.
 */
export async function handleJobMessage(
  payload: Payload,
  message: Pick<ScheduleQueueMessage<JobSchedulePayload>, 'payload'>,
  metadata: Pick<MessageMetadata, 'deliveryCount'>,
  maxDeliveries: number,
): Promise<void> {
  const jobId = message.payload?.jobId;

  if (jobId === undefined) {
    payload.logger.warn({ message }, 'Ignoring a job schedule message without a job ID');
    return;
  }

  const options = pluginOptions(payload);
  const job = await findJob(payload, jobId);

  // Deleted, completed or cancelled since it was scheduled
  const due = dueAt(job);
  if (!job || (!due && !job.processing)) return;

  if (due instanceof Date) {
    // Rescheduled to a later time without its old schedule being deleted, or delivered early: make
    // sure the new time has a schedule
    const schedules = options.schedules();
    if (schedules) await createJobSchedule(schedules, payload.logger, job.id, due);
    return;
  }

  if (due === 'now' && (await runJob(options, payload, job))) return;

  // Running (e.g. a repeated delivery), or blocked by a running job with its concurrency key
  if (metadata.deliveryCount >= maxDeliveries) {
    payload.logger.error(
      { jobId: job.id, deliveryCount: metadata.deliveryCount },
      `Giving up on job ${job.id}: it still couldn't run after ${metadata.deliveryCount} deliveries`,
    );
    return;
  }

  throw new JobNotReadyError(`Job ${job.id} can't run yet`);
}

/**
 * Handles the messages the job schedules publish (`POST` of a route subscribed to the plugin's topic
 * with a `queue/v2beta` trigger). Runs the job if it's still due. Delivery is at least once, and
 * Payload claims the job atomically, so a repeated delivery does nothing.
 */
export function createJobQueueHandler(options: JobQueueHandlerOptions) {
  const retryAfterSeconds = options.retryAfterSeconds ?? 60;
  const maxDeliveries = options.maxDeliveries ?? 30;

  return handleCallback<ScheduleQueueMessage<JobSchedulePayload>>(
    async (message, metadata) =>
      handleJobMessage(await options.payload(), message, metadata, maxDeliveries),
    {
      visibilityTimeoutSeconds: options.visibilityTimeoutSeconds,
      retry: (error) =>
        error instanceof JobNotReadyError ? { afterSeconds: retryAfterSeconds } : undefined,
    },
  );
}

export interface JobSchedulesHandlerOptions {
  payload: GetPayload;
}

/**
 * Queues the jobs of tasks and workflows with a `schedule` (cron) and runs the due jobs (`POST` of a
 * private function with a `schedule/v1beta` trigger). Point a static schedule in `vercel.json` with
 * each task's cron expression at it, instead of a polling cron.
 */
export function createJobSchedulesHandler(options: JobSchedulesHandlerOptions) {
  return handleSchedule(async () => {
    const payload = await options.payload();

    await payload.jobs.handleSchedules({ allQueues: true });
    await runDueJobs(pluginOptions(payload), payload);
  });
}
