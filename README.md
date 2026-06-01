<div align="center">
  <img src="https://raw.githubusercontent.com/KasLabDevs/HardKas/main/docs/logo.png" alt="HardKAS Logo" width="280"/>
  <br/>
  <h3>Local-first, deterministic developer OS for Kaspa and Igra</h3>

  <p>
    <a href="https://github.com/KasLabDevs/HardKas/actions"><img alt="Build Status" src="https://img.shields.io/github/actions/workflow/status/KasLabDevs/HardKas/ci.yml?branch=main&style=flat-square&color=10b981"></a>
    <a href="https://www.npmjs.com/package/@hardkas/sdk"><img alt="NPM Version" src="https://img.shields.io/npm/v/@hardkas/sdk?style=flat-square&color=10b981"></a>
    <a href="https://github.com/KasLabDevs/HardKas/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/KasLabDevs/HardKas?style=flat-square&color=1e2633"></a>
  </p>
</div>

---

**HardKAS** is a local-first, cryptographically deterministic developer environment for Kaspa L1 and Igra L2 workflows. It replaces chaotic testnet scripts with verifiable, offline-first artifact pipelines.

If it passes locally in HardKAS, it passes in CI.

## ⚡ 5-Minute Quickstart

### 1. Install
Add HardKAS and its SDK to your project. By design, HardKAS is installed locally to ensure strict version reproducibility.

```bash
pnpm add @hardkas/sdk
pnpm add -D @hardkas/cli
```

### 2. Initialize
Create your isolated workspace (the `.hardkas/` directory) and verify the strict semantic boundaries.

```bash
pnpm hardkas init
pnpm hardkas doctor --json
```

### 3. Your First CLI Command
Fork the network state and verify that your local environment is cryptographically sound.

```bash
# Fork L1 state for local testing
pnpm hardkas localnet fork --network testnet-10

# Verify workspace invariants
pnpm hardkas verify --strict
```

### 4. Your First SDK Call
Interact with the HardKAS runtime programmatically to plan deterministic L2 transactions.

```typescript
import { Hardkas } from '@hardkas/sdk';

async function main() {
  // Bootstraps a strict, locked workspace in the current directory
  const sdk = await Hardkas.create({ autoBootstrap: true });

  // Plan an Igra L2 transaction deterministically
  const plan = await sdk.tx.plan({
    to: 'kaspatest:qz7...',
    amount: 50000000n, // Sompis
  });

  console.log('✅ Created Artifact:', plan.artifactId);
}

main();
```

---

## 📚 The Source of Truth

We don't believe in graveyard documentation or fragmented markdown files. **Everything you need to know**—from causal graphs and the Replay Engine, to CLI workflows and the SDK reference—is consolidated into our interactive HTML documentation.

👉 **[Open the HardKAS Documentation (docs/index.html)](docs/index.html)**

### Core Contracts
HardKAS enforces strict runtime behavior. If you are building tooling or agents on top of HardKAS, you must adhere to these invariants:
- [RUNTIME_CONTRACT.md](RUNTIME_CONTRACT.md): The non-negotiable semantic boundaries of the tool.
- [RUNTIME_SEMANTICS.md](RUNTIME_SEMANTICS.md): Details on file locking, telemetry, and persistence guarantees.

---

<div align="center">
  <i>Built for developers who value determinism.</i>
</div>
