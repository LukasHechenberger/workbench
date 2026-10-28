// Runs the built CLI (`dist/cli.js`) under Node.js, the way a consumer without Bun does, against a
// local server. Covers what the unit tests can't: the compiled bundle, the shebang and loading a
// `check-links.config.ts` through Node's native type stripping.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const packageDir = join(import.meta.dir, '..');
const cli = join(packageDir, 'dist/cli.js');

const pages: Record<string, string> = {
  '/': '<a href="/ok">ok</a> <a href="/missing">missing</a> <a href="/skipped">skipped</a>',
  '/ok': '<p>fine</p>',
};

let server: ReturnType<typeof Bun.serve>;
let workDir: string;

beforeAll(async () => {
  // `turbo run test:integration` builds first; running `bun test integration` alone needs `bun run build`
  if (!existsSync(cli)) throw new Error(`${cli} not found, run \`bun run build\` first`);

  server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const page = pages[new URL(request.url).pathname];
      return page
        ? new Response(page, { headers: { 'content-type': 'text/html' } })
        : new Response('not found', { status: 404 });
    },
  });
  workDir = mkdtempSync(join(tmpdir(), 'check-links-node-'));
});

afterAll(() => {
  void server.stop(true);
  rmSync(workDir, { recursive: true, force: true });
});

/** Runs the CLI with Node.js in `workDir`; `--experimental-strip-types` is a no-op on Node 22.18+. */
const runNode = async (args: string[], cwd = workDir) => {
  const proc = Bun.spawn(['node', '--experimental-strip-types', cli, ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
};

const writeConfig = (name: string, source: string) => {
  const path = join(workDir, name);
  writeFileSync(path, source);
  return path;
};

describe('check-links under Node.js', () => {
  test('prints the usage', async () => {
    const { stdout, exitCode } = await runNode(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
  });

  test('fails with exit code 1 for a broken link', async () => {
    const config = writeConfig(
      'broken.config.ts',
      `export default { retryAfterMs: 0, skip: ['/skipped$'] };\n`,
    );
    const { stdout, exitCode } = await runNode([server.url.href, '--config', config]);
    expect(stdout).toContain('1 broken, 0 warnings');
    expect(exitCode).toBe(1);
  });

  test('loads a TypeScript config with types and takes the url from it', async () => {
    const config = writeConfig(
      'typed.config.ts',
      `import type { CheckLinksConfig } from '${join(packageDir, 'dist/config')}';

const config: CheckLinksConfig = {
  url: '${server.url.href}',
  retryAfterMs: 0,
  skip: ['/missing$', '/skipped$'],
};

export default config;
`,
    );
    const { stdout, stderr, exitCode } = await runNode(['--config', config]);
    expect(stderr).not.toContain('ERR_');
    expect(stdout).toContain('0 broken, 0 warnings');
    expect(exitCode).toBe(0);
  });

  test('finds a check-links.config.mjs in the working directory', async () => {
    const dir = mkdtempSync(join(workDir, 'mjs-'));
    writeFileSync(
      join(dir, 'check-links.config.mjs'),
      `export default { url: '${server.url.href}', retryAfterMs: 0, skip: ['/missing$', '/skipped$'] };\n`,
    );
    const { stdout, exitCode } = await runNode([], dir);
    expect(stdout).toContain('0 broken, 0 warnings');
    expect(exitCode).toBe(0);
  });
});
