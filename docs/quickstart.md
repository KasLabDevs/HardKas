# Quickstart

Welcome to HardKAS! This guide will take you through building, testing, and verifying a simple transaction workflow in 5 minutes.

## 1. Initialize a Workspace

A HardKAS workspace is an isolated environment containing your configuration and an append-only ledger of events (`.hardkas/`).

```bash
mkdir my-dapp && cd my-dapp
pnpm init
pnpm add @hardkas/sdk
pnpm add -D @hardkas/cli
pnpm hardkas init
```

## 2. Start the Localnet

HardKAS comes with a built-in simulated network.

```bash
pnpm hardkas localnet start --background
```

This starts the simulator and writes the state to `.hardkas/localnet.json`.

## 3. Create a Transaction Script

Create `index.ts`:

```typescript
import { Hardkas } from '@hardkas/sdk';

async function run() {
  const sdk = await Hardkas.create({ autoBootstrap: true });
  
  // 1. Plan
  const plan = await sdk.tx.plan({
    to: 'kaspatest:qz7...',
    amount: 50000000n
  });
  
  // 2. Sign
  const signed = await sdk.tx.sign(plan, {
    privateKey: process.env.KASPA_PRIVATE_KEY
  });
  
  // 3. Broadcast
  const receipt = await sdk.tx.broadcast(signed);
  
  console.log('Transaction confirmed:', receipt.id);
}

run();
```

## 4. Run and Verify

Execute your script using `tsx` or `ts-node`. HardKAS will automatically generate artifacts for the plan, the signed transaction, and the receipt.

Finally, verify that your workspace is cryptographically sound:

```bash
pnpm hardkas verify --strict
```

If it outputs `VERIFIED`, your transaction workflow is completely deterministic and ready for CI.

Next up, read the [Artifacts Guide](artifacts-guide.md) to understand what just happened in your `.hardkas/` folder.
