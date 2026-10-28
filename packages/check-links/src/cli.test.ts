import { expect, test } from 'bun:test';
import { version } from '../package.json';

const cli = new URL('./cli.ts', import.meta.url).pathname;

for (const flag of ['--version', '-v']) {
  test(`${flag} prints the package version`, async () => {
    const proc = Bun.spawn(['bun', cli, flag], { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    expect(stdout.trim()).toBe(version);
    expect(exitCode).toBe(0);
  });
}

for (const flag of ['--help', '-h']) {
  test(`${flag} prints the usage and exits successfully`, async () => {
    const proc = Bun.spawn(['bun', cli, flag], { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    expect(stdout).toStartWith('Usage:');
    for (const option of ['--config', '--version', '--help', 'init-workflow']) {
      expect(stdout).toContain(option);
    }
    expect(exitCode).toBe(0);
  });
}
