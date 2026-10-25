---
'@lhechenberger/check-links': patch
---

Import files inside the package without the `.ts` extension, so projects that type-check their `check-links.config.ts` don't get TS5097 from the package's source. Document the type-checking and knip setup.
