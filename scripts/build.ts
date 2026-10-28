// Builds the package in the current directory into `dist/`: ESM bundles for Node and Bun (via the
// Bun bundler, dependencies stay external) plus type declarations (via tsc).
import { readFileSync, rmSync } from 'node:fs';

const pkg: { bin?: Record<string, string> } = JSON.parse(readFileSync('package.json', 'utf8'));

rmSync('dist', { recursive: true, force: true });

const entrypoints = [
  'src/index.ts',
  ...Object.values(pkg.bin ?? {}).map((bin) =>
    bin.replace(/^dist\//, 'src/').replace(/\.js$/, '.ts'),
  ),
];

const result = await Bun.build({
  entrypoints,
  outdir: 'dist',
  root: 'src',
  target: 'node',
  format: 'esm',
  packages: 'external',
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const tsc = Bun.spawnSync(['bunx', 'tsc', '-p', 'tsconfig.build.json'], {
  stdio: ['inherit', 'inherit', 'inherit'],
});
process.exit(tsc.exitCode);
