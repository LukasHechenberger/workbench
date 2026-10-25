# @lhechenberger/check-links

Crawls a deployed site for broken links and tells real failures apart from flaky ones. Made for CI checks against Vercel preview deployments, built on [linkinator](https://github.com/JustinBeckwith/linkinator).

Fresh deployments answer some first requests with errors: image optimization (`/_next/image?url=…`) from a function that has just started often returns `400`, hundreds of URLs at once. A plain crawl fails on these. This tool:

1. crawls the site (with linkinator's own retries for 5xx and network errors),
2. waits a few seconds,
3. requests every broken link **again, at low concurrency**,
4. reports links that work now as **warnings** ("flaky") and only fails (exit code `1`) for links that are still broken.

It also handles Vercel's deployment protection (bypass header, and a check that the start URL isn't the login page) and can downgrade known-unfixable links (e.g. third-party content) to warnings.

Requires [Bun](https://bun.sh) (the package ships TypeScript source and runs with a Bun shebang).

## Install

```bash
bun add -d @lhechenberger/check-links
```

## Usage

```bash
bunx check-links https://my-preview.example.vercel.app
bunx check-links                      # uses `url` from the config, e.g. the local dev server
bunx check-links <url> --config ci/check-links.config.ts
```

Set `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel project → Deployment Protection → Protection Bypass for Automation) to check protected deployments. The secret is sent as `x-vercel-protection-bypass` header, also to the second requests (same-origin only, never to third parties).

The last line of the output is a one-line summary (`Checked N links on <origin>: X broken, Y warnings`); the exit code is `1` if `X > 0`.

## Configuration

Optional `check-links.config.ts` in the working directory:

```ts
import { defineConfig } from '@lhechenberger/check-links';

export default defineConfig({
  url: 'http://localhost:3000',
  // Never checked. Strings are regular expression sources.
  skip: [/^https:\/\/www\.instagram\.com\//, String.raw`^https://example\.org/`],
  // Broken links that must not fail the check, e.g. content you can't fix. Not re-requested.
  isWarningOnly: (link, { origin, url }) =>
    !link.url.startsWith(origin) && new URL(link.parent ?? url).pathname.startsWith('/docs/'),
  warningTitle: 'Broken links in embedded READMEs',
  retryAfterMs: 5000, // wait before the second request
  recheckConcurrency: 5, // parallel second requests
  concurrency: 20, // parallel requests of the crawl
  timeout: 30_000,
});
```

| Option               | Default | Description                                          |
| -------------------- | ------- | ---------------------------------------------------- |
| `url`                | –       | Used when no URL is passed on the command line       |
| `skip`               | `[]`    | Links not to check                                   |
| `isWarningOnly`      | –       | `(link, { origin, url }) => boolean`                 |
| `warningTitle`       | generic | Heading for the `isWarningOnly` links                |
| `retryAfterMs`       | `5000`  | Wait before broken links are requested a second time |
| `recheckConcurrency` | `5`     | Parallel second requests; keep low (see above)       |
| `concurrency`        | `20`    | Parallel requests of the crawl                       |
| `timeout`            | `30000` | Timeout per request in ms                            |

## GitHub workflow: check every Vercel deployment

The package contains a workflow template that runs the check when Vercel reports a ready deployment, shows the result as a **"Broken Links" check run** on the deployed commit (so it appears on the pull request, with the full output) and reports the commit status that Vercel's Deployment Checks can require before a production deployment gets its domain.

```bash
bunx check-links init-workflow          # writes .github/workflows/broken-links.yml
```

Setup:

1. Add the repository secret `VERCEL_AUTOMATION_BYPASS_SECRET` (same value as in the Vercel project's protection bypass).
2. In Vercel, enable Deployment Checks / the `repository_dispatch` events for the project, so it sends `vercel.deployment.ready`.
3. Commit the workflow to the **default branch** (GitHub runs `repository_dispatch` workflows only from there).
4. Adjust the "Check for broken links" step if the package isn't a dependency of the repository root (e.g. `bun --cwd=apps/web run …`), and optionally remove the "Report to Vercel" step.
5. Run it once by hand: Actions → Broken Links → Run workflow, with a deployment URL.

Without the secret, production deployments fail the job (they would be held back anyway) and previews are skipped with a warning.

## Local development of the checks

`bun test` runs the unit tests of the classification (flaky vs. real errors).

## Programmatic API

```ts
import { classify, run, defineConfig } from '@lhechenberger/check-links';
```

`run(url, config)` crawls and prints, and resolves to the exit code; `classify` is the pure part that sorts broken links into `errors`, `flaky` and `warnings`.
