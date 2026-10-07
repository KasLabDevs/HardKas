# 5-Minute Quickstart

Get up and running with HardKAS in a local simulated environment.

## 1. Installation

Install the SDK and CLI in your project:

```bash
npm install @hardkas/sdk@0.12.0-rc.27
npm install -D @hardkas/cli@0.12.0-rc.27
```

## 2. Initialize The Workspace

```bash
npx hardkas init .
```

This creates the local `.hardkas/` workspace and a `hardkas.config.ts` whose
default network is `simulated`. It also installs the Kaspa WASM SDK this release
pins (`kaspa-wasm`, from the official rusty-kaspa release) into
`~/.hardkas/toolchains/` and checks it against its pinned SHA-256; signing and
planning use it. If that step fails, `init` stops with an error and
`npx hardkas toolchain install kaspa-wasm` installs it by hand.

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

The SDK is published as ES modules. Run this from an ES module: a project with
`"type": "module"` in its `package.json`, or a `.mjs` file. `hardkas init` sets
`"type": "module"` only when it creates the `package.json`; in step 1 above
`npm install` already created one, so add the field yourself. In a CommonJS
project (the `npm init -y` default) the import fails.

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

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Use `simulate()` for the local loop. Move to `simnet` or testnet only when the
local artifact lifecycle is already stable.
