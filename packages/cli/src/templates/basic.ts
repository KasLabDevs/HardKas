export function generateBasicTemplate(config: {
  name: string;
  network: string;
  accounts: number;
}): Record<string, string> {
  return {
    "package.json": JSON.stringify({
      name: config.name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        "test": "vitest run",
        "transfer": "hardkas run scripts/transfer.ts",
        "balance": "hardkas run scripts/check-balance.ts"
      },
      devDependencies: {
        "@hardkas/cli": "alpha",
        "@hardkas/testing": "alpha",
        "@hardkas/artifacts": "alpha",
        "@hardkas/core": "alpha",
        "vitest": "^2.0.0"
      }
    }, null, 2),

    "hardkas.config.ts": `import { defineConfig } from "@hardkas/cli";

export default defineConfig({
  defaultNetwork: "${config.network}",
});
`,

    ".gitignore": `node_modules
dist
.hardkas/
.turbo
*.log
`,

    "scripts/transfer.ts": `// Run with: hardkas run scripts/transfer.ts
// or:       pnpm transfer

const h = (globalThis as any).hardkas;

const [alice, bob] = h.accountNames();

console.log(\`\\nAccounts:\`);
console.log(\`  Alice: \${h.balanceOf(alice)} sompi\`);
console.log(\`  Bob:   \${h.balanceOf(bob)} sompi\`);

console.log(\`\\nSending 10 KAS from \${alice} to \${bob}...\`);
const result = h.send({
  from: alice,
  to: bob,
  amountSompi: 10_000_000_000n
});

console.log(\`  Status: \${result.receipt.status}\`);
console.log(\`  TxId:   \${result.receipt.txId}\`);

console.log(\`\\nBalances after:\`);
console.log(\`  Alice: \${h.balanceOf(alice)} sompi\`);
console.log(\`  Bob:   \${h.balanceOf(bob)} sompi\`);
`,

    "scripts/check-balance.ts": `const h = (globalThis as any).hardkas;

console.log("\\nAccount Balances:");
for (const name of h.accountNames()) {
  console.log(\`  \${name}: \${h.balanceOf(name)} sompi\`);
}
`,

    "test/transfer.test.ts": `import { describe, it, expect } from "vitest";
import { createTestHarness } from "@hardkas/testing";
import "@hardkas/testing/setup";

describe("Transfer workflow", () => {
  it("sends KAS from alice to bob", () => {
    const h = createTestHarness({ accounts: 3, initialBalance: 100_000_000_000n });
    const [alice, bob] = h.accountNames();

    const result = h.send({
      from: alice,
      to: bob,
      amountSompi: 10_000_000_000n
    });

    expect(result.receipt).toBeAccepted();
    expect(result.receipt).toHaveValidTxId();
  });

  it("rejects insufficient funds", () => {
    const h = createTestHarness({ accounts: 2, initialBalance: 10_000_000_000n });
    const [alice, bob] = h.accountNames();

    const result = h.send({
      from: alice,
      to: bob,
      amountSompi: 999_000_000_000n
    });

    expect(result.ok).toBe(false);
    expect(result.receipt).toBeFailed();
  });

  it("produces deterministic txId", () => {
    const h1 = createTestHarness({ accounts: 2, initialBalance: 100_000_000_000n });
    const h2 = createTestHarness({ accounts: 2, initialBalance: 100_000_000_000n });

    const r1 = h1.send({ from: h1.accountNames()[0], to: h1.accountNames()[1], amountSompi: 5_000_000_000n });
    const r2 = h2.send({ from: h2.accountNames()[0], to: h2.accountNames()[1], amountSompi: 5_000_000_000n });

    expect(r1.receipt.txId).toBe(r2.receipt.txId);
  });
});
`,

    "vitest.config.ts": `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
  },
});
`,

    "README.md": `# ${config.name}

Built with [HardKAS](https://github.com/KasLabDevs/HardKas) — Kaspa developer toolkit.

## HardKAS Concepts

HardKAS is a deterministic developer operating environment. Before writing code, it's essential to understand the 5 core concepts of the runtime:

- **Artifact**: The absolute source of truth. An immutable JSON file representing an intent, plan, receipt, or trace, written to \`.hardkas/artifacts/\`.
- **Projection**: Derived state. HardKAS indexes artifacts into a SQLite query-store for the dashboard to read, but SQLite is *never* the authority.
- **Replay**: Deterministic execution. If you give HardKAS an artifact, it will replay the exact causal events that generated it.
- **Snapshot**: A portable, local-only backup of your artifacts and indexed state for fast recovery. It is *not* a consensus proof.
- **Stale**: If a parent artifact is modified or corrupted, all derived artifacts become "stale" because their deterministic causal chain is broken.

## Quick start

Check out the [\`FIRST_STEPS.md\`](./FIRST_STEPS.md) file for a practical guide on how to see these concepts in action.
`,

    "FIRST_STEPS.md": `# First Steps in HardKAS

Welcome to HardKAS! Here is a 5-minute practical guide to *feel* the deterministic mental model.

### 1. Run a local transaction
\`\`\`bash
pnpm transfer
\`\`\`
This will run a simulated transfer and generate an **Artifact**. 
*Notice the output narrating the causal execution.*

### 2. Open the dashboard
\`\`\`bash
hardkas dashboard
\`\`\`
This boots the runtime UI. You will see the event timeline and the state projections.

### 3. Inspect the artifact
Navigate to the "Provenance" tab in the dashboard to see how your transaction artifact relates to the genesis state.

### 4. Run \`hardkas explain\`
In your terminal, copy the Artifact ID from step 1 and run:
\`\`\`bash
hardkas explain <artifact_id>
\`\`\`
This provides a deep, narrative explanation of the artifact's causality without needing the UI.

### 5. Break an artifact intentionally
Go into \`.hardkas/artifacts/\`, find the transaction JSON, and manually change the \`amountSompi\` value.

### 6. Run the consistency doctor
\`\`\`bash
pnpm doctor --strict
\`\`\`
Watch HardKAS detect the causal violation, mark the artifact as corrupted, and explain exactly which deterministic invariant failed.
`
  };
}
