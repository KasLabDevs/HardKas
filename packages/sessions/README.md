# @hardkas/sessions

Session records of a workspace (`.hardkas` session store).

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/sessions
```

`@hardkas/cli` and `@hardkas/dev-server` depend on it.

## What it contains

- `createSession`, `setActiveSession` and `getActiveSession`.
- `loadSessionStore` (and its strict and diagnostic variants) and `saveSessionStore`.

## Status

Preview (session orchestration). HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental.

## License

MIT
