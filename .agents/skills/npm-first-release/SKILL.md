---
name: npm-first-release
description: Release a new npm package for the first time from a monorepo that publishes with changesets and npm trusted publishing (GitHub Actions OIDC), then set up and validate its trusted publisher and remove the temporary token. Use when a package is about to be published to npm for the first time.
disable-model-invocation: true
---

Trusted publishing (OIDC, no token) can only be configured on npmjs.com for a package that already exists, so a new package needs one publish with a token first. The steps below do that from CI, so the first release still gets its git tag, GitHub release and changelog, and leave no token behind.

The project's `AGENTS.md` and its CI workflow (`.github/workflows`) say which workflow publishes (e.g. `ci.yml` with `changesets/action`), the release script and the repository. The user creates and deletes tokens and secrets themselves: never ask for, read, print or enter a token value.

## 1. Prepare the package (on its branch)

- `package.json`:
  - `"version": "0.0.0"`, `"publishConfig": { "access": "public" }` for a scoped package.
  - `repository.url` must match the GitHub repository exactly (case-sensitive; it must be public), with `homepage` and `bugs`: npm rejects the provenance otherwise (E422).
  - `files` and `exports`: check the tarball with `npm pack --dry-run` (or `bun pm pack --dry-run`); every `exports` entry must exist in it.
- README: it's the npm page, so installation, configuration and examples are complete.
- Add a `minor` changeset ("Initial release: …"), then run the version script (`changeset version`, plus the lockfile update) **on the branch** and commit the result: `package.json` at `0.1.0`, `CHANGELOG.md` with the "Initial release" entry, the changeset consumed. Merging then publishes 0.1.0 directly, without a version PR. (`@changesets/changelog-github` needs `GITHUB_TOKEN`, e.g. `GITHUB_TOKEN=$(gh auth token)` in front of the command, without printing it.)

## 2. First publish with a temporary token

1. The user creates a granular access token on npmjs.com (read and write, the package's scope or all packages, bypass 2FA, short expiry) and stores it as a repository secret, e.g. `gh secret set NPM_TOKEN --repo <owner>/<repo>` (it prompts for the value, so it doesn't end up in the shell history). Check with `gh secret list` that it exists.
2. Give the release step the token: `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` in its `env` (`actions/setup-node` with `registry-url` writes an `.npmrc` that reads it), with a comment that it's temporary. Commit it separately (`ci: …`).
3. Run the public-repository check if the project has one, then merge. Check the release run's log ("packages published successfully", the new tag).
4. The package can take a few minutes to appear (404 meanwhile), and npm may list a `0.0.0-stage` version: the placeholder npm creates when a new package goes through staged publishing. It isn't tagged `latest`; leave it.

Untested alternative without a CI token: the maintainer runs `npm stage publish` locally (npm 11.15+), which creates the package with the `0.0.0-stage` placeholder, so the trusted publisher can be added before the first real release. npm's docs don't say whether that's enough to set up the trusted publisher; verify before relying on it.

## 3. Trusted publisher

The user adds it on npmjs.com (package → Settings → Trusted Publisher): GitHub Actions, the repository, the workflow **file name** only (e.g. `ci.yml`), no environment unless the job uses one, and "npm publish" allowed (`npm stage publish` always is). npm doesn't check the configuration when it's saved.

It shows **Pending validation**: it must publish successfully within 2 days, or it expires and has to be deleted and created again.

Requirements of the publishing job: `permissions: id-token: write`, a GitHub-hosted runner, npm CLI 11.5.1+ and Node 22.14+. Provenance is generated automatically.

## 4. Validate and remove the token

On a new branch, within the 2 days:

1. Remove the `NODE_AUTH_TOKEN` line from the release step (`ci: Publish only through npm trusted publishing`).
2. Release a patch through it: a real, small change to the package (e.g. a README fix) with a `patch` changeset, versioned on the branch as in step 1, so merging publishes it.
3. After merging, check the release log for `using npm trusted publishing` (OIDC) and the new version for a provenance attestation: `npm view <package>@<version> dist.attestations --json`. The trusted publisher is validated now.
4. The user deletes the token on npmjs.com and the secret (`gh secret delete NPM_TOKEN --repo <owner>/<repo>`), and sets the package's Settings → Publishing access to "Require two-factor authentication and disallow tokens" (trusted publishing keeps working).
