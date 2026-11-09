import { describe, expect, mock, test } from 'bun:test';
import { handleJobMessage, JobNotReadyError } from './handlers';
import { customKey, type ResolvedOptions } from './options';
import { scheduleName } from './schedule';
import { runJob } from './sync';
import { mockClient, mockPayload } from './test-utilities';

const message = { payload: { jobId: 1 } };
const first = { deliveryCount: 1 };
const minute = 60_000;

/** The error a promise rejects with, or `undefined` if it resolves */
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

function pluginOptions(client = mockClient()): ResolvedOptions {
  return {
    schedules: () => ({ client, prefix: 'job', topic: 't' }),
    runAfterResponse: mock(),
  };
}

const withPlugin = (options: ResolvedOptions) => ({ [customKey]: options });

describe('handleJobMessage', () => {
  test('runs a due job', async () => {
    const { payload, run } = mockPayload({
      jobs: [{ id: 1 }],
      ran: [[1]],
      custom: withPlugin(pluginOptions()),
    });
    await handleJobMessage(payload, message, first, 30);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('does nothing for deleted, completed or cancelled jobs', async () => {
    for (const job of [
      // oxlint-disable-next-line unicorn/no-null -- `findByID` returns `null` for missing documents
      null,
      { id: 1, completedAt: '2026-11-07T12:00:00Z' },
      { id: 1, hasError: true },
    ]) {
      const { payload, run } = mockPayload({ jobs: [job], custom: withPlugin(pluginOptions()) });
      // oxlint-disable-next-line no-await-in-loop -- one case after the other
      await handleJobMessage(payload, message, first, 30);
      expect(run).not.toHaveBeenCalled();
    }
  });

  test('schedules a job that was moved to a later time instead of running it', async () => {
    const client = mockClient();
    const waitUntil = new Date(Math.ceil(Date.now() / minute) * minute + 60 * minute);
    const { payload, run } = mockPayload({
      jobs: [{ id: 1, waitUntil: waitUntil.toISOString() }],
      custom: withPlugin(pluginOptions(client)),
    });

    await handleJobMessage(payload, message, first, 30);

    expect(run).not.toHaveBeenCalled();
    expect(client.create.mock.calls[0]?.[0].name).toBe(scheduleName('job', 1, waitUntil));
  });

  test('asks for redelivery while the job runs or waits for its concurrency key', async () => {
    const custom = withPlugin(pluginOptions());
    const running = mockPayload({ jobs: [{ id: 1, processing: true }], custom });
    expect(await rejection(handleJobMessage(running.payload, message, first, 30))).toBeInstanceOf(
      JobNotReadyError,
    );

    const blocked = mockPayload({ jobs: [{ id: 1 }], ran: [[]], custom });
    expect(await rejection(handleJobMessage(blocked.payload, message, first, 30))).toBeInstanceOf(
      JobNotReadyError,
    );
  });

  test('gives up after the last delivery', async () => {
    const { payload } = mockPayload({
      jobs: [{ id: 1, processing: true }],
      custom: withPlugin(pluginOptions()),
    });
    expect(await handleJobMessage(payload, message, { deliveryCount: 30 }, 30)).toBeUndefined();
  });
});

describe('runJob', () => {
  test('schedules a retry with a backoff', async () => {
    const client = mockClient();
    const retry = new Date(Math.ceil(Date.now() / minute) * minute + 2 * minute);
    const { payload, run } = mockPayload({
      jobs: [{ id: 1, totalTried: 1, waitUntil: retry.toISOString() }],
      ran: [[1]],
    });

    expect(await runJob(pluginOptions(client), payload, { id: 1 })).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(client.create.mock.calls.map(([call]) => call.name)).toEqual([
      scheduleName('job', 1, retry),
    ]);
  });

  test('runs a retry without backoff right away', async () => {
    const { payload, run } = mockPayload({ jobs: [{ id: 1, totalTried: 1 }], ran: [[1], [1]] });

    await runJob(pluginOptions(), payload, { id: 1 });
    expect(run).toHaveBeenCalledTimes(2);
  });

  test('reports a job that was skipped', async () => {
    const { payload } = mockPayload({ ran: [[]] });
    expect(await runJob(pluginOptions(), payload, { id: 1 })).toBe(false);
  });

  test('runs the jobs that waited for the same concurrency key', async () => {
    const { payload, run } = mockPayload({
      ran: [[1], [2]],
      found: [[{ id: 2, concurrencyKey: 'post:1' }], []],
    });

    await runJob(pluginOptions(), payload, { id: 1, concurrencyKey: 'post:1' });
    expect(run.mock.calls.map(([arguments_]) => arguments_)).toEqual([
      { allQueues: true, limit: 1, where: { id: { equals: 1 } } },
      { allQueues: true, limit: 1, where: { id: { equals: 2 } } },
    ]);
  });
});
