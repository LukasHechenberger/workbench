import { describe, expect, test } from 'bun:test';
import { type LinkResult, LinkState } from 'linkinator';
import { classify } from './classify';

const link = (url: string): LinkResult => ({ url, state: LinkState.BROKEN, status: 400 });

describe('classify', () => {
  test('sorts links by what happens on the second request', async () => {
    const result = await classify([link('/a'), link('/b'), link('/c')], {
      isWarningOnly: (l) => l.url === '/c',
      recovers: async (l) => l.url === '/a',
      wait: async () => {},
      concurrency: 2,
    });
    expect(result.flaky.map((l) => l.url)).toEqual(['/a']);
    expect(result.errors.map((l) => l.url)).toEqual(['/b']);
    expect(result.warnings.map((l) => l.url)).toEqual(['/c']);
  });

  test('does not wait or re-request when there are only warnings', async () => {
    let waited = false;
    const result = await classify([link('/c')], {
      isWarningOnly: () => true,
      recovers: async () => {
        throw new Error('should not be called');
      },
      wait: async () => {
        waited = true;
      },
      concurrency: 5,
    });
    expect(waited).toBe(false);
    expect(result.warnings).toHaveLength(1);
  });

  test('limits the parallel second requests', async () => {
    let running = 0;
    let max = 0;
    await classify(
      Array.from({ length: 12 }, (_, i) => link(`/${i}`)),
      {
        isWarningOnly: () => false,
        recovers: async () => {
          max = Math.max(max, ++running);
          await new Promise((resolve) => setTimeout(resolve, 1));
          running--;
          return true;
        },
        wait: async () => {},
        concurrency: 5,
      },
    );
    expect(max).toBeLessThanOrEqual(5);
  });
});
