# Shared Claude Code skills and agents

Generic skills (`skills/<name>/SKILL.md`) and agents (`agents/<name>.md`) for Next.js, Payload, Vercel and general project workflows. Project-specific details (commands, package names, hosts, reviewer agents) belong in the consuming project's `AGENTS.md`; the skills read them from there.

## Install

Into a project (tracked in `skills-lock.json`):

```bash
bunx skills add LukasHechenberger/workbench -s add-migration -a claude-code
```

Agents are plain files: copy `agents/<name>.md` to the project's `.claude/agents/`.

## Contents

| Name                 | Kind  | What it does                                                          | Reads from `AGENTS.md`                          |
| -------------------- | ----- | --------------------------------------------------------------------- | ----------------------------------------------- |
| `add-migration`      | skill | Creates a Payload (Postgres) migration with the usual manual fixes    | script names, changeset rules                   |
| `switch-preview-mcp` | skill | Points a preview MCP server at another Vercel preview deployment      | variable names, endpoint path, allowed hosts    |
| `pre-pr`             | skill | Runs the project's checks and reviewer agents before opening a PR     | "Checks", reviewer agents, "Changesets"         |
| `public-repo-guard`  | agent | Reviews changes for secrets and project details before they go public | "Public repository" section, optional deny-list |
