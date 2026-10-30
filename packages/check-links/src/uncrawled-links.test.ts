import { describe, expect, test } from 'bun:test';
import { type LinkResult, LinkState } from 'linkinator';
import { createRewrite } from './production-origin';
import { checkUncrawledLinks } from './uncrawled-links';

const deployment = 'https://my-app-abc123.vercel.app/';
const rewrite = createRewrite(deployment, 'https://www.example.com');
const requestUrl = (link: string) => rewrite(link) ?? link;

const skipped = (url: string, parent: string): LinkResult => ({
  url,
  parent,
  state: LinkState.SKIPPED,
});

describe('checkUncrawledLinks', () => {
  test('requests each link once, rewritten if needed, and reports it as written', async () => {
    const requested: string[] = [];
    const results = await checkUncrawledLinks(
      [
        skipped('https://www.example.com/new', 'https://my-app-abc123.vercel.app/'),
        skipped('https://www.example.com/new#top', 'https://my-app-abc123.vercel.app/about'),
        skipped('https://www.example.com/missing', 'https://my-app-abc123.vercel.app/'),
        skipped('https://www.example.com/missing', 'https://my-app-abc123.vercel.app/about'),
        skipped('https://www.example.com/down', 'https://my-app-abc123.vercel.app/'),
        skipped('https://www.instagram.com/example', 'https://my-app-abc123.vercel.app/'),
      ],
      requestUrl,
      async (url) => {
        requested.push(url);
        if (url.endsWith('/new') || url.endsWith('/example')) return 200;
        if (url.endsWith('/missing')) return 404;
        return undefined;
      },
      10,
    );

    expect(requested).toEqual([
      'https://my-app-abc123.vercel.app/new',
      'https://my-app-abc123.vercel.app/missing',
      'https://my-app-abc123.vercel.app/down',
      'https://www.instagram.com/example',
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
      {
        url: 'https://www.instagram.com/example',
        parent: 'https://my-app-abc123.vercel.app/',
        status: 200,
        state: LinkState.OK,
      },
    ]);
  });

  test('limits the parallel requests', async () => {
    let running = 0;
    let max = 0;
    await checkUncrawledLinks(
      Array.from({ length: 12 }, (_, i) => skipped(`https://www.example.com/${i}`, deployment)),
      requestUrl,
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
