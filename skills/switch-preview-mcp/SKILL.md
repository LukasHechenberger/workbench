---
name: switch-preview-mcp
description: Point a preview MCP server (e.g. `payload-preview`) at another Vercel preview deployment when starting work on a new branch or PR, by updating its URL variable in the git-ignored .env.local. Use when the user wants to switch, change or set the preview MCP deployment.
---

Projects that expose their CMS or API to Claude through a preview-deployment MCP server generate `.mcp.json` from a committed template that reads the endpoint from an environment variable (the project's `AGENTS.md` names the variable, e.g. `PAYLOAD_PREVIEW_MCP_URL`, the endpoint path, and the allowed hosts). This skill edits `.env.local` and regenerates `.mcp.json`. Claude Code only reads `.mcp.json` at startup, so the change has no effect until the user restarts it; make that unmistakable.

1. Determine the deployment URL, in this order: one the user gave; the preview URL of the current branch's PR (`gh pr view <branch> --json comments` or the Vercel MCP `list_deployments`); otherwise ask. Strip any path and append the endpoint path from `AGENTS.md`. Only accept `https://*.vercel.app` hosts (or the hosts `AGENTS.md` allows).
2. Confirm `.env.local` in the repo root is git-ignored (`git check-ignore .env.local`). If it is not, stop and say so.
3. Set or replace the URL variable in `.env.local`, keeping all other lines untouched; create the file if missing. Leave the token variable unset unless the user says the preview needs a different token (it usually falls back to the production token).
4. Check whether the protection bypass variable named in `AGENTS.md` is set in `.env.local` (presence only). If not, tell the user the SSO-protected preview will reject requests until they add it.
5. Never print, log or commit any token or bypass value; refer to them by variable name only.
6. Regenerate `.mcp.json` with the project's command (e.g. `bun run prepare`) and relay any warning about unset variables (names only).
7. End your reply with a prominent restart notice, as its own paragraph in bold, e.g. "**Restart required: quit and reopen Claude Code (CLI or desktop app). The preview server keeps using the old deployment until you do.**" State clearly that the running session is NOT updated and that MCP config is only read at startup. Do not claim the preview server is switched, and do not call its tools to verify before the restart; offer to verify afterwards.
