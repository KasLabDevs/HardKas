# 5-Minute Quickstart

Get up and running with HardKAS in a local simulated environment.

## 1. Installation

Install the SDK and CLI in your project:

```bash
npm install @hardkas/sdk@0.9.1-alpha
npm install -D @hardkas/cli@0.9.1-alpha
```

## 2. Initialize The Workspace

```bash
npx hardkas init .
```

This creates the local `.hardkas/` workspace and a `hardkas.config.ts` whose
default network is `simulated`.

## 3. CLI Workflow

Shortcut mode:

```bash
npx hardkas tx send --from alice --to bob --amount 10 --network simulated --yes
```

Explicit artifact mode:

```bash
npx hardkas tx plan --from alice --to bob --amount 10 --network simulated --out tx-plan.json
npx hardkas artifact inspect tx-plan.json
npx hardkas artifact verify tx-plan.json --strict
npx hardkas tx sign tx-plan.json --account alice --out tx-signed.json
npx hardkas tx send tx-signed.json --network simulated --yes
```

## 4. SDK Workflow

```typescript
import { Hardkas } from "@hardkas/sdk";

async function run() {
  const sdk = await Hardkas.create({
    cwd: process.cwd(),
    autoBootstrap: true,
    network: "simulated"
  });

  const plan = await sdk.tx.plan({
    from: "alice",
    to: "bob",
    amount: "10"
  });

  const signed = await sdk.tx.sign(plan, "alice");
  const { receipt } = await sdk.tx.simulate(signed);

  console.log("Simulation receipt:", receipt.txId);
}

run().catch(console.error);
```

Use `simulate()` for the local loop. Move to `simnet` or testnet only when the
local artifact lifecycle is already stable.
