---
name: pre-pr
description: Run the project's CI checks and its reviewer agents on the current changes before opening or pushing a PR.
disable-model-invocation: true
---

Run from the repository root, on the changes of the current branch. The project's `AGENTS.md` (or `CLAUDE.md`) defines what to run; if it has no "Checks" section, read the CI workflow (`.github/workflows`) and run the same commands.

1. Run the commands listed under "Checks" (typically check, lint, test, build). Fix formatting issues with the project's format script.
2. Launch the reviewer agents the project lists (e.g. a `public-repo-guard` for public repositories, or access-control, translation or SEO reviewers), in parallel where they are independent. Anything an agent rates **block** must be fixed before pushing.
3. Check whether the change needs a changeset (see "Changesets" in `AGENTS.md`) and add one if it's missing.
4. Report what failed or is missing, grouped by check. Fix mechanical issues (formatting, missing changeset) and ask before anything else.

Do not push or open the PR; that is the user's call.
