---
title: Architecture
---

HardKAS enforces a strict layer separation to maintain a clean boundary with the underlying node.

### Level 0 (Foundations)

`core`, `config`, `observability`. Zero external state.

### Level 1 (Core Primitives)

`artifacts`, `tx-builder`, `kaspa-rpc`, `simulator`, `localnet`. Immutable truth.

### Level 2 (Composition / SDK)

`sdk`. Facade unifying primitives into developer workflows.

### Level 3 (Extensions)

`query-store`, `jobs`, `pskt-native`, `escrow`, `testing`.

### Level 4 (Presentation)

`cli`, `dev-server`, `client`.
