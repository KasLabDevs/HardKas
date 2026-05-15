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
  network: "${config.network}",
  accounts: ${config.accounts},
  initialBalance: "1000",  // KAS
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

## Quick start

\`\`\`bash
pnpm install
pnpm transfer          # Run a simulated transfer
pnpm balance           # Check account balances
pnpm test              # Run tests
\`\`\`
`
  };
}
