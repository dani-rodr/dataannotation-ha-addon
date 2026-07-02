# Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `profile` | required | Friendly name shown in MQTT device metadata |
| `email` | required | DataAnnotation login email |
| `password` | required | DataAnnotation login password |
| `poll_cron` | `*/5 * * * *` | Cron schedule for normal polling |
| `fast_poll_cron` | `*/30 * * * * *` | Cron schedule when Fast Polling is enabled |
| `funds_history_cron` | `*/30 * * * *` | Cron schedule for the slower Funds History refresh |
| `funds_history_after_task_delay_minutes` | `2` | Delay after a task ends before an expedited Funds History refresh |
| `mqtt_topic_prefix` | `dataannotation` | Base MQTT topic prefix |
| `log_level` | `info` | Logging level |

## Behavior

- Opens only `/users/sign_in` and `/workers/projects`
- Opens `/workers/payments` to scrape withdrawal and earnings data
- Clicks only the login submit button when a session refresh is required
- Keeps withdraw state in `/data/withdraw-lock-state.json` so it survives restarts and syncs
- Publishes `Withdraw Locked` as ON when withdrawals are locked
- Keeps claim-project state in `/data/claim-projects-lock-state.json` so it survives restarts and syncs
- Publishes `Claim Projects Locked` as ON when claim actions are locked
- Keeps fast polling state in `/data/fast-polling-state.json` so it survives restarts and syncs
- Publishes `Fast Polling` as ON when the fast schedule is active
- Publishes one claim button per active project
- Publishes `In Progress Task` when the live projects payload includes active work
- Refreshes normal payment telemetry on the regular poll and only expands Funds History on the slower schedule
- Emits a Home Assistant persistent notification if a withdrawal is requested while locked or unavailable
- Uses Home Assistant Core API access for persistent notifications
- Publishes retained MQTT entities and discovery payloads
- Publishes `0` and empty state when no projects are available

## Next Payout

- The add-on opens the Funds History tab read-only.
- It expands the visible monthly and project rows to inspect pending entries.
- Normal payment values still refresh on the regular poll; `Next Payout` is refreshed on the slower Funds History schedule.
- Hourly pending entries use a 7 day wait; task submissions use a 3 day wait.
- The `Next Payout` sensor reports the earliest pending payout estimate, reuses the first-seen timestamp for new rows, and exposes compact payout-entry attributes plus a human-readable timestamp.
- The `Pending Approval` sensor includes payout timing attributes from the payments summary payload.
- Fast polling keeps the lightweight payments scrape enabled and only skips Funds History expansion.
- `In Progress Task` reflects `inProgressTasksInfo` from the live projects payload and exposes the active task details as attributes.
- When `In Progress Task` flips from ON to OFF, the add-on schedules one expedited Funds History refresh after the configured delay.
- Claim buttons use a desktop screen profile and click the exact project link before checking for `Enter Work Mode`.
- Polling cron schedules are restricted to simple step expressions with a minimum interval of 15 seconds.

## Payments Entities

- `Available Funds` is the current withdrawable amount shown on the button.
- `Can Withdraw` is ON only when the button is enabled and the amount is greater than zero.
- `Next Withdrawal` uses the cooldown timestamp when present.
- `Total Earnings`, `Total Paid Out`, `This Month`, `Best Month`, `Pending Approval`, and `Last Payout` come from the structured payments payload.
- `Total Tasks` is the sum of all project task counts.

## Integration Tests

- Local live tests can read credentials from `integration.local.json` or `DATAANNOTATION_EMAIL` and `DATAANNOTATION_PASSWORD`.
- GitHub Actions should pass credentials as secrets-backed environment variables.
- A Chrome binary path can be supplied with `PUPPETEER_EXECUTABLE_PATH`, `CHROME_PATH`, or `GOOGLE_CHROME_BIN`.
