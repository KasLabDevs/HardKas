# `@hardkas/sdk`

The HardKAS SDK acts as the programmatic boundary between developer scripts and the isolated HardKAS runtime engine.

## 1. Bootstrapping Variants

The SDK injects dependencies via a `RuntimeContext` container. This container abstracts the filesystem, logging, and RPC configurations.

### Flow: Auto-Bootstrap
```typescript
const sdk = await Hardkas.create({ autoBootstrap: true });
```
1. The engine scans upward from `process.cwd()` to find `.hardkas/`.
2. It acquires necessary read/write workspace locks.
3. If the workspace does not exist, it automatically creates it, generating a new developer identity and local configuration.

### Variant: Manual Policy Engine
When running inside an AI agent (like KI) or CI environment, `autoBootstrap` is disabled.
1. The SDK enforces the 4 Policy Dimensions (Local isolation, Determinism, Replayability, Mainnet Guards).
2. It calls `hardkas doctor --json` internally before initializing.
3. If the environment fails policy checks (e.g., trying to write to mainnet without the explicit `--unsafe-mainnet` flag), the instantiation throws synchronously.

## 2. Transaction Flow & Dry-Runs

All SDK transaction methods follow the Plan -> Sign -> Broadcast pipeline.

### Flow: `sdk.tx.plan`
1. The SDK calculates the deterministic payload size.
2. It interacts with the `Query Store` to fetch available UXTOs (for L1) or Nonces (for L2).
3. It emits a `PlanCreated` event to the `events.jsonl` ledger.
4. It persists a `TxPlan` artifact in `.hardkas/artifacts/`.

### Variant: Dry-Run Execution
```typescript
const plan = await sdk.tx.plan({ to, amount, dryRun: true });
```
1. The SDK skips steps 3 and 4.
2. No locks are acquired.
3. No events are emitted to the append-only ledger.
4. The plan is returned purely in-memory as a preview object, which throws an exception if you attempt to pass it into `sdk.tx.sign`.
