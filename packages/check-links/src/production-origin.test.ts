import { describe, expect, test } from 'bun:test';
import { createRewrite } from './production-origin';

const deployment = 'https://my-app-abc123.vercel.app/';

describe('createRewrite', () => {
  const rewrite = createRewrite(deployment, 'https://www.example.com');

  test('maps links to the production origin onto the checked origin', () => {
    expect(rewrite('https://www.example.com/products/new?page=2')).toBe(
      'https://my-app-abc123.vercel.app/products/new?page=2',
    );
    expect(rewrite('https://www.example.com')).toBe('https://my-app-abc123.vercel.app/');
  });

  test('leaves links to other origins alone', () => {
    expect(rewrite('https://images.example.net/photo.jpg')).toBeUndefined();
    expect(rewrite('https://www.example.com.evil.test/x')).toBeUndefined();
    expect(rewrite('https://example.com/x')).toBeUndefined();
    expect(rewrite('http://www.example.com/x')).toBeUndefined();
    expect(rewrite('https://my-app-abc123.vercel.app/x')).toBeUndefined();
    expect(rewrite('mailto:hello@example.com')).toBeUndefined();
    expect(rewrite('not a url')).toBeUndefined();
  });

  test('is a no-op when the checked origin is the production origin', () => {
    const live = createRewrite('https://www.example.com/start', 'https://www.example.com');
    expect(live('https://www.example.com/x')).toBeUndefined();
  });

  test('is a no-op when the checked origin is one of several production origins', () => {
    const live = createRewrite('https://www.example.com/', [
      'https://www.example.com',
      'https://www.example.de',
    ]);
    expect(live('https://www.example.de/x')).toBeUndefined();
  });

  test('accepts several production origins', () => {
    const multi = createRewrite(deployment, ['https://www.example.com', 'https://www.example.de']);
    expect(multi('https://www.example.de/de/x')).toBe('https://my-app-abc123.vercel.app/de/x');
    expect(multi('https://www.example.com/x')).toBe('https://my-app-abc123.vercel.app/x');
    expect(multi('https://www.example.at/x')).toBeUndefined();
  });

  test('uses only the origin of the configured value', () => {
    const withPath = createRewrite(deployment, 'https://www.example.com/some/page?q=1');
    expect(withPath('https://www.example.com/x')).toBe('https://my-app-abc123.vercel.app/x');
  });

  test('rejects values that are not URLs', () => {
    expect(() => createRewrite(deployment, 'www.example.com')).toThrow(
      'productionOrigin "www.example.com" is not a URL',
    );
  });

  test('does nothing without the option', () => {
    expect(createRewrite(deployment)('https://www.example.com/x')).toBeUndefined();
  });
});
