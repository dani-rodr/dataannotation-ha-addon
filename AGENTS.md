# DataAnnotation Add-on Instructions

- Treat live DataAnnotation tests as read-only.
- Do not call `withdrawAvailableFunds()` from live tests unless the user explicitly requests a real withdrawal test.
- Do not click project rows, start/open task buttons, star, hide, share, invite, or refer controls.
- The only allowed browser action in the default flow is login form submission.
- `Withdraw Funds` must stay behind the `Withdraw Locked` guard and only click the exact `$x.xx available` button.
- Any future real-withdrawal test must be opt-in via an explicit environment variable.
- Payout-history accuracy warning: be careful when changing Funds History, payout-entry shaping, or MQTT payment attributes. Cleaning display attributes too early can lose precise payout estimates.
- Keep raw/internal payout observation data separate from public MQTT/Home Assistant attributes when possible. Slim public fields are fine, but avoid replacing raw `pending_payout_entries` / `next_payout_entries` with display-only shapes before observation reuse and sync-policy logic run.
- Before changing payout-history shaping, check that minute/hour-based estimates are not downgraded by later day-based scrapes. Prefer preserving tests like: first scrape sees `13 minutes ago`, later scrape sees `1 day ago`, and the original `estimated_work_at`, `estimated_payout_at`, and `estimate_source` remain intact.
- If DataAnnotation shows an in-page notification prompt after login, treat it as a separate UI overlay from the browser permission dialog. It is okay to dismiss or allow the exact notification prompt if needed, but do not interact with project/task controls.
- Live credential loading for browser tests comes from `test/helpers/integration-credentials.ts` and the ignored `integration.local.json` / env vars; never print or hardcode those credentials in logs or commits.
