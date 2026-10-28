# @lhechenberger/check-links

## 0.3.0

### Minor Changes

- [#11](https://github.com/LukasHechenberger/workbench/pull/11) [`8e4cfa4`](https://github.com/LukasHechenberger/workbench/commit/8e4cfa4664bdc0974a8ee1927777b3d22bcc4963) - Ship a compiled build (ESM plus type declarations) instead of TypeScript source, so the package runs on Node.js 22.18+ as well as Bun.

  The CLI now also finds a `check-links.config.mts`, `.js` or `.mjs` in the working directory, not just `.ts`.

- [#12](https://github.com/LukasHechenberger/workbench/pull/12) [`dfd8374`](https://github.com/LukasHechenberger/workbench/commit/dfd837469c239cb849a4811b0be729e674e83c15) - Add a `--version` (`-v`) option to the CLI, and list all options in the `--help` output.

## 0.2.2

### Patch Changes

- [#8](https://github.com/LukasHechenberger/workbench/pull/8) [`225518e`](https://github.com/LukasHechenberger/workbench/commit/225518e919475518dd080c6b76145f40eb543d1a) - Import files inside the package without the `.ts` extension, so projects that type-check their `check-links.config.ts` don't get TS5097 from the package's source. Document the type-checking and knip setup.

## 0.2.1

### Patch Changes

- 46e0fb7: License the package under MIT.

## 0.2.0

### Minor Changes

- 731bed9: Initial release: broken-link crawler with flaky-link detection, Vercel protection bypass and a GitHub workflow template.
