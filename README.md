# DataAnnotation Projects

A Home Assistant add-on that logs into DataAnnotation, scrapes the worker projects page, and publishes project state through MQTT auto-discovery.

## Features

- 5 minute polling by default
- Persistent browser session handling with automatic relogin when the session expires
- MQTT auto-discovery for count, status, profile, sync button, and per-project sensors
- Read-only scraping only; no project actions are clicked
- First iteration targets the projects page only

## Entities

- `DataAnnotation Profile`
- `DataAnnotation Project Count`
- `DataAnnotation Status`
- `DataAnnotation Last Sync`
- `DataAnnotation Sync Now`
- One sensor per active project

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
- If DataAnnotation logs the session out, the add-on will detect the login page, sign back in, and continue scraping.
- Fund history scraping is intentionally deferred to a later iteration.
