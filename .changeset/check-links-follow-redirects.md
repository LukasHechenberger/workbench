---
'@lhechenberger/check-links': patch
---

Let the runtime follow redirects for requests that carry no bypass header (links to other sites), and apply `timeout` to the requests the package makes itself. Requests to the checked origin keep following redirects one hop at a time, so the bypass secret never travels to another origin. Set `CHECK_LINKS_DEBUG=1` to log those requests hop by hop.
