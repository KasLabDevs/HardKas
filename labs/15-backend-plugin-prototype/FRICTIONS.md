# Lab 15 Frictions: Backend Plugin Prototype

## Missing Toolkit Plugin Options
`IndexerToolkit.open()` does not currently accept a `backend` or `plugin` argument in its `IndexerToolkitOptions`.
- **Friction**: We had to cast to `any` to inject the prototype configuration.
- **Requirement**: `IndexerToolkitOptions` must be expanded to officially accept `backend?: "local" | "rpc" | "postgres"` and `plugin?: BackendPlugin`.

## Hardcoded Store Dependencies
Inside `IndexerToolkit`, components like `this.projection = new ProjectionStoreJson(...)` are instantiated synchronously in the constructor.
- **Friction**: If a backend plugin is injected, the toolkit shouldn't instantiate local JSON stores if the plugin fully replaces them.
- **Requirement**: Toolkits need a factory or dependency injection mechanism to defer store creation or bypass it if a plugin satisfies the capability.

## Synchronous vs Asynchronous Initialization
`IndexerToolkit.open()` is currently synchronous. However, connecting to a real Kaspa RPC node (`new KaspaJsonRpcClient()`) requires `await client.connect()`.
- **Friction**: Plugins require async initialization, which means `IndexerToolkit.open()` must become asynchronous (`await IndexerToolkit.open()`) or plugins must support lazy connections.
- **Requirement**: Convert Toolkit initialization patterns to support async plugin boot sequences.

## Method Interception
`IndexerToolkit.balance()` currently reads directly from `this.projection.get('balances')`.
- **Friction**: To support a plugin backend, `balance()` needs to check if an external backend is registered and delegate to it.
- **Requirement**: The `IndexerToolkit` must implement an internal routing layer. Example:
  ```ts
  public async balance(address: string): Promise<number> {
      if (this.backend) return this.backend.balance(address);
      return (this.projection.get('balances') || {})[address] || 0;
  }
  ```

## Snapshot Constraints
If an external node RPC is used as the backend, `snapshot()` and `restore()` methods become fundamentally different. You cannot snapshot a real node's state locally in the same way you snapshot local `ProjectionStoreJson`.
- **Friction**: `IndexerToolkit` implements `SnapshotParticipant`. If we are using a real node backend, `snapshot()` might need to export a lightweight manifest or be ignored entirely.
- **Requirement**: Plugins need to define their `Snapshot` behavior, and Toolkits must respect plugin capabilities (e.g., `isSnapshotSupported`).
