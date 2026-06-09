# Real Rusty Kaspad Simnet Transfer

This guide shows the advanced path for sending through a real `rusty-kaspad` node running in `simnet`. It is useful for integration testing, but it is not the default HardKas happy path. Start with the simulated flow first.

## 1. Prepare The Node

Make sure your local node is running and exposes WRPC on the expected simnet endpoint:

```bash
ws://127.0.0.1:18210
```

Your `hardkas.config.ts` can declare both the default simulated network and the explicit simnet RPC target:

```typescript
import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  defaultNetwork: "simulated",
  networks: {
    simulated: {
      kind: "simulated"
    },
    simnet: {
      kind: "kaspa-node",
      network: "simnet",
      rpcUrl: "ws://127.0.0.1:18210"
    }
  }
});
```

Use a funded simnet account. If the account was funded by local mining, wait until the coinbase maturity threshold has passed; visible UTXOs may still be unspendable before maturity.

## 2. Plan

Force the RPC provider so the command contacts the real node instead of the simulated backend:

```bash
hardkas tx plan \
  --from kaspa:sim_my_miner \
  --to kaspa:sim_destination_wallet \
  --amount 100 \
  --network simnet \
  --provider rpc \
  --url ws://127.0.0.1:18210 \
  --out simnet-plan.json
```

The planner requests UTXOs from the node, selects inputs, calculates fees, and writes a `hardkas.txPlan` artifact.

## 3. Inspect And Verify

```bash
hardkas artifact inspect simnet-plan.json
hardkas artifact verify simnet-plan.json --strict
```

This checks the artifact before any private key signs it.

## 4. Sign

```bash
hardkas tx sign simnet-plan.json \
  --account kaspa:sim_my_miner \
  --out simnet-signed.json
```

For mainnet-like flows, signing should remain a separate deliberate step. Mainnet signing is guarded and should not be part of normal local development.

## 5. Send

```bash
hardkas tx send simnet-signed.json \
  --network simnet \
  --provider rpc \
  --url ws://127.0.0.1:18210 \
  --yes
```

If accepted, HardKas writes a receipt artifact and the result becomes queryable after syncing the store:

```bash
hardkas query store sync
hardkas query artifacts list --network simnet
```

## What This Proves

This flow proves that the local artifact pipeline can cross into a real simnet node when explicitly configured. It does not make mainnet the product default.
