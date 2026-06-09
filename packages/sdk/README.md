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

## 4. Boundary

The SDK should be used from Node.js. Browser applications should talk to the dev server through `@hardkas/client`, not import `@hardkas/sdk` directly.
