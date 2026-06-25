# Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `profile` | required | Friendly name shown in MQTT device metadata |
| `email` | required | DataAnnotation login email |
| `password` | required | DataAnnotation login password |
| `poll_interval_minutes` | `5` | Minutes between automatic scrapes |
| `mqtt_topic_prefix` | `dataannotation` | Base MQTT topic prefix |
| `log_level` | `info` | Logging level |

## Behavior

- Opens only `/users/sign_in` and `/workers/projects`
- Opens `/workers/payments` to scrape withdrawal and earnings data
- Clicks only the login submit button when a session refresh is required
- Publishes retained MQTT entities and discovery payloads
- Publishes `0` and empty state when no projects are available

## Payments Entities

- `Available Funds` is the current withdrawable amount shown on the button.
- `Can Withdraw` is ON only when the button is enabled and the amount is greater than zero.
- `Next Withdrawal` uses the cooldown timestamp when present.
- `Total Earnings`, `Total Paid Out`, `This Month`, `Best Month`, `Pending Approval`, and `Last Payout` come from the structured payments payload.

## Integration Tests

- Local live tests can read credentials from `integration.local.json` or `DATAANNOTATION_EMAIL` and `DATAANNOTATION_PASSWORD`.
- GitHub Actions should pass credentials as secrets-backed environment variables.
- A Chrome binary path can be supplied with `PUPPETEER_EXECUTABLE_PATH`, `CHROME_PATH`, or `GOOGLE_CHROME_BIN`.
