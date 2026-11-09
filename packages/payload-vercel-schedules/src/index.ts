import { Schedules } from '@vercel/schedules';
import type { Config, Plugin } from 'payload';
import { afterJobChange, afterJobDelete } from './hooks';
import { customKey, type ResolvedOptions, type RunAfterResponse } from './options';
import type { ScheduleClient, ScheduleOptions } from './schedule';
import { wrapJobsAPI } from './sync';

export { getPluginOptions } from './options';
export type { RunAfterResponse } from './options';
export type { JobSchedulePayload, ScheduleClient } from './schedule';

export interface VercelSchedulesPluginOptions {
  /** Turns the plugin off: jobs are neither scheduled nor run after the response */
  disabled?: boolean;
  /**
   * Whether to create Vercel Schedules for jobs that are due later. Defaults to `true` on Vercel
   * (`VERCEL=1`) and with the Vercel CLI's local Schedules API, and `false` elsewhere (e.g. `next dev`),
   * where those jobs are only logged. Due jobs run after the response either way.
   */
  scheduling?: boolean;
  /**
   * The Vercel Queue topic the schedules publish to. Subscribe the queue handler to it
   * (`experimentalTriggers` in `vercel.json`).
   * @default 'payload-jobs'
   */
  topic?: string;
  /**
   * Prefix of the schedule names (`<prefix>-<job id>-<UTC minute>`).
   * @default 'payload-job'
   */
  schedulePrefix?: string;
  /**
   * Namespace of the schedules. Vercel keeps separate schedules for production, every Preview branch
   * and custom environment already; set one to share a project with other apps.
   */
  namespace?: string;
  /** Schedules client, e.g. a `SchedulesClient` with custom options. Defaults to `Schedules`. */
  client?: ScheduleClient;
  /**
   * Runs a job that's due now once the response is sent (after its transaction is committed).
   * Defaults to Next.js' `after()`.
   */
  runAfterResponse?: RunAfterResponse;
}

const defaultTopic = 'payload-jobs';

function isSchedulingAvailable() {
  return process.env.VERCEL === '1' || process.env.VERCEL_SCHEDULE_DEV_API_VERSION === '1';
}

/**
 * Next.js' `after()`, imported on first use so the plugin also loads without Next.js. Outside a
 * request (e.g. in a script), the job runs right away.
 */
const nextAfter: RunAfterResponse = (task) => {
  void import('next/server').then(({ after }) => after(task)).catch(() => task());
};

/**
 * Runs Payload's jobs with Vercel Schedules instead of a polling cron. A job that's due later
 * (`waitUntil`, e.g. scheduled publishing or a retry's backoff) gets a one-time schedule, which
 * publishes to a Vercel Queue topic when the job is due; the queue handler (`/handlers`) runs it. A
 * job that's due now runs after the response. The database is only queried when a job is due.
 *
 * Payload writes jobs without the collection's hooks when it queues and runs them (unless
 * `jobs.runHooks` is on, which breaks the job log in Payload 3.90.2), so the plugin wraps
 * `payload.jobs.queue`, and the handlers read a job back after running it. The collection's hooks
 * handle changes through the Local API and the REST API, e.g. in the Jobs admin view.
 */
export function vercelSchedules(options: VercelSchedulesPluginOptions = {}): Plugin {
  return (config: Config): Config => {
    if (options.disabled) return config;

    const schedules: ScheduleOptions = {
      client: options.client ?? Schedules,
      namespace: options.namespace,
      prefix: options.schedulePrefix ?? 'payload-job',
      topic: options.topic ?? defaultTopic,
    };
    const resolved: ResolvedOptions = {
      // Read when a job changes, not when the config is built (which can happen during the build)
      schedules: () => ((options.scheduling ?? isSchedulingAvailable()) ? schedules : undefined),
      runAfterResponse: options.runAfterResponse ?? nextAfter,
    };
    const overrides = config.jobs?.jobsCollectionOverrides;

    return {
      ...config,
      custom: { ...config.custom, [customKey]: resolved },
      jobs: {
        ...config.jobs,
        jobsCollectionOverrides: ({ defaultJobsCollection }) => {
          const collection = overrides
            ? overrides({ defaultJobsCollection })
            : defaultJobsCollection;

          return {
            ...collection,
            hooks: {
              ...collection.hooks,
              afterChange: [...(collection.hooks?.afterChange ?? []), afterJobChange(resolved)],
              afterDelete: [...(collection.hooks?.afterDelete ?? []), afterJobDelete(resolved)],
            },
          };
        },
      },
      onInit: async (payload) => {
        // With `runHooks`, Payload writes jobs through the Local API, which runs the hooks already
        if (!config.jobs?.runHooks) wrapJobsAPI(resolved, payload);
        await config.onInit?.(payload);
      },
    };
  };
}
