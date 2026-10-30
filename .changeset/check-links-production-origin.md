---
'@lhechenberger/check-links': minor
---

Add the `productionOrigin` option: links to the live site's origin (canonical and hreflang URLs, `og:url`, …) are requested on the origin being checked instead, so a deployment that adds a route doesn't fail because the route doesn't exist on the live site yet. Accepts one origin or an array, and does nothing when the checked origin is one of them. Broken links are still reported as written on the page, with the requested URL (`… (checked as …)`), and `isWarningOnly` gets that URL as `requestUrl` in its context.
