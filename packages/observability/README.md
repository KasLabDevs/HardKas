# @hardkas/observability

Logging, metrics and tracing for HardKAS packages, with no runtime dependencies.

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/observability
```

`@hardkas/cli`, `@hardkas/kaspa-rpc` and `@hardkas/toolkit` depend on it.

## What it contains

- `createLogger` and `logger`.
- `createMetricRegistry`, `metrics` and `toPrometheusText`.
- Tracing and health helpers.

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental.

## License

MIT
