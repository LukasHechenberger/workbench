// Stand-ins for Payload's arguments and instance
/* oxlint-disable typescript/no-unsafe-type-assertion */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { afterJobChange, afterJobDelete } from './hooks';
import type { ResolvedOptions } from './options';
import { scheduleName } from './schedule';
import { mockClient, mockPayload } from './test-utilities';

const minute = 60_000;
const inMinutes = (minutes: number) =>
  new Date(Math.ceil(Date.now() / minute) * minute + minutes * minute);

let client: ReturnType<typeof mockClient>;
let deferred: (() => Promise<unknown>)[];
let options: ResolvedOptions;
let payload: ReturnType<typeof mockPayload>;

beforeEach(() => {
  client = mockClient();
  deferred = [];
  options = {
    schedules: () => ({ client, prefix: 'job', topic: 'payload-jobs' }),
    runAfterResponse: mock((task) => void deferred.push(task)),
  };
  payload = mockPayload({ ran: [[1]] });
});

function change(job: object, previousJob?: object) {
  const hook = afterJobChange(options);
  return hook({
    doc: job,
    previousDoc: previousJob ?? {},
    operation: previousJob ? 'update' : 'create',
    req: { payload: payload.payload },
  } as never);
}

const names = (calls: { mock: { calls: [{ name: string }][] } }) =>
  calls.mock.calls.map(([parameters]) => parameters.name);

describe('afterJobChange', () => {
  test('schedules a job that is due later', async () => {
    const at = inMinutes(10);
    await change({ id: 1, waitUntil: at.toISOString() });

    expect(names(client.create)).toEqual([scheduleName('job', 1, at)]);
    expect(client.delete).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(0);
  });

  test('runs a job that is due now after the response', async () => {
    await change({ id: 1 });

    expect(client.create).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);
    await deferred[0]?.();
    expect(payload.run).toHaveBeenCalledWith({
      allQueues: true,
      limit: 1,
      where: { id: { equals: 1 } },
    });
  });

  test('moves the schedule of a rescheduled job', async () => {
    const before = inMinutes(10);
    const after = inMinutes(20);
    await change(
      { id: 1, waitUntil: after.toISOString() },
      { id: 1, waitUntil: before.toISOString() },
    );

    expect(names(client.delete)).toEqual([scheduleName('job', 1, before)]);
    expect(names(client.create)).toEqual([scheduleName('job', 1, after)]);
  });

  test('keeps the schedule when other fields change', async () => {
    const waitUntil = inMinutes(10).toISOString();
    await change({ id: 1, waitUntil, input: { a: 2 } }, { id: 1, waitUntil, input: { a: 1 } });

    expect(client.create).not.toHaveBeenCalled();
    expect(client.delete).not.toHaveBeenCalled();
  });

  test('schedules a retry with a backoff', async () => {
    const retry = inMinutes(2);
    await change(
      { id: 1, processing: false, totalTried: 1, waitUntil: retry.toISOString() },
      { id: 1, processing: true, totalTried: 0 },
    );

    expect(names(client.create)).toEqual([scheduleName('job', 1, retry)]);
    expect(client.delete).not.toHaveBeenCalled();
  });

  test('runs a retry without backoff right away', async () => {
    await change({ id: 1, processing: false, totalTried: 1 }, { id: 1, processing: true });
    expect(deferred).toHaveLength(1);
  });

  test('deletes the schedule of a job cancelled before its time', async () => {
    const at = inMinutes(10);
    await change(
      // oxlint-disable-next-line unicorn/no-null -- what `payload.jobs.cancel` writes
      { id: 1, hasError: true, error: { cancelled: true }, waitUntil: null },
      { id: 1, waitUntil: at.toISOString() },
    );

    expect(names(client.delete)).toEqual([scheduleName('job', 1, at)]);
    expect(client.create).not.toHaveBeenCalled();
  });

  test('ignores updates while a job runs', async () => {
    await change({ id: 1, processing: true }, { id: 1 });
    await change({ id: 1, completedAt: new Date().toISOString() }, { id: 1, processing: true });

    expect(client.create).not.toHaveBeenCalled();
    expect(client.delete).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(0);
  });

  test("doesn't schedule when schedules are off", async () => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- scheduling is off
    options.schedules = () => undefined;
    await change({ id: 1, waitUntil: inMinutes(10).toISOString() });
    await change({ id: 2 });

    expect(client.create).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);
  });
});

test('afterJobDelete deletes the schedule of a pending job', async () => {
  const at = inMinutes(10);
  const hook = afterJobDelete(options);
  const request = { payload: payload.payload };

  await hook({ doc: { id: 1, waitUntil: at.toISOString() }, req: request } as never);
  await hook({ doc: { id: 2, completedAt: at.toISOString() }, req: request } as never);

  expect(names(client.delete)).toEqual([scheduleName('job', 1, at)]);
});
