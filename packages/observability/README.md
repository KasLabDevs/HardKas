# @hardkas/observability

Documentation: [hardkas.dev/docs](https://hardkas.dev/docs/) · Website: [hardkas.dev](https://hardkas.dev)

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

From 1.0 the boundaries listed as stable follow semantic versioning; preview and experimental surfaces may change between minor releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental.

## License

MIT
