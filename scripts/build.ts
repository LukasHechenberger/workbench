// Builds the package in the current directory into `dist/`: ESM bundles for Node and Bun (via the
// Bun bundler, dependencies stay external) plus type declarations (via tsc).
import { readFileSync, rmSync } from 'node:fs';

const pkg: {
  bin?: Record<string, string>;
  exports?: Record<string, { default?: string }>;
} = JSON.parse(readFileSync('package.json', 'utf8'));

rmSync('dist', { recursive: true, force: true });

// Every `bin` and `exports` entry, from its `dist/*.js` path
const toSource = (path: string) => path.replace(/^(\.\/)?dist\//, 'src/').replace(/\.js$/, '.ts');
const entrypoints = [
  ...new Set([
    'src/index.ts',
    ...Object.values(pkg.bin ?? {}).map(toSource),
    ...Object.values(pkg.exports ?? {}).flatMap((entry) =>
      entry.default ? [toSource(entry.default)] : [],
    ),
  ]),
];

const result = await Bun.build({
  entrypoints,
  outdir: 'dist',
  root: 'src',
  target: 'node',
  format: 'esm',
  packages: 'external',
  // Entry points share their common modules (one copy of each, in a chunk)
  splitting: true,
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const tsc = Bun.spawnSync(['bunx', 'tsc', '-p', 'tsconfig.build.json'], {
  stdio: ['inherit', 'inherit', 'inherit'],
});
process.exit(tsc.exitCode);
