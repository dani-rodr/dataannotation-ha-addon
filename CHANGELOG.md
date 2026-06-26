# Changelog

## 0.2.0

- Add a `Next Payout` telemetry sensor based on Funds History pending entries.
- Scrape and expand Funds History rows read-only to compute payout delays.
- Force refresh all telemetry sensors on sync and add timestamps to payment payloads.

## 0.1.9

- Force refresh all read-only MQTT telemetry entities on each sync.
- Add sync timestamps to payment payloads so automation state always republishes.

## 0.1.8

- Force MQTT project sensors to refresh on every sync and include a sync timestamp in project state payloads.

## 0.1.7

- Fix project parsing to prefer `dashboardMerchTargeting.projects` when `reportableProjectsInfo` is empty.

## 0.1.6

- Add a locked-by-default `Withdraw Locked` switch and a `Withdraw Funds` button.
- Enable Home Assistant Core API access for persistent notifications.
- Tighten withdrawal button detection to the exact `$x.xx available` pattern.
- Make withdrawal-blocked notifications lock-first and UI-friendly.

## 0.1.5

- Enable Home Assistant Core API access for persistent notifications.
- Tighten withdrawal button detection to the exact `$x.xx available` pattern.

## 0.1.4

- Add a retained `Withdraw Locked` switch that defaults to ON.
- Add a `Withdraw Funds` MQTT button.
- Persist withdraw lock state across restarts and syncs.
- Create Home Assistant persistent notifications for blocked withdrawal attempts.

## 0.1.3

- Remove redundant JSON attributes from aggregate entities.
- Add a total project task count sensor.

## 0.1.2

- Add DataAnnotation payments scrape and withdrawal availability entities.
- Publish earnings summary, pending approval, and withdrawal timing sensors.

## 0.1.1

- Rename add-on config fields to be UI-friendly.
- Clean up MQTT device/entity names.
- Add Home Assistant install shortcut and unit tests.
- Improve startup and sync logging.

## 0.1.0

- Initial Node add-on with DataAnnotation project scraping, MQTT auto-discovery, persistent browser session handling, and per-project sensors.
