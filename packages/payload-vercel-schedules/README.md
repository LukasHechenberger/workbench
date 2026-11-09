# @lhechenberger/payload-vercel-schedules

Runs [Payload](https://payloadcms.com)'s jobs on time with [Vercel Schedules](https://vercel.com/docs/schedules) and [Vercel Queues](https://vercel.com/docs/queues), instead of a cron that polls `/api/payload-jobs/run`.

A polling cron queries the database on every tick, even when no job is due (Payload reads and writes the `payload-jobs-stats` global on every call), so a serverless database like Neon never scales to zero. A less frequent cron saves compute, but runs scheduled publishing up to one interval late. With this plugin, the database is only queried when a job is due, and jobs run within about a minute of their time.

Payload's queue stays as it is: `schedulePublish`, the Jobs admin view, retries with backoff and concurrency control keep working. Only the trigger changes:

- A job that's due later (`waitUntil`, e.g. scheduled publishing, or a retry's backoff) gets a **one-time schedule** for that minute. When it fires, it publishes the job ID to a Vercel Queue topic, and the queue handler runs the job if it's still due.
- A job that's due now runs **after the response** (Next.js' `after()`).
- When a job is rescheduled, cancelled or deleted before its time, its schedule is deleted.
- Tasks and workflows with a `schedule` (cron) can be run by a static schedule with the same cron expression (see [Scheduled tasks](#scheduled-tasks)).

> [!NOTE]
> Vercel Schedules and Queues are in beta. Deploying a `queue/v2beta` or `schedule/v1beta` trigger fails unless they're enabled for your team.

## Installation

Needs Payload 3.60 or newer (tested with 3.90). Due jobs run after the response with Next.js' `after()` (Next.js 15.1 or newer) by default; elsewhere, pass `runAfterResponse`.

```sh
npm install @lhechenberger/payload-vercel-schedules
# or
bun add @lhechenberger/payload-vercel-schedules
```

Add the plugin:

```ts
// payload.config.ts
import { buildConfig } from 'payload';
import { vercelSchedules } from '@lhechenberger/payload-vercel-schedules';

export default buildConfig({
  // ...
  plugins: [vercelSchedules()],
});
```

Add the queue handler as a route:

```ts
// app/api/jobs/queue/route.ts
import config from '@payload-config';
import { getPayload } from 'payload';
import { createJobQueueHandler } from '@lhechenberger/payload-vercel-schedules/handlers';

export const POST = createJobQueueHandler({ payload: () => getPayload({ config }) });
```

Subscribe it to the plugin's topic, and remove the cron that called `/api/payload-jobs/run`:

```json
{
  "functions": {
    "app/api/jobs/queue/route.ts": {
      "experimentalTriggers": [{ "type": "queue/v2beta", "topic": "payload-jobs" }]
    }
  }
}
```

Use the route file's path relative to the project's root directory (e.g. `src/app/...` with a `src` directory).

## Options

| Option             | Default            | Description                                                                                                                                                      |
| ------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `topic`            | `'payload-jobs'`   | Queue topic the schedules publish to. Must match the trigger in `vercel.json`.                                                                                   |
| `scheduling`       | on Vercel          | Whether to create schedules. Defaults to `true` when `VERCEL=1` or the Vercel CLI provides a local Schedules API, so `next dev` only runs the jobs that are due. |
| `schedulePrefix`   | `'payload-job'`    | Schedule names are `<prefix>-<job id>-<UTC minute>`, e.g. `payload-job-42-202611071230`.                                                                         |
| `namespace`        | `'default'`        | Schedule namespace. Vercel keeps separate schedules per environment and Preview branch already; set one if several apps share a project.                         |
| `client`           | `Schedules`        | A `SchedulesClient` from `@vercel/schedules`, e.g. with a custom token or base URL.                                                                              |
| `runAfterResponse` | Next.js' `after()` | Runs a due job once the response is sent (and the transaction that queued it is committed). Outside a request, the job runs right away.                          |
| `disabled`         | `false`            | Turns the plugin off.                                                                                                                                            |

`createJobQueueHandler` takes `payload` (a function that returns the Payload instance), `retryAfterSeconds` (default 60: when a job can't run yet because it or another job with its concurrency key is running), `maxDeliveries` (default 30) and `visibilityTimeoutSeconds`.

## How it works

Payload writes jobs straight to the database when it queues, runs, retries and cancels them, without the `payload-jobs` collection's hooks. (`jobs.runHooks` would run them, but in Payload 3.90.2 it breaks every run: the job log is updated with `$push`, which the Local API rejects.) So the plugin keeps the schedules in sync in three places:

- **`payload.jobs.queue`, `cancel` and `cancelByID`** are wrapped in `onInit`, so every job that's queued (by `schedulePublish`, `handleSchedules` or your code) gets its schedule or runs, and a cancelled one loses its schedule. With `jobs.runHooks` on, the plugin leaves them alone and relies on the hooks.
- **The collection's `afterChange` and `afterDelete` hooks** (added through `jobs.jobsCollectionOverrides`, keeping your own overrides) handle changes through the Local API and the REST API, e.g. editing or deleting a job in the Jobs admin view, or unscheduling a publish.
- **After running a job**, the plugin reads it back: a retry with a backoff gets a schedule for its new `waitUntil`, one without a backoff runs again right away.

Details:

- **Schedule names** are derived from the job ID and the minute it's due, so the plugin stores nothing: creating a schedule is idempotent, and a retry or a rescheduled job gets a new one (a one-time schedule can't be changed once it fired). `waitUntil` is rounded **up** to the next full minute, as schedules have minute precision and must not fire before the job is due. Schedules fire within their jitter window (1 minute by default on Pro).
- **Running a job** goes through `payload.jobs.run({ where: { id }, limit: 1 })`, never `runByID`: Payload then claims the job atomically and skips it if it's completed, running, failed for good or not due yet. Queue delivery is at least once, so a repeated delivery does nothing.
- **Concurrency control:** a job that's skipped because another job with its concurrency key is running is delivered again after `retryAfterSeconds`. When a job with a concurrency key finishes, the due jobs that waited for it run too.
- **Rescheduled or delivered early:** if a delivery finds the job pending but due later, it makes sure the later time has a schedule and does nothing else.
- **Failed schedule requests** (e.g. Schedules isn't enabled, or the team's limit is reached) are logged as errors and don't fail the save. The job then waits until something runs the jobs.

Vercel removes fired one-time schedules after about 30 days, and they stop counting towards the team's [schedule limit](https://vercel.com/docs/schedules/limits) once they fired.

### Caveats

- Jobs Payload deletes straight from the database keep their schedule, e.g. the scheduled publish jobs of a deleted document, the pending jobs a `supersedes` concurrency key replaces, and completed jobs (`deleteJobOnComplete`, after their schedule fired). The schedule fires, finds no job and does nothing.
- Jobs written straight to the database (`payload.db.*`) aren't scheduled.
- A job that's stuck as `processing` (its function was cut off) blocks the jobs with its concurrency key, as with a polling cron. The handler gives up on them after `maxDeliveries`.
- Locally (`scheduling: false`), jobs that are due later don't run by themselves. Run them with `payload.jobs.run()`, or set Payload's `jobs.autoRun` for development.

## Scheduled tasks

Tasks and workflows with a `schedule` (`schedule: [{ cron: '0 3 * * *', queue: 'nightly' }]`) are queued by `payload.jobs.handleSchedules()`. Point a static schedule with the same cron expression at a private function that calls it:

```ts
// app/api/jobs/schedules/route.ts
import config from '@payload-config';
import { getPayload } from 'payload';
import { createJobSchedulesHandler } from '@lhechenberger/payload-vercel-schedules/handlers';

export const POST = createJobSchedulesHandler({ payload: () => getPayload({ config }) });
```

```json
{
  "functions": {
    "app/api/jobs/schedules/route.ts": {
      "experimentalTriggers": [{ "type": "schedule/v1beta" }]
    }
  },
  "schedules": {
    "payload-nightly": { "schedule": "0 3 * * *", "function": "api/jobs/schedules" }
  }
}
```

The handler queues the scheduled jobs and runs the due ones. Static schedules are active in production only; enable them for Preview branches in the dashboard or with `vercel schedules enable`.

## Local development

`next dev` runs due jobs after the response, but doesn't create schedules. With the Vercel CLI's local Schedules API (`VERCEL_SCHEDULE_DEV_API_VERSION=1`), schedules are created there instead. To try a deployed setup, use a Preview deployment: its schedules are separate from production's.

## License

[MIT](LICENSE)
