# Data Annotation

A Home Assistant add-on that logs into DataAnnotation, scrapes the worker projects page, and publishes project state through MQTT auto-discovery.

[![Add to Home Assistant](https://my.home-assistant.io/badges/supervisor_store.svg)](https://my.home-assistant.io/redirect/supervisor_store/?repository_url=https%3A%2F%2Fgithub.com%2Fdani-rodr%2Fdataannotation-ha-addon)

## Features

- 5 minute polling by default
- Persistent browser session handling with automatic relogin when the session expires
- MQTT auto-discovery for count, status, profile, sync button, withdraw lock switch, withdraw button, and per-project sensors
- Read-only scraping only; no project actions are clicked
- First iteration targets the projects page only

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `profile` | required | Friendly name shown in MQTT device metadata |
| `email` | required | DataAnnotation login email |
| `password` | required | DataAnnotation login password |
| `poll_interval_minutes` | `5` | Minutes between automatic scrapes |
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
- `Withdraw Funds`
- One sensor per active project
- `Available Funds`
- `Can Withdraw`
- `Next Withdrawal`
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
- If DataAnnotation logs the session out, the add-on will detect the login page, sign back in, and continue scraping.
- Withdrawal attempts that are blocked create a Home Assistant persistent notification.
- Home Assistant Core API access is enabled so the add-on can create persistent notifications.
- Funds History is opened read-only and expanded only to calculate the next payout delay.
- Funds History is expanded read-only to calculate the `Next Payout` sensor.

## Install

Use the Home Assistant shortcut above to add the repository directly, or add this repository URL in Home Assistant:

`https://github.com/dani-rodr/dataannotation-ha-addon`

## Testing

- Copy `integration.local.example.json` to `integration.local.json` for local live integration runs.
- Or set `DATAANNOTATION_EMAIL` and `DATAANNOTATION_PASSWORD` in your shell or GitHub Actions secrets.
- `npm test` runs the fast unit suite.
- `npm run test:integration:fixture` checks the exact parsed project fixture.
- `npm run test:integration:live` runs the live read-only browser scrape when credentials and a Chrome path are available.
