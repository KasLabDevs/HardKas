import repl from "node:repl";
import fs from "node:fs";
import path from "node:path";
import { createTestHarness } from "@hardkas/testing/harness";
import { calculateContentHash, canonicalStringify } from "@hardkas/artifacts";
import { maskSecrets, formatSompi, parseKasToSompi } from "@hardkas/core";

export async function startConsole(opts: {
  network: string;
  accounts: number;
  balance: bigint;
}): Promise<void> {
  const harness = createTestHarness({
    accounts: opts.accounts,
    initialBalance: opts.balance,
    networkId: opts.network,
  });

  console.log(`\nHardKAS Console — ${opts.network}`);
  console.log(`  ${opts.accounts} accounts, ${formatSompi(opts.balance)} each\n`);
  console.log("  Available globals:");
  console.log("    h              — test harness (send, balanceOf, accountNames, reset, snapshot)");
  console.log("    hash(obj)      — calculateContentHash");
  console.log("    canonical(obj) — canonicalStringify");
  console.log("    kas(str)       — parseKasToSompi ('1.5' → 150000000n)");
  console.log("    sompi(n)       — formatSompi (150000000n → '1.5 KAS')");
  console.log("");
  console.log("  Quick start:");
  console.log("    h.accountNames()");
  console.log("    h.balanceOf('alice')");
  console.log("    h.send({ from: 'alice', to: 'bob', amountSompi: 10_000_000_000n })");
  console.log("");

  // Ensure history directory
  const historyDir = path.join(process.cwd(), ".hardkas");
  const historyPath = path.join(historyDir, "console-history");
  if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

  const r = repl.start({
    prompt: "hardkas> ",
    useGlobal: false,
  });

  // Inject globals
  r.context.h = harness;
  r.context.hash = calculateContentHash;
  r.context.canonical = canonicalStringify;
  r.context.kas = parseKasToSompi;
  r.context.sompi = formatSompi;
  r.context.maskSecrets = maskSecrets;

  // Persistent history
  try {
    if (fs.existsSync(historyPath)) {
      const history = fs.readFileSync(historyPath, "utf-8").split("\n").filter(Boolean).reverse();
      // @ts-ignore - history is not explicitly on the type but it's there at runtime for node repl
      if ((r as any).history) {
        for (const line of history) {
          (r as any).history.push(line);
        }
      }
    }
  } catch {}

  r.on("exit", () => {
    try {
      // @ts-ignore
      const lines = ((r as any).history || []).slice(0, 500).reverse().join("\n");
      fs.writeFileSync(historyPath, lines);
    } catch {}
    console.log("\nBye!");
    process.exit(0);
  });
}
