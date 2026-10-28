---
'@lhechenberger/check-links': minor
---

Ship a compiled build (ESM plus type declarations) instead of TypeScript source, so the package runs on Node.js 22.18+ as well as Bun.

The CLI now also finds a `check-links.config.mts`, `.js` or `.mjs` in the working directory, not just `.ts`.
