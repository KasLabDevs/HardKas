# HardKAS

HardKAS is a local-first, deterministic runtime and SDK for building and testing Kaspa dApps. It manages isolated workspaces, enforces strict semantic invariants, and produces verifiable artifacts for every transaction. 

By prioritizing local execution and cryptographic determinism, HardKAS ensures that if your workflow passes locally, it will behave exactly the same way in CI, on testnet, or on mainnet.

## 1. Install

To use HardKAS in your project, install both the CLI and SDK:

```bash
pnpm add @hardkas/sdk
pnpm add -D @hardkas/cli
```

Initialize your workspace:
```bash
pnpm hardkas init
```

## 2. Your First CLI Command

Run a local simulated network and fork state from testnet:

```bash
pnpm hardkas localnet fork --network testnet-10
```

Verify your workspace artifacts:
```bash
pnpm hardkas verify --strict
```

## 3. Your First SDK Call

Interact with the runtime programmatically using the SDK:

```typescript
import { Hardkas } from '@hardkas/sdk';

async function main() {
  // Automatically bootstrap a workspace in the current directory
  const sdk = await Hardkas.create({ autoBootstrap: true });

  // Plan a deterministic transaction
  const plan = await sdk.tx.plan({
    to: 'kaspatest:q...',
    amount: 100000000n, // Sompis
  });

  console.log('Created Plan Artifact:', plan.artifactId);
}
```

## 4. Next Steps

To dive deeper into the HardKAS ecosystem, check out the consolidated documentation:

- [Quickstart Guide](docs/quickstart.md) - Build your first complete dApp workflow.
- [CLI Reference](docs/cli.md) - Learn about commands, flags, and JSON outputs.
- [SDK Reference](docs/sdk.md) - Deep dive into programmatic usage.
- [Artifacts Guide](docs/artifacts-guide.md) - Understand the immutable artifact lifecycle.
- [Local Development](docs/local-development.md) - Best practices for localnet and testing.
- [Testing & Replay](docs/testing.md) - Using the Replay Engine for deterministic CI.
- [Runtime Contract](RUNTIME_CONTRACT.md) - The strict formal rules of the HardKAS runtime.
