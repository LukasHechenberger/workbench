import type { Payload } from 'payload';
import type { ScheduleOptions } from './schedule';

/** Runs a task once the response is sent, e.g. Next.js' `after()` */
export type RunAfterResponse = (task: () => Promise<unknown>) => void;

/** The plugin's resolved options, stored in `config.custom` for the handlers */
export interface ResolvedOptions {
  /** The schedule options, or `undefined` while scheduling is off (e.g. locally) */
  schedules: () => ScheduleOptions | undefined;
  runAfterResponse: RunAfterResponse;
}

export const customKey = 'vercelSchedules';

/** The plugin's options, or `undefined` if it isn't installed */
export function getPluginOptions(payload: Payload): ResolvedOptions | undefined {
  const options: unknown = payload.config.custom?.[customKey];
  return isResolvedOptions(options) ? options : undefined;
}

function isResolvedOptions(value: unknown): value is ResolvedOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schedules' in value &&
    typeof value.schedules === 'function' &&
    'runAfterResponse' in value &&
    typeof value.runAfterResponse === 'function'
  );
}
