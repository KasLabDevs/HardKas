# Dev-Runtime

The `hardkas dev` namespace provides a cohesive orchestration layer over your workspace.

## Dev-Server
The HardKAS Dev-Server acts as the bridge between your immutable filesystem artifacts and your browser facade.

Features:
- **SSE Telemetry:** Live streaming of artifact updates.
- **Replay Endpoints:** Trigger deterministic simulations of past transactions.
- **Explainability:** Deconstruct workflows into human-readable policies and warnings.

## Commands
- `hardkas dev server`: Starts the API server.
- `hardkas dev doctor`: Validates workspace health. Use `--release` for strict release gating.
- `hardkas dev init`: Scaffolds `hardkas.config.ts`.
