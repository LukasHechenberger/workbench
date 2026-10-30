---
'@lhechenberger/check-links': patch
---

The `init-workflow` template now reports the result as a commit status ("Broken Links") on the deployed commit instead of a check run, and writes the full output to the run's job summary. A check run created through the API joins an existing GitHub Actions check suite on the commit, and when that suite is superseded (e.g. a run cancelled by a concurrency rule after GitHub delivered the `pull_request` event twice), the merge box never sees it and a required check stays "expected", blocking auto-merge. A status is attached to the commit itself, so it works as a required status check in branch rulesets; the workflow needs `statuses: write` instead of `checks: write`.
