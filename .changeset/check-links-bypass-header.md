---
'@lhechenberger/check-links': patch
---

Never send the deployment protection bypass secret (`x-vercel-protection-bypass`) to other sites. The crawler sent it with every request, third parties included; now it only requests the checked origin, links to other sites are requested after the crawl without the header, and redirects are followed one hop at a time so a page that redirects elsewhere doesn't carry it along.
