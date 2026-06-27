# Changelog

## 0.2.9

- Switch normal polling to cron schedules and add a persisted Fast Polling switch.
- Make fast polling project-only and keep a 15-second minimum interval.

## 0.2.8

- Make `Withdraw Locked` publish immediately and add debug logs for withdrawal flow timing.
- Remove the duplicate withdrawal preflight scrape and sync after withdrawal attempts.

## 0.2.7

- Let `Withdraw Funds` proceed when `Can Withdraw` is already true, even if the UI timestamp is still 5 minutes out.

## 0.2.6

- Fix `Can Withdraw` detection for the live `Get paid $x.xx` submit button.
- Restore project publishing by defining the missing MQTT helper.

## 0.2.5

- Hide zero-task project entities and delete stale MQTT project discoveries.
- Prefix and shorten project entity names for readability.
- Stop using report-time rows as the source of project entities.

## 0.2.4

- Anchor `Next Payout` to the Funds History row date so it no longer drifts forward each day.
- Keep `Next Withdrawal` behavior unchanged.

## 0.2.3

- Move `Next Payout` to the next local midnight after the due day.
- Keep `next_payout_at` and `Pending Approval` timing attributes in the payments payload.

## 0.2.2

- Change `Next Payout` to a timestamp sensor at local midnight.
- Add `next_payout_at` and related timing attributes to payments payloads.
- Expose payout timing attributes on `Pending Approval`.

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
