# Debugging

## General Health

Run the doctor to check for environment issues or misconfigured providers:

```bash
hardkas doctor
```

## Common Issues

- **Stale Index:** If `query store doctor` reports issues, your local SQLite cache is out of sync with your artifacts folder. Fix this by running `hardkas query store rebuild`.
- **Telemetry Errors:** If `telemetry verify` fails, ensure your background daemon has write access to the `events.jsonl` append-only log.

For a full list of errors, see [Error Recovery](../reference/error-recovery.md).
