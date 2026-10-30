import { describe, expect, test } from 'bun:test';
import { type LinkResult, LinkState } from 'linkinator';
import { checkRewrittenLinks, createRewrite } from './production-origin';

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

const skipped = (url: string, parent: string): LinkResult => ({
  url,
  parent,
  state: LinkState.SKIPPED,
});

describe('checkRewrittenLinks', () => {
  const rewrite = createRewrite(deployment, 'https://www.example.com');

  test('requests each link once on the checked origin and reports it as written', async () => {
    const requested: string[] = [];
    const results = await checkRewrittenLinks(
      [
        skipped('https://www.example.com/new', 'https://my-app-abc123.vercel.app/'),
        skipped('https://www.example.com/new#top', 'https://my-app-abc123.vercel.app/about'),
        skipped('https://www.example.com/missing', 'https://my-app-abc123.vercel.app/'),
        skipped('https://www.example.com/missing', 'https://my-app-abc123.vercel.app/about'),
        skipped('https://www.example.com/down', 'https://my-app-abc123.vercel.app/'),
        skipped('https://www.instagram.com/example', 'https://my-app-abc123.vercel.app/'),
      ],
      rewrite,
      async (url) => {
        requested.push(url);
        if (url.endsWith('/new')) return 200;
        if (url.endsWith('/missing')) return 404;
        return undefined;
      },
      10,
    );

    expect(requested).toEqual([
      'https://my-app-abc123.vercel.app/new',
      'https://my-app-abc123.vercel.app/missing',
      'https://my-app-abc123.vercel.app/down',
    ]);
    expect(results).toEqual([
      {
        url: 'https://www.example.com/new',
        parent: 'https://my-app-abc123.vercel.app/',
        status: 200,
        state: LinkState.OK,
      },
      {
        url: 'https://www.example.com/missing',
        parent: 'https://my-app-abc123.vercel.app/',
        status: 404,
        state: LinkState.BROKEN,
      },
      {
        url: 'https://www.example.com/missing',
        parent: 'https://my-app-abc123.vercel.app/about',
        status: 404,
        state: LinkState.BROKEN,
      },
      {
        url: 'https://www.example.com/down',
        parent: 'https://my-app-abc123.vercel.app/',
        status: undefined,
        state: LinkState.BROKEN,
      },
    ]);
  });

  test('limits the parallel requests', async () => {
    let running = 0;
    let max = 0;
    await checkRewrittenLinks(
      Array.from({ length: 12 }, (_, i) => skipped(`https://www.example.com/${i}`, deployment)),
      rewrite,
      async () => {
        max = Math.max(max, ++running);
        await new Promise((resolve) => setTimeout(resolve, 1));
        running--;
        return 200;
      },
      5,
    );
    expect(max).toBeLessThanOrEqual(5);
  });
});
