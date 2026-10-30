// Runs the whole check against a local server standing in for a deployment whose pages link to
// the live site (canonical and hreflang URLs), the way a site on Vercel does.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test';
import { run } from './run';

const production = 'https://www.example.com';

const page = (body: string) => `<!doctype html><html><head>${body}</head><body></body></html>`;
/** The deployment's pages; `self` is its own origin */
const pages = (self: string): Record<string, string> => ({
  // A page whose canonical and hreflang URLs point at the live site, where /en/new doesn't exist yet
  '/new': page(
    `<link rel="canonical" href="${production}/new">
     <link rel="alternate" hreflang="en" href="${production}/en/new">
     <a href="${production}/">home</a>`,
  ),
  '/en/new': page(`<link rel="canonical" href="${production}/en/new">`),
  // Links to the live site that are broken on the deployment too
  '/broken': page(
    `<link rel="canonical" href="${production}/missing">
     <a href="${production}/skipped">skipped</a>
     <a href="/new">new</a>`,
  ),
  // A broken absolute link to the deployment itself
  '/self-broken': page(`<link rel="canonical" href="${self}/missing">`),
  '/': page('<a href="/new">new</a>'),
});

let server: ReturnType<typeof Bun.serve>;
let requests: { path: string; bypass: string | null }[] = [];
let output: string[] = [];
let log: ReturnType<typeof spyOn>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const { pathname } = new URL(request.url);
      requests.push({ path: pathname, bypass: request.headers.get('x-vercel-protection-bypass') });
      const body = pages(new URL(request.url).origin)[pathname];
      return body
        ? new Response(body, { headers: { 'content-type': 'text/html' } })
        : new Response('not found', { status: 404 });
    },
  });
});

afterAll(() => {
  void server.stop(true);
});

beforeEach(() => {
  requests = [];
  output = [];
  log = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.join(' '));
  });
});

afterEach(() => {
  log.mockRestore();
});

const origin = () => server.url.origin;
const url = (path: string) => `${origin()}${path}`;

describe('run with productionOrigin', () => {
  test('checks links to the live site on the deployment', async () => {
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'test-bypass';
    try {
      const exitCode = await run(url('/new'), { productionOrigin: production, retryAfterMs: 0 });
      expect(output.at(-1)).toContain('0 broken, 0 warnings');
      expect(exitCode).toBe(0);
    } finally {
      delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    }

    // The links to the live site were requested on the deployment, with the bypass header
    const toLiveSite = requests.filter(({ path }) => path === '/en/new' || path === '/');
    expect(toLiveSite.map(({ path }) => path).toSorted()).toEqual(['/', '/en/new']);
    expect(toLiveSite.every(({ bypass }) => bypass === 'test-bypass')).toBe(true);
  });

  test('reports a link that is broken on the deployment as written, with the requested URL', async () => {
    const exitCode = await run(url('/broken'), {
      productionOrigin: production,
      retryAfterMs: 0,
      skip: ['/skipped$'],
    });

    expect(exitCode).toBe(1);
    const report = output.join('\n');
    expect(report).toContain(
      `[404] ${production}/missing (checked as ${origin()}/missing)\n    on ${url('/broken')}`,
    );
    expect(output.at(-1)).toContain('1 broken, 0 warnings');
    expect(requests.map(({ path }) => path)).not.toContain('/skipped');
  });

  test('passes the link as written and the requested URL to isWarningOnly', async () => {
    const seen: [string, string][] = [];
    const exitCode = await run(url('/broken'), {
      productionOrigin: production,
      retryAfterMs: 0,
      skip: ['/skipped$'],
      isWarningOnly: (link, { requestUrl }) => {
        seen.push([link.url, requestUrl]);
        return true;
      },
    });

    expect(exitCode).toBe(0);
    expect(new Set(seen.map((pair) => pair.join(' ')))).toEqual(
      new Set([`${production}/missing ${url('/missing')}`]),
    );
    expect(output.at(-1)).toContain('0 broken, 1 warnings');
  });

  test('does nothing when the checked origin is the production origin', async () => {
    const exitCode = await run(url('/self-broken'), {
      productionOrigin: origin(),
      retryAfterMs: 0,
    });

    expect(exitCode).toBe(1);
    expect(output.join('\n')).toContain(`[404] ${url('/missing')}\n    on ${url('/self-broken')}`);
    expect(output.join('\n')).not.toContain('checked as');
  });
});
