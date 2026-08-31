Delivery probe. Confirms whether a GitHub pull_request event still reaches
the review-who-gets-replaced-first-prs routine at all.

This is the reference routine that fired reliably on 2026-08-29/30. If this
PR produces no run session, webhook delivery is broken globally rather than
for one org. Delete on sight.
