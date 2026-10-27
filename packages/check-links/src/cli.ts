#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { CheckLinksConfig } from './config';
import { run } from './run';

const usage = `Usage:
  check-links [url] [options]           Crawls the site and reports broken links
  check-links init-workflow [path]      Writes the GitHub workflow template (default .github/workflows/broken-links.yml)

Options:
  --config <file>   Config file (default: check-links.config.{ts,mts,js,mjs} in the working directory)
  -v, --version     Print the version
  -h, --help        Print this help

Environment:
  VERCEL_AUTOMATION_BYPASS_SECRET   Deployment protection bypass secret, sent to the checked origin`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
});

if (values.help) {
  console.log(usage);
  process.exit(0);
}

if (values.version) {
  const pkg: { version: string } = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  console.log(pkg.version);
  process.exit(0);
}

if (positionals[0] === 'init-workflow') {
  const target = resolve(positionals[1] ?? '.github/workflows/broken-links.yml');
  if (existsSync(target)) {
    console.error(`${target} exists already`);
    process.exit(1);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(
    target,
    readFileSync(new URL('../templates/broken-links.yml', import.meta.url), 'utf8'),
  );
  console.log(`Wrote ${target}. See the README for the setup it needs.`);
  process.exit(0);
}

const configExtensions = ['ts', 'mts', 'js', 'mjs'];
const configPath = values.config
  ? resolve(values.config)
  : configExtensions.map((ext) => resolve(`check-links.config.${ext}`)).find((p) => existsSync(p));
let config: CheckLinksConfig = {};
if (configPath && existsSync(configPath)) {
  const loaded: { default: CheckLinksConfig } = await import(configPath);
  config = loaded.default;
} else if (configPath) {
  console.error(`Config ${configPath} not found`);
  process.exit(1);
}

const url = positionals[0] ?? config.url;
if (!url) {
  console.error(`No URL given.\n\n${usage}`);
  process.exit(1);
}

process.exit(await run(url, config));
