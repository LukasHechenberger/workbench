import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload';
import type { ResolvedOptions } from './options';
import type { JobState } from './schedule';
import { syncJob } from './sync';

/**
 * Keeps a job's schedule in sync when it's changed through the Local API or the REST API, e.g. in
 * the Jobs admin view (`payload-jobs` `afterChange`). Payload's own writes during a run skip the
 * hooks; `runJob` handles those.
 */
export function afterJobChange(options: ResolvedOptions): CollectionAfterChangeHook<JobState> {
  return async ({ doc, previousDoc, operation, req }) => {
    await syncJob(options, req.payload, doc, operation === 'update' ? previousDoc : undefined);
    return doc;
  };
}

/**
 * Deletes the schedule of a job that's deleted before its time, e.g. when scheduled publishing is
 * cancelled (`payload-jobs` `afterDelete`).
 */
export function afterJobDelete(options: ResolvedOptions): CollectionAfterDeleteHook<JobState> {
  return async ({ doc, req }) => {
    await syncJob(options, req.payload, undefined, doc);
    return doc;
  };
}
