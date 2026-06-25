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
- Clicks only the login submit button when a session refresh is required
- Publishes retained MQTT entities and discovery payloads
- Publishes `0` and empty state when no projects are available
