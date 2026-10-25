# workbench

Personal helper packages for CI, testing and tooling, published under the `@lhechenberger` npm scope. A Bun workspaces monorepo; every package is documented in its own README, which is what the npm page shows.

| Package                                              | Description                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| [`@lhechenberger/check-links`](packages/check-links) | Broken-link crawler for deployments that separates flaky failures |

## Claude Code skills and agents

[`skills/`](skills) and [`agents/`](agents) hold generic skills and agents that are installed with `bunx skills add LukasHechenberger/workbench -s <name>`; see [`skills/README.md`](skills/README.md).

## Development

```bash
bun install
bun run check   # tsc + prettier
bun run test
```

### Adding a package

Create `packages/<name>` with `package.json` (`@lhechenberger/<name>`, `"publishConfig": {"access": "public"}`), a README that explains installation, configuration and setup completely (the npm page is the documentation), and a `src/`. Add it to the table above.

### Releasing

Changesets: `bun run changeset` per change, merge to `main`; the CI workflow opens a version PR and publishes to npm when it is merged. Needs the repository secrets `NPM_TOKEN` (publish rights for the scope) and `CHANGESETS_GITHUB_TOKEN` (a personal access token with contents and pull-requests write access, so the version PR triggers CI).

## Keep it generic

This repository is meant to be open-sourced later. Packages must be generic: no names, paths, URLs, IDs or configuration of real projects, customers or companies, and no secrets. Project-specific settings (skip lists, rules) live in the consuming project, never here; examples use `example.com`. See `AGENTS.md`; the `public-repo-guard` agent checks this.
