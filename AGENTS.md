Default to Bun: `bun install`, `bun run <script>`, `bunx <package>`, `bun test`.

## Repository layout

Lukas Hechenberger's personal Bun workspaces monorepo of helper packages for CI, testing and tooling (scope `@lhechenberger`, published to npm). Packages are in `packages/*`; each has a README that is the user documentation (it is what the npm page shows), so keep it complete: installation, configuration, setup, examples.

Packages ship TypeScript source and run on Bun (no build step) unless a package needs otherwise.

## Keep it generic (open-source ready)

The repository is private for now but **will be open-sourced**, and published packages are public on npm from the first release (the tarball contains the source). Treat everything as public:

- No secrets: tokens, keys, passwords, connection strings, bypass secrets. Use placeholders (`<token>`, `${VAR}`).
- No project details: names, repositories, paths, domains, URLs, IDs, configuration, customers, prices or unreleased plans of any real project or company. Not in code, tests, fixtures, READMEs, comments, changesets, commit messages or PR descriptions. Use `example.com`, `my-app`, `acme`.
- Project-specific behavior is configuration in the consuming project, never a default or special case in a package here. If a package needs a "rule for project X", it needs an option instead.
- Generic code may be adapted from Lukas's other projects; the origin is not mentioned beyond "adapted from a project" and nothing project-specific is brought along.

Run the `public-repo-guard` agent before every commit that is pushed. It also reads the optional, git-ignored deny-list `.claude/private-terms.txt` (one term per line) with names that must never appear.

## Checks

`bun run check` (tsc and Prettier) and `bun run test`. `bun run format` fixes Prettier issues.

## Changesets

Add a changeset (`bun run changeset`) for every change to a published package.
