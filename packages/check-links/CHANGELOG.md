# @lhechenberger/check-links

## 0.4.2

### Patch Changes

- [#23](https://github.com/LukasHechenberger/workbench/pull/23) [`411b6c0`](https://github.com/LukasHechenberger/workbench/commit/411b6c0a5447e2e283e72ec262bdd1641f7c3289) - Make the package's own requests (links to other sites, links to a production origin, second requests) with undici's `fetch`, the one the crawler uses, instead of the runtime's. On Node 22 the crawler's undici registers its dispatcher globally and the built-in fetch (an older undici) then received responses without headers, so no redirect was followed and every redirecting link was reported broken with its 3xx status.

## 0.4.1

### Patch Changes

- [#21](https://github.com/LukasHechenberger/workbench/pull/21) [`ec51388`](https://github.com/LukasHechenberger/workbench/commit/ec51388eeaf3fe65d48cb3fe71f9f25d4dbe3069) - Let the runtime follow redirects for requests that carry no bypass header (links to other sites), and apply `timeout` to the requests the package makes itself. Requests to the checked origin keep following redirects one hop at a time, so the bypass secret never travels to another origin. Set `CHECK_LINKS_DEBUG=1` to log those requests hop by hop.

## 0.4.0

### Minor Changes

- [#19](https://github.com/LukasHechenberger/workbench/pull/19) [`14dd10e`](https://github.com/LukasHechenberger/workbench/commit/14dd10e35c09138f0c642be2ed0afc78f976f01e) - Add the `productionOrigin` option: links to the live site's origin (canonical and hreflang URLs, `og:url`, …) are requested on the origin being checked instead, so a deployment that adds a route doesn't fail because the route doesn't exist on the live site yet. Accepts one origin or an array, and does nothing when the checked origin is one of them. Broken links are still reported as written on the page, with the requested URL (`… (checked as …)`), and `isWarningOnly` gets that URL as `requestUrl` in its context.

### Patch Changes

- [#20](https://github.com/LukasHechenberger/workbench/pull/20) [`77a476a`](https://github.com/LukasHechenberger/workbench/commit/77a476adb2e379e3ea53a9f116dfc2d4c62d7794) - Never send the deployment protection bypass secret (`x-vercel-protection-bypass`) to other sites. The crawler sent it with every request, third parties included; now it only requests the checked origin, links to other sites are requested after the crawl without the header, and redirects are followed one hop at a time so a page that redirects elsewhere doesn't carry it along.

- [#17](https://github.com/LukasHechenberger/workbench/pull/17) [`1423520`](https://github.com/LukasHechenberger/workbench/commit/1423520718efdd018760ba2683913fe0c1982f33) - The `init-workflow` template now reports the result as a commit status ("Broken Links") on the deployed commit instead of a check run, and writes the full output to the run's job summary. A check run created through the API joins an existing GitHub Actions check suite on the commit, and when that suite is superseded (e.g. a run cancelled by a concurrency rule after GitHub delivered the `pull_request` event twice), the merge box never sees it and a required check stays "expected", blocking auto-merge. A status is attached to the commit itself, so it works as a required status check in branch rulesets; the workflow needs `statuses: write` instead of `checks: write`.

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
