# Zero to App: Kaspa Builder Walkthrough

Welcome to HardKAS. This guide takes you from zero to a functioning Kaspa local application in under 10 minutes.

## 1. Install & Initialize
Ensure you have `pnpm` and Node.js 22.5+ installed.

```bash
pnpm add -g @hardkas/cli
hardkas init my-kaspa-app
cd my-kaspa-app
pnpm install
```

## 2. Start the Local Network
HardKAS is local-first. We simulate Kaspa instantly using the in-memory engine, or you can hook into a real Docker-based simnet.

For this guide, we'll use the default local engine (requires no setup).

## 3. Write Your App
Open `src/main.ts` and replace it with:

```ts
import { WalletToolkit, IndexerToolkit } from '@hardkas/toolkit';

async function main() {
  // 1. Open the Indexer to read the DAG
  const indexer = await IndexerToolkit.open();
  await indexer.connect();

  // 2. Open a local Wallet to hold keys and craft transactions
  const wallet = await WalletToolkit.open('my-wallet');
  await wallet.create();

  // 3. Check Balance
  const address = wallet.address;
  const balance = await indexer.balance(address);
  
  console.log(`Address: ${address}`);
  console.log(`Balance: ${balance} Sompi`);
}

main().catch(console.error);
```

## 4. Run & See Evidence
Run your script:
```bash
npx tsx src/main.ts
```

HardKAS intercepts the execution and securely sandboxes the state. 
Check your `.hardkas/evidence` directory to see the cryptographic proof of exactly what happened during that execution!

## Next Steps
To run this exact same application against a *real* Kaspa node, you simply inject the RPC Plugin. See **[Troubleshooting Docker/RPC](docs/book/11-runtime-docker.md)** for more.
