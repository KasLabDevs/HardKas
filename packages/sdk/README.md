# `@hardkas/sdk`

The HardKas SDK is the programmatic API for local-first transaction workflows. It exposes the same core model as the CLI: plan, sign, simulate or send, then inspect artifacts and lineage.

## 1. Create A Local SDK

```typescript
import { Hardkas } from "@hardkas/sdk";

const sdk = await Hardkas.create({
  cwd: process.cwd(),
  autoBootstrap: true,
  network: "simulated"
});
```

`autoBootstrap: true` is the easiest local path. It creates or loads the workspace data needed for simulated accounts, artifacts, and local execution.

## 2. Transaction Flow

```typescript
const plan = await sdk.tx.plan({
  from: "alice",
  to: "bob",
  amount: "1",
  network: "simulated"
});

const signed = await sdk.tx.sign(plan, {
  account: "alice"
});

const receipt = await sdk.tx.simulate(signed);
```

For a real RPC-backed node, create the SDK with an explicit network/provider configuration and treat the send step as network-state dependent. Mainnet should remain outside the default local development flow.

## 3. Artifacts And Queries

The SDK can read artifacts, trace lineage, replay local records, and query the local projection:

```typescript
const artifacts = await sdk.query.artifacts.list();
const trace = await sdk.lineage.trace(receipt.txId);
```

The SQLite query store is rebuildable. The durable source of truth is the workspace artifact and event data.

## 4. Contractual Guarantees & Concurrency

HardKAS relies on the authoritative Kaspa network for state validation and conflict resolution. The SDK enforces the following behavioral contracts:

- **Execution Authority**: Network validation remains the ultimate authority.
- **`plan()` is Read-Only**: Transaction planning is strictly read-only and non-reserving. Concurrent `plan()` calls observing the same state are allowed to select overlapping outpoints.
- **Mempool-Aware Spendability**: The planner filters inputs that are already visible in the mempool as pending spends. This is conflict *mitigation*, not reservation.
- **Optimistic Concurrency**: A successful plan does not imply that its inputs will remain spendable at submission time. Application-level serialization can coordinate cooperating intents, but it cannot prevent an external process holding the same keys from spending the same UTXO.
- **Exact Signed Submission**: HardKAS submits exactly what was signed, without hidden mutations.
- **Receipt Semantics**: A `submitted` receipt is persisted *only* after successful transaction submission acceptance by the RPC path. A rejected submission must not produce a `submitted` receipt. (Note: `submitted` ≠ `confirmed` ≠ `final`).
- **Artifact Authority**: Local state queries rely on immutable file artifacts, but network evidence rules absolute truth.
- **Live Sync & Recovery**: Live sync leverages explicit `GetVirtualChainFromBlockV2` catch-up for deterministic gap recovery without relying on fragile heuristic polling.

## 5. Boundary

The SDK should be used from Node.js. Browser applications should talk to the dev server through `@hardkas/client`, not import `@hardkas/sdk` directly.
