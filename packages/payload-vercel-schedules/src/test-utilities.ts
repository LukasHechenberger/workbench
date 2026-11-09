// Stand-ins for Payload's arguments and instance
/* oxlint-disable typescript/no-unsafe-type-assertion */
import { mock } from 'bun:test';
import { SchedulesApiError } from '@vercel/schedules';
import type { Payload } from 'payload';
import type { ScheduleClient } from './schedule';

export const silentLogger = { debug: mock(), error: mock(), warn: mock(), info: mock() };

function fail(code: string | undefined) {
  if (code) throw new SchedulesApiError(409, code, { code });
}

/** A Schedules client that records calls and fails with the given error codes, in order */
export function mockClient(failures: { create?: string[]; delete?: string[] } = {}) {
  const create = [...(failures.create ?? [])];
  const remove = [...(failures.delete ?? [])];
  return {
    create: mock(async (parameters: Parameters<ScheduleClient['create']>[0]) => {
      fail(create.shift());
      return parameters as never;
    }),
    delete: mock(async (_parameters: Parameters<ScheduleClient['delete']>[0]) => {
      fail(remove.shift());
    }),
  };
}

/** A Payload stand-in with the job APIs the plugin uses */
export function mockPayload({
  jobs = [],
  ran = [],
  found = [],
  custom,
}: {
  /** What `findByID` returns, one per call (`null` once they're used up) */
  jobs?: (Record<string, unknown> | null)[];
  /** Job IDs `jobs.run` reports as run, one list per call */
  ran?: (string | number)[][];
  /** The documents `find` returns, one list per call */
  found?: Record<string, unknown>[][];
  custom?: Record<string, unknown>;
} = {}) {
  const runs = [...ran];
  const results = [...jobs];
  const finds = [...found];
  const run = mock(async (_arguments: unknown) => ({
    jobStatus: Object.fromEntries((runs.shift() ?? []).map((id) => [id, { status: 'success' }])),
  }));
  // oxlint-disable-next-line unicorn/no-null -- `findByID` returns `null` for missing documents
  const findByID = mock(async (_arguments: unknown) => results.shift() ?? null);
  const find = mock(async (_arguments: unknown) => ({ docs: finds.shift() ?? [] }));

  return {
    payload: {
      config: { custom },
      find,
      findByID,
      jobs: { run },
      logger: silentLogger,
    } as unknown as Payload,
    find,
    findByID,
    run,
  };
}
