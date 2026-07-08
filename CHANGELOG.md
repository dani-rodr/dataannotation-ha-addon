# Changelog

## 0.6.10

- Fix payout attribute cleanup so raw next-payout estimates stay accurate while MQTT attributes use the slim public fields.

## 0.6.9

- Slim down payout history attributes and reuse the cleaned entry shape for next payout data.

## 0.6.8

- Fix currency conversion so switching back to USD leaves values unchanged and clears currency history.

## 0.6.7

- Mark earnings and payout summary sensors as diagnostic so the device page groups them away from controls.

## 0.6.6

- Refactor static MQTT discovery publishing so rebuilds and startup use the same source of truth.

## 0.6.5

- Categorize Data Annotation MQTT entities so configuration switches and reference sensors are grouped more cleanly in Home Assistant.

## 0.6.4

- Remove the noisy MQTT `Status` and `Last Sync` entities and clean up their retained discovery topics.

## 0.6.3

- Split the runtime into smaller app, MQTT, and browser-session modules while keeping live behavior unchanged.

## 0.6.2

- Build a bundled JavaScript entrypoint at image build time and run that in Home Assistant.
- Remove the runtime dependency on `tsx` from the add-on launcher.

## 0.6.1

- Fix the Home Assistant service launcher to start the TypeScript entrypoint after the migration.

## 0.6.0

- Convert the remaining runtime and test modules from JavaScript to TypeScript.
- Update the add-on entrypoint and test scripts to use TypeScript directly.
- Preserve the live DataAnnotation scrape behavior and fix the funds-history midnight repair regression.

## 0.5.0

- Checkpoint release before continuing the TypeScript migration.

## 0.4.16

- Add persistent MQTT error logging and mark known project availability offline when a sync fails.

## 0.4.15

- Retain the last future `Next Withdrawal` timestamp while funds remain withdrawable.

## 0.4.14

- Bump the add-on version so Home Assistant detects the latest currency and withdrawal fixes.

## 0.4.13

- Fix withdrawal eligibility detection for the live `Get paid $x.xx` button when amounts include thousands separators.
- Keep the active currency mode when publishing withdrawal results so a PHP session does not briefly fall back to raw USD telemetry.
- Remove long-term statistics metadata from currency-switching money sensors to avoid Home Assistant unit conversion warnings.

## 0.4.12

- Add `excluded_project_patterns` to hide matching projects before totals, entities, and automation are published.

## 0.4.11

- Add a daily Frankfurter USD/PHP rate poll, a `USD to PHP Rate` sensor, and a `Currency to PHP` switch that republishes monetary values in PHP.

## 0.4.10

- Lower the fast polling floor to 5 seconds and run Auto Accept before the payment scrape so task claiming starts sooner.

## 0.4.9

- Add `Total Tasks` attributes for newly detected task batches, including project title and project URL.
- Add an `Auto Accept` switch that can claim newly detected tasks and turns itself off after a successful claim or when in-progress work is active.

## 0.4.8

- Repair persisted minute-based Funds History observations so they recompute payout timestamps instead of staying on the old midnight fallback.

## 0.4.7

- Add a configurable expedited Funds History sync delay after `In Progress Task` turns off and remove the legacy `poll_interval_minutes` option.

## 0.4.6

- Parse minute-based Funds History rows so payout estimates can preserve minute-level precision when available.

## 0.4.5

- Add an `In Progress Task` binary sensor from the live projects page payload.

## 0.4.4

- Preserve compact `Next Payout` attributes when fast polling skips Funds History expansion.

## 0.4.3

- Keep the lightweight payments scrape enabled during fast polling so `Can Withdraw` updates without the Funds History cost.

## 0.4.2

- Show notification dates in local time instead of UTC.
- Prefix log lines with ISO timestamps.

## 0.4.1

- Fix claim project row matching to use the real project slug/name/id fields.
- Add a pure row-matcher helper and better claim target debug logging.

## 0.4.0

- Add per-project claim buttons for active projects and a persisted `Claim Projects Locked` switch.
- Use desktop screen metrics for claim navigation and exact `Enter Work Mode` detection.

## 0.3.3

- Add compact `Next Payout` attributes with a human-readable timestamp and trimmed payout-entry array.

## 0.3.2

- Keep day-based Funds History entries on midnight-style estimates while preserving exact hour-based observations.

## 0.3.1

- Persist first-seen Funds History observations so `Next Payout` can reuse stable per-entry timestamps and clean up paid entries.

## 0.3.0

- Keep normal payment telemetry on the regular poll and move Funds History expansion to a slower schedule.
- Add timing helpers for sync policy decisions.
- Reduce fixed wait time usage where selector-based readiness is available.

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
