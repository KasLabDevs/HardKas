import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const isWin = process.platform === "win32";
const nodeCmd = "node";

// Resolve the hardkas bin as an absolute path before changing directory
const hardkasBin = path.resolve("packages/cli/dist/index.js");

console.log("=== HardKAS v0.6.1 Operational Invariants Demo ===\n");

/**
 * Run a CLI command, capturing stdout and stderr separately.
 * In JSON mode, validates that stdout is parseable JSON.
 * Human logs are expected on stderr when --json is passed.
 */
function run(cmd, args, { exitOnFail = true, expectJson = false } = {}) {
  const label = `${cmd} ${args.join(" ")}`;
  console.log(`\n> ${label}`);

  const result = spawnSync(cmd, args, {
    stdio: ["pipe", "pipe", "pipe"],
    shell: false
  });

  const stdout = result.stdout?.toString("utf-8")?.trim() || "";
  const stderr = result.stderr?.toString("utf-8")?.trim() || "";

  // Always print stderr (human logs) to console
  if (stderr) {
    for (const line of stderr.split("\n")) {
      console.error(`  [stderr] ${line}`);
    }
  }

  if (result.status !== 0 && exitOnFail) {
    console.error(`\n[FATAL] Command failed with exit code ${result.status}`);
    if (stdout) console.error(`stdout: ${stdout}`);
    process.exit(result.status || 1);
  }

  if (expectJson && stdout) {
    try {
      const parsed = JSON.parse(stdout);
      console.log(JSON.stringify(parsed, null, 2));
      return parsed;
    } catch (e) {
      console.error(`\n[FATAL] stdout is NOT valid JSON:\n${stdout}`);
      process.exit(1);
    }
  } else if (stdout) {
    console.log(stdout);
  }

  return null;
}

// ── Setup ─────────────────────────────────────────────
const demoDir = path.resolve("demo-workspace");
if (fs.existsSync(demoDir)) {
  fs.rmSync(demoDir, { recursive: true, force: true });
}
fs.mkdirSync(demoDir);
process.chdir(demoDir);

// 1. Initialize workspace
run(nodeCmd, [hardkasBin, "init", "--network", "simulated", "--force"]);

// Rewrite config to avoid requiring @hardkas/cli in an empty project
fs.writeFileSync(
  "hardkas.config.ts",
  `
  export default { defaultNetwork: "simulated" };
`
);

// 2. Add demo transfer workflow
fs.mkdirSync("examples/workflows", { recursive: true });
fs.writeFileSync(
  "examples/workflows/demo-transfer.json",
  JSON.stringify(
    {
      steps: [{ type: "network.switch", args: { network: "simulated" } }]
    },
    null,
    2
  )
);

// 3. Boot local dev environment (headless, one-shot)
console.log("\n── Step 1: Dev Init ──");
run(nodeCmd, [hardkasBin, "dev", "--once", "--headless", "--json"], { expectJson: true });

// 4. Dry run workflow
console.log("\n── Step 2: Workflow Dry Run ──");
const dryResult = run(
  nodeCmd,
  [hardkasBin, "workflow", "run", "demo-transfer", "--dry-run", "--json"],
  { expectJson: true }
);

// 5. Real workflow execution
console.log("\n── Step 3: Workflow Execute ──");
const execResult = run(
  nodeCmd,
  [hardkasBin, "workflow", "run", "demo-transfer", "--json"],
  { expectJson: true }
);

// 6. Simulate Crash/Wipe
console.log("\n── Step 4: Simulate Crash ──");
console.log("> rm .hardkas/store.db (Simulating data loss/crash)");
try {
  fs.rmSync(path.join(process.cwd(), ".hardkas", "store.db"), { force: true });
  fs.rmSync(path.join(process.cwd(), ".hardkas", "store.db-wal"), { force: true });
  fs.rmSync(path.join(process.cwd(), ".hardkas", "store.db-journal"), { force: true });
} catch (e) {
  // Ignore
}

// 7. Deterministic Rebuild
console.log("\n── Step 5: Deterministic Rebuild ──");
const rebuildResult = run(
  nodeCmd,
  [hardkasBin, "rebuild", "--from-artifacts", "--json"],
  { expectJson: true }
);

// Assert rebuild found artifacts
if (!rebuildResult || rebuildResult.artifacts?.scanned === 0) {
  console.error(
    "\n[FATAL] Rebuild scanned 0 artifacts — indexer is not seeing canonical artifacts."
  );
  process.exit(1);
}
console.log(
  `  ✔ Rebuild indexed ${rebuildResult.artifacts.indexed} artifact(s), ${rebuildResult.events.indexed} event(s).`
);

// 8. Verify Lineage
console.log("\n── Step 6: Verify Integrity ──");
const verifyResult = run(nodeCmd, [hardkasBin, "verify", "--deep", "--json"], {
  expectJson: true
});

if (!verifyResult || !verifyResult.ok) {
  console.error("\n[FATAL] Verify failed after rebuild.");
  process.exit(1);
}
console.log(`  ✔ Verified ${verifyResult.scanned} artifact(s), all passed.`);

// ── Summary ─────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════");
console.log("  Demo Complete: All Operational Invariants Verified");
console.log("  • stdout JSON purity: ✔ (all --json outputs parsed successfully)");
console.log(
  `  • Rebuild after crash: ✔ (${rebuildResult.artifacts.indexed} artifacts re-indexed)`
);
console.log(
  `  • Verify after rebuild: ✔ (${verifyResult.successCount}/${verifyResult.scanned} passed)`
);
console.log("═══════════════════════════════════════════════════\n");
