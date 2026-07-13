# HardKAS API Philosophy

HardKAS is designed as a local-first Kaspa builder framework. To maintain a clean architecture, all code added to the framework must adhere to a strict layer separation.

## Architectural Layers

HardKAS is divided into four distinct layers:

```
Nivel 0
--------
Kaspa Node (The source of truth)

Nivel 1
--------
@hardkas/kaspa-rpc (1:1 mapping with the Node)

Nivel 2
--------
SDK / Toolkit (Business logic, Parsing, Deduplication)

Nivel 3
--------
Developer Apps (The user lives here)
```

## Core Rules

### 1. RPC never has business logic
The `@hardkas/kaspa-rpc` layer must be a 1:1 mapping of the underlying node's wRPC/JSON-RPC interface.
- It enforces strict typing.
- It normalizes errors (e.g. `RpcIndexError` for missing node index flags).
- It NEVER adds abstractions, deduplication, or business logic.

### 2. Toolkit never makes raw calls
The `@hardkas/toolkit` layer is where business logic lives.
- It translates raw Kaspa mechanics into developer-friendly concepts (e.g., wallet watch, resilient subscriptions).
- It NEVER makes raw `fetch` or direct WebSocket connections. It must always use the Nivel 1 RPC layer.

### 3. SDK only orchestrates
The `@hardkas/sdk` layer is the primary entry point for developers.
- It acts as a facade and dependency injection container.
- It wires up the underlying Toolkit and RPC tools.
- It avoids implementing complex business logic internally.

### 4. High-Level APIs must degrade gracefully
If a high-level API requires data, it should attempt to fetch it from the richest available source, falling back gracefully:
`Indexer/Provider -> Node RPC -> Explicit Error`

### 5. Never hide Node limitations
If a developer requests `transaction(txid)` and the node does not have `txindex` enabled (and no indexer is available), HardKAS must bubble up an explicit `RpcIndexError` rather than failing silently or returning cryptic generic JSON-RPC errors.

### 6. Always indicate the data source
High-level querying abstractions should wrap their responses with metadata indicating the source of the data, ensuring the developer knows exactly how the data was obtained:
```typescript
{
  data: ...,
  source: "indexer" | "rpc" | "cache" | "unavailable"
}
```
