import { describe, expect, test } from 'bun:test';
import { createJobSchedule, deleteJobSchedule, dueAt, scheduleAt, scheduleName } from './schedule';
import { mockClient, silentLogger } from './test-utilities';

const now = Date.parse('2026-11-07T12:00:30.000Z');
const options = (client: ReturnType<typeof mockClient>) => ({
  client,
  prefix: 'payload-job',
  topic: 'payload-jobs',
});

describe('dueAt', () => {
  test('rounds a later waitUntil up to the next minute', () => {
    expect(dueAt({ id: 1, waitUntil: '2026-11-07T12:05:01.000Z' }, now)).toEqual(
      new Date('2026-11-07T12:06:00.000Z'),
    );
  });

  test('keeps a waitUntil on the full minute', () => {
    expect(dueAt({ id: 1, waitUntil: '2026-11-07T12:05:00.000Z' }, now)).toEqual(
      new Date('2026-11-07T12:05:00.000Z'),
    );
  });

  test('is now without or with a past waitUntil', () => {
    expect(dueAt({ id: 1 }, now)).toBe('now');
    // oxlint-disable-next-line unicorn/no-null -- Payload clears `waitUntil` with `null`
    expect(dueAt({ id: 1, waitUntil: null }, now)).toBe('now');
    expect(dueAt({ id: 1, waitUntil: '2026-11-07T12:00:00.000Z' }, now)).toBe('now');
  });

  test('is undefined for jobs Payload no longer runs', () => {
    const waitUntil = '2026-11-07T12:05:00.000Z';
    expect(dueAt({ id: 1, waitUntil, completedAt: waitUntil }, now)).toBeUndefined();
    expect(dueAt({ id: 1, waitUntil, processing: true }, now)).toBeUndefined();
    expect(dueAt({ id: 1, waitUntil, hasError: true }, now)).toBeUndefined();
    // oxlint-disable-next-line unicorn/no-null -- `findByID` returns `null` for missing documents
    expect(dueAt(null, now)).toBeUndefined();
  });
});

test('scheduleAt and scheduleName use the UTC minute', () => {
  const at = new Date('2026-11-07T09:05:00.000Z');
  expect(scheduleAt(at)).toBe('2026-11-07T09:05');
  expect(scheduleName('payload-job', 'a1b2', at)).toBe('payload-job-a1b2-202611070905');
  expect(scheduleName('payload-job', 'a1b2', at)).toMatch(/^[0-9A-Za-z][0-9A-Za-z._-]*$/);
});

describe('createJobSchedule', () => {
  const at = new Date('2026-11-07T12:05:00.000Z');

  test('creates a one-time UTC schedule that publishes the job ID', async () => {
    const client = mockClient();
    await createJobSchedule(options(client), silentLogger, 'job', at);

    expect(client.create).toHaveBeenCalledWith({
      name: 'payload-job-job-202611071205',
      namespace: undefined,
      expression: { type: 'single', at: '2026-11-07T12:05' },
      timezone: 'UTC',
      target: { topic: 'payload-jobs' },
      payload: { jobId: 'job' },
    });
  });

  test('accepts an existing schedule', async () => {
    const client = mockClient({ create: ['schedule_already_exists'] });
    silentLogger.error.mockClear();
    await createJobSchedule(options(client), silentLogger, 'job', at);
    expect(silentLogger.error).not.toHaveBeenCalled();
  });

  test('moves to the next minute when the minute passed meanwhile', async () => {
    const client = mockClient({ create: ['single_at_in_past'] });
    await createJobSchedule(options(client), silentLogger, 'job', at);
    expect(client.create).toHaveBeenCalledTimes(2);
    expect(client.create.mock.calls[1]?.[0].expression).toEqual({
      type: 'single',
      at: '2026-11-07T12:06',
    });
  });

  test('logs other errors instead of throwing', async () => {
    const client = mockClient({ create: ['not_enabled'] });
    silentLogger.error.mockClear();
    await createJobSchedule(options(client), silentLogger, 'job', at);
    expect(silentLogger.error).toHaveBeenCalledTimes(1);
  });
});

test('deleteJobSchedule ignores schedules that are gone or firing', async () => {
  const at = new Date('2026-11-07T12:05:00.000Z');
  const client = mockClient({ delete: ['not_found', 'schedule_single_at_passed'] });
  silentLogger.warn.mockClear();

  await deleteJobSchedule(options(client), silentLogger, 'job', at);
  await deleteJobSchedule(options(client), silentLogger, 'job', at);

  expect(client.delete).toHaveBeenCalledWith({
    name: 'payload-job-job-202611071205',
    namespace: undefined,
  });
  expect(silentLogger.warn).not.toHaveBeenCalled();
});
