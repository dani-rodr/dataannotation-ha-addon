# Data Annotation

A Home Assistant add-on that logs into DataAnnotation, scrapes the worker projects page, and publishes project state through MQTT auto-discovery.

[![Add to Home Assistant](https://my.home-assistant.io/badges/supervisor_store.svg)](https://my.home-assistant.io/redirect/supervisor_store/?repository_url=https%3A%2F%2Fgithub.com%2Fdani-rodr%2Fdataannotation-ha-addon)

## Features

- Cron-based polling by default (`*/5 * * * *`)
- Optional fast polling mode with a separate cron schedule
- Optional slower Funds History cadence for payout timestamps
- Persistent browser session handling with automatic relogin when the session expires
- MQTT auto-discovery for count, status, profile, sync button, fast polling switch, auto-accept switch, withdraw lock switch, withdraw button, and per-project sensors
- MQTT auto-discovery for count, status, profile, sync button, fast polling switch, auto-accept switch, currency switch, FX rate sensor, withdraw lock switch, withdraw button, and per-project sensors
- Project and payments telemetry are scraped read-only
- Claim actions are only performed through the explicit claim controls and Auto Accept switch

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `profile` | required | Friendly name shown in MQTT device metadata |
| `email` | required | DataAnnotation login email |
| `password` | required | DataAnnotation login password |
| `poll_cron` | `*/5 * * * *` | Cron schedule for normal polling |
| `fast_poll_cron` | `*/30 * * * * *` | Cron schedule when Fast Polling is enabled |
| `funds_history_cron` | `*/30 * * * *` | Cron schedule for Funds History expansion |
| `funds_history_after_task_delay_minutes` | `2` | Delay after a task ends before an expedited Funds History sync |
| `excluded_project_patterns` | `""` | Newline-separated substrings for projects to ignore |
| `mqtt_topic_prefix` | `dataannotation` | Base MQTT topic prefix |
| `log_level` | `info` | Logging level |

## Entities

- `Profile`
- `Project Count`
- `Total Tasks`
- `Status`
- `Last Sync`
- `Sync Now`
- `Withdraw Locked`
- `Claim Projects Locked`
- `Fast Polling`
- `Auto Accept`
- `Currency to PHP`
- `Withdraw Funds`
- `In Progress Task`
- One sensor per active project
- One claim button per active project
- `Available Funds`
- `Can Withdraw`
- `Next Withdrawal`
- `USD to PHP Rate`
- `Total Earnings`
- `Total Paid Out`
- `This Month`
- `Best Month`
- `Pending Approval`
- `Last Payout`
- `Next Payout`

## Project sensors

Each project sensor uses the task count as its state and exposes attributes such as:

- `name`
- `tasks`
- `pay`
- `base_pay`
- `priority_pay`
- `tags`
- `category`
- `created`

## Notes

- The add-on keeps a persistent Chromium profile under `/data/chrome-profile`.
- Withdraw lock state is stored under `/data/withdraw-lock-state.json` and restored on restart.
- Fast polling state is stored under `/data/fast-polling-state.json` and restored on restart.
- Auto Accept state is stored under `/data/auto-accept-state.json` and restored on restart.
- The slow Funds History schedule controls how often `Next Payout` is refreshed; normal payments telemetry still refreshes on the regular poll.
- When `In Progress Task` flips from ON to OFF, the add-on can schedule one expedited Funds History sync after the configured delay.
- New pending Funds History rows cache their first-seen estimate so `Next Payout` stays stable between refreshes.
- If DataAnnotation logs the session out, the add-on will detect the login page, sign back in, and continue scraping.
- Withdrawal attempts that are blocked create a Home Assistant persistent notification.
- Home Assistant Core API access is enabled so the add-on can create persistent notifications.
- Funds History is opened read-only and expanded only to calculate the next payout timestamp.
- Funds History is expanded read-only to calculate the `Next Payout` sensor and publish compact payout-entry attributes with a human-readable timestamp.
- Fast polling keeps the lightweight payments scrape enabled and only skips Funds History expansion.
- `In Progress Task` is ON when the live projects page reports at least one active task in its in-progress task list.
- Frankfurter exchange rates are refreshed daily after the UTC afternoon update window.
- `Currency to PHP` switches all published money values between USD and PHP using the latest USD/PHP rate.
- `Auto Accept` can claim the first newly detected task and turns itself OFF after a successful claim or when `In Progress Task` is ON.
- `Total Tasks` includes the latest detected new-task batch details, including the project title and project URL.
- `excluded_project_patterns` accepts newline-separated substrings and removes matching projects from totals, entities, and automation.
- Polling cron schedules are intentionally restricted to simple step expressions with a minimum interval of 5 seconds.

## Install

Use the Home Assistant shortcut above to add the repository directly, or add this repository URL in Home Assistant:

`https://github.com/dani-rodr/dataannotation-ha-addon`

## Testing

- Copy `integration.local.example.json` to `integration.local.json` for local live integration runs.
- Or set `DATAANNOTATION_EMAIL` and `DATAANNOTATION_PASSWORD` in your shell or GitHub Actions secrets.
- `npm test` runs the fast unit suite.
- `npm run test:integration:fixture` checks the exact parsed project fixture.
- `npm run test:integration:live` runs the live read-only browser scrape when credentials and a Chrome path are available.
- `npm run test:wallet:live` runs the opt-in Wallet write/delete smoke test. Use `WALLET_TOKEN`, or put `wallet-token` in `integration.local.json`.
- GitHub Actions can run the same test from `.github/workflows/wallet-live-write.yml` after setting the `wallet-live-write` environment with secret `WALLET_TOKEN`.
