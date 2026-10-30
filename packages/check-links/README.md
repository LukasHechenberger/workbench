# @lhechenberger/check-links

Crawls a deployed site for broken links and tells real failures apart from flaky ones. Made for CI checks against Vercel preview deployments, built on [linkinator](https://github.com/JustinBeckwith/linkinator).

Fresh deployments answer some first requests with errors: image optimization (`/_next/image?url=…`) from a function that has just started often returns `400`, hundreds of URLs at once. A plain crawl fails on these. This tool:

1. crawls the site (with linkinator's own retries for 5xx and network errors),
2. waits a few seconds,
3. requests every broken link **again, at low concurrency**,
4. reports links that work now as **warnings** ("flaky") and only fails (exit code `1`) for links that are still broken.

It also handles Vercel's deployment protection (bypass header, and a check that the start URL isn't the login page) and can downgrade known-unfixable links (e.g. third-party content) to warnings.

Works with Node.js (22.18 or newer) and [Bun](https://bun.sh). The package ships a compiled build (`dist`) with type declarations. A config file is loaded natively by both runtimes, as TypeScript (`.ts`; Node strips the types itself from 22.18 on) or plain JavaScript (`.mjs`).

## Install

```bash
bun add -d @lhechenberger/check-links
# or
npm install --save-dev @lhechenberger/check-links
```

## Usage

```bash
bunx check-links https://my-preview.example.vercel.app
bunx check-links                      # uses `url` from the config, e.g. the local dev server
bunx check-links <url> --config ci/check-links.config.ts
bunx check-links --version            # prints the installed version
bunx check-links --help               # lists the commands and options
```

With npm use `npx check-links …` instead of `bunx check-links …`.

Set `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel project → Deployment Protection → Protection Bypass for Automation) to check protected deployments. The secret is sent as `x-vercel-protection-bypass` header with every request to the checked origin, and never to other sites: the crawler only requests the checked origin, links to other sites are requested after the crawl without the header, and requests that carry the header follow redirects one hop at a time so a page that redirects elsewhere doesn't carry it along.

Set `CHECK_LINKS_DEBUG=1` to log the requests the package makes itself (links to other sites, links to a production origin, second requests), one line per hop with status and redirect target, on stderr.

The last line of the output is a one-line summary (`Checked N links on <origin>: X broken, Y warnings`); the exit code is `1` if `X > 0`.

## Configuration

Optional config file in the working directory. Without `--config`, the first of `check-links.config.ts`, `.mts`, `.js` and `.mjs` that exists is used (`--config <file>` takes any path). The default export is the configuration:

```ts
import { defineConfig } from '@lhechenberger/check-links';

export default defineConfig({
  url: 'http://localhost:3000',
  // Links to the live site are checked on the deployment under test (see below)
  productionOrigin: 'https://www.example.com',
  // Never checked. Strings are regular expression sources.
  skip: [/^https:\/\/www\.instagram\.com\//, String.raw`^https://example\.org/`],
  // Broken links that must not fail the check, e.g. content you can't fix. Not re-requested.
  isWarningOnly: (link, { origin, url, requestUrl }) =>
    !requestUrl.startsWith(origin) && new URL(link.parent ?? url).pathname.startsWith('/docs/'),
  warningTitle: 'Broken links in embedded READMEs',
  retryAfterMs: 5000, // wait before the second request
  recheckConcurrency: 5, // parallel second requests
  concurrency: 20, // parallel requests of the crawl
  timeout: 30_000,
});
```

| Option               | Default | Description                                                                 |
| -------------------- | ------- | --------------------------------------------------------------------------- |
| `url`                | –       | Used when no URL is passed on the command line                              |
| `productionOrigin`   | –       | Origin(s) of the live site; links to them are checked on the checked origin |
| `skip`               | `[]`    | Links not to check                                                          |
| `isWarningOnly`      | –       | `(link, { origin, url, requestUrl }) => boolean`                            |
| `warningTitle`       | generic | Heading for the `isWarningOnly` links                                       |
| `retryAfterMs`       | `5000`  | Wait before broken links are requested a second time                        |
| `recheckConcurrency` | `5`     | Parallel second requests; keep low (see above)                              |
| `concurrency`        | `20`    | Parallel requests of the crawl                                              |
| `timeout`            | `30000` | Timeout per request in ms                                                   |

### Links to the live site (`productionOrigin`)

Pages usually carry absolute links to the live site: `<link rel="canonical">`, `hreflang` alternates, `og:url`, JSON-LD. On a deployment that isn't live yet they point at the _previous_ build, so a new route is reported as broken although it works on the deployment, and a production deployment whose check must pass before it gets its domain can never be promoted. With `productionOrigin` set to the live site's origin, such links are requested on the origin being checked instead:

- A link is rewritten only if its origin is exactly a configured origin (`https://www.example.com/x` for `https://www.example.com`, not `https://example.com/x` or `https://www.example.com.evil.test/x`). Only the origin of the configured value is used; several origins are accepted as an array (e.g. one per locale).
- The option does nothing when the origin being checked is one of the configured origins, so the same config works for checking the live site.
- The rewritten requests get the `x-vercel-protection-bypass` header like all other requests to the checked origin.
- The links are requested after the crawl like links to other sites, not crawled: a page that is linked only by its live URL isn't followed.
- Broken links are reported as written on the page, with the URL that was requested: `[404] https://www.example.com/x (checked as https://my-app-abc123.vercel.app/x)`.
- `skip` patterns and `isWarningOnly` see the link as written on the page; `isWarningOnly` gets the requested URL as `requestUrl` in its context (for a link that isn't rewritten it's the link itself).

In a JavaScript config (`check-links.config.mjs`, or `.js` in a package with `"type": "module"`) use the same code without type annotations; `defineConfig` still gives editors the types:

```js
import { defineConfig } from '@lhechenberger/check-links';

export default defineConfig({ url: 'http://localhost:3000', retryAfterMs: 1000 });
```

### Type-checking and unused-file tools

- The package ships compiled JavaScript with type declarations, so a project that type-checks its `check-links.config.ts` (e.g. listed in `tsconfig.json` `include`) needs no special `moduleResolution`. The declarations reference Node types (`@types/node` or `@types/bun`) since the code uses `process`.
- [knip](https://knip.dev) reports the config as an unused file. Declare it as an entry in `knip.json`: `{ "workspaces": { "apps/web": { "entry": ["check-links.config.ts"] } } }` (use `"entry"` at the top level in a single-package repo).

## GitHub workflow: check every Vercel deployment

The package contains a workflow template that runs the check when Vercel reports a ready deployment, reports the result as a **"Broken Links" commit status** on the deployed commit (so it appears on the pull request and can be a required status check in branch rulesets) and reports the commit status that Vercel's Deployment Checks can require before a production deployment gets its domain. The status only has a one-line description; the full output is in the job summary of the workflow run the status links to.

The result is a commit status rather than a check run on purpose: a check run created through the API joins an existing GitHub Actions check suite on the commit, and when that suite is superseded (GitHub sometimes delivers the `pull_request` event twice for one push, and a concurrency rule cancels the first run), the merge box never sees the check run and a required check stays "expected" forever. A status is attached to the commit itself. Don't name a job "Broken Links": a check run with the same name as a required status would have to pass as well.

```bash
bunx check-links init-workflow          # writes .github/workflows/broken-links.yml
```

Setup:

1. Add the repository secret `VERCEL_AUTOMATION_BYPASS_SECRET` (same value as in the Vercel project's protection bypass).
2. In Vercel, enable Deployment Checks / the `repository_dispatch` events for the project, so it sends `vercel.deployment.ready`.
3. Commit the workflow to the **default branch** (GitHub runs `repository_dispatch` workflows only from there).
4. Adjust the "Check for broken links" step if the package isn't a dependency of the repository root (e.g. `bun --cwd=apps/web run …`), and optionally remove the "Report to Vercel" step.
5. Run it once by hand: Actions → Broken Links → Run workflow, with a deployment URL.

Without the secret, production deployments fail the job (they would be held back anyway) and previews are skipped with a warning; a skipped preview still reports a successful status, so a required status check doesn't hold the pull request back. Manual runs (`workflow_dispatch`) report no status, since GitHub never counts them for a pull request.

## Local development of the checks

`bun run test` (Turborepo, from the repository root) builds the package and runs

- the unit tests (`test`: the classification into flaky and real errors, the `productionOrigin` rewrite, and the whole check against a local server), in parallel to the build, and
- once built, an integration test (`test:integration`, `integration/node.test.ts`) that runs the compiled CLI **with Node.js** against a local server: the usage output, the exit code for a broken link, a TypeScript `check-links.config.ts` loaded through Node's native type stripping, and a `check-links.config.mjs` found in the working directory. It needs `node` on the `PATH` (22.18 or newer, or any Node.js with `--experimental-strip-types`) and makes no network requests.

To check by hand which Node.js versions work, run `bun run build` and then `node dist/cli.js <url>` with that version (e.g. `npx node@22.18 dist/cli.js <url>`).

## Programmatic API

```ts
import { classify, run, defineConfig } from '@lhechenberger/check-links';
```

`run(url, config)` crawls and prints, and resolves to the exit code; `classify` is the pure part that sorts broken links into `errors`, `flaky` and `warnings`.

## License

[MIT](LICENSE)
