---
'@lhechenberger/check-links': patch
---

Make the package's own requests (links to other sites, links to a production origin, second requests) with undici's `fetch`, the one the crawler uses, instead of the runtime's. On Node 22 the crawler's undici registers its dispatcher globally and the built-in fetch (an older undici) then received responses without headers, so no redirect was followed and every redirecting link was reported broken with its 3xx status.
