---
name: switch-preview-mcp
description: Point a preview MCP server (e.g. `payload-preview`) at another branch's Vercel preview deployment when starting work on a new branch or PR, by reassigning the project's stable preview domain to that branch or by updating the URL variable in the git-ignored .env.local. Use when the user wants to switch, change or set the preview MCP deployment.
---

Projects that expose their CMS or API to Claude through a preview-deployment MCP server generate `.mcp.json` from a committed template. The project's `AGENTS.md` names how the server finds its preview, in one of two ways:

- **A stable preview domain** (e.g. `preview.example.com`): a domain of the Vercel project that is assigned to one git branch at a time and serves that branch's latest deployment. The MCP URL never changes, so switching means reassigning the domain, with no change to `.mcp.json` and no restart. Prefer this whenever `AGENTS.md` names one.
- **A URL variable** (e.g. `PAYLOAD_PREVIEW_MCP_URL`) in `.env.local`, read when `.mcp.json` is generated. Claude Code only reads `.mcp.json` at startup, so this change has no effect until the user restarts it. Use it when there is no stable domain, or to pin one specific deployment.

Never print, log or commit any token or bypass value; refer to them by variable name only.

## Stable preview domain

1. Determine the branch: the one the user named, otherwise the current branch of the PR being worked on; otherwise ask.
2. Assign the domain to that branch with the command `AGENTS.md` gives, e.g. `vercel api -X PATCH "/v9/projects/<project>/domains/<domain>" -f gitBranch=<branch>` (scope it to the team if the project isn't linked). This changes the Vercel project's settings, so name the domain and the branch it moves from and to.
3. Check which deployment the domain serves (`vercel inspect <domain>`) and that it belongs to the branch. Vercel may only move the domain on the branch's next deployment: if it still serves the old one, say so and offer to redeploy the branch's latest deployment, or tell the user to assign the domain before pushing next time.
4. If the `.env.local` URL variable is set, it overrides the domain: tell the user, and offer to remove it (then regenerate as below, which needs a restart once).
5. The running session keeps working: the next call to the preview server reaches the newly assigned branch. Its tools' schemas were read at startup, so fields added since may be missing from their descriptions until a restart; the server accepts them anyway.

## URL variable

1. Determine the deployment URL, in this order: one the user gave; the preview URL of the current branch's PR (`gh pr view <branch> --json comments` or the Vercel MCP `list_deployments`); otherwise ask. Strip any path and append the endpoint path from `AGENTS.md`. Only accept `https://*.vercel.app` hosts (or the hosts `AGENTS.md` allows).
2. Confirm `.env.local` in the repo root is git-ignored (`git check-ignore .env.local`). If it is not, stop and say so.
3. Set or replace the URL variable in `.env.local`, keeping all other lines untouched; create the file if missing. Leave the token variable unset unless the user says the preview needs a different token (it usually falls back to the production token).
4. Check whether the protection bypass variable named in `AGENTS.md` is set in `.env.local` (presence only). If not, tell the user the SSO-protected preview will reject requests until they add it.
5. Regenerate `.mcp.json` with exactly the command `AGENTS.md` names (e.g. `bun install`, whose lifecycle runs the generator with `.env.local` loaded); don't substitute a similar script. Relay any warning about unset variables (names only), and check that the generated file contains no unexpanded `${…}` placeholders (without printing values).
6. End your reply with a prominent restart notice, as its own paragraph in bold, e.g. "**Restart required: quit and reopen Claude Code (CLI or desktop app). The preview server keeps using the old deployment until you do.**" State clearly that the running session is NOT updated and that MCP config is only read at startup. Do not claim the preview server is switched, and do not call its tools to verify before the restart; offer to verify afterwards.
