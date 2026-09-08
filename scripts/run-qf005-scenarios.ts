import path from "path";
import os from "os";
import fs from "fs/promises";
import { scenarioTx02 } from "./qualification/gates/scenario-tx-02.js";
import { scenarioTx05 } from "./qualification/gates/scenario-tx-05.js";
import { scenarioCon02Legit } from "./qualification/gates/scenario-con-02-legit.js";
import { createConsumerDir } from "./qualification/environment/consumer.js";
import { ExecutionContext } from "./qualification/types.js";

async function runQF005Scenarios() {
  console.log("=================================================");
  console.log(" EXECUTING QF-005 QUALIFICATION SCENARIO TRIO");
  console.log(" (TX-02, TX-05, CON-02-LEGIT)");
  console.log("=================================================\n");

  const repoRoot = process.cwd();
  const consumerDir = await createConsumerDir(repoRoot);

  // Set type=module in consumer package.json
  await fs.writeFile(
    path.join(consumerDir, "package.json"),
    JSON.stringify({ name: "qualification-consumer", type: "module" }, null, 2),
    "utf-8"
  );

  // Link local workspace packages into consumer node_modules/@hardkas/
  const hardkasNodeModules = path.join(consumerDir, "node_modules", "@hardkas");
  await fs.mkdir(hardkasNodeModules, { recursive: true });
  const pkgs = await fs.readdir(path.join(repoRoot, "packages"));
  for (const pkg of pkgs) {
    const source = path.join(repoRoot, "packages", pkg);
    const target = path.join(hardkasNodeModules, pkg);
    try {
      await fs.symlink(source, target, "junction");
    } catch (e) {}
  }

  // Initialize HardKAS workspace config and link dev-accounts in consumer directory
  await fs.mkdir(path.join(consumerDir, ".hardkas"), { recursive: true });
  await fs.writeFile(
    path.join(consumerDir, ".hardkas", "config.json"),
    JSON.stringify({ schema: "hardkas.config.v1", network: "simnet" }, null, 2),
    "utf-8"
  );

  const devAccountsSource = path.join(repoRoot, ".hardkas", "dev-accounts");
  const devAccountsTarget = path.join(consumerDir, ".hardkas", "dev-accounts");
  try {
    await fs.symlink(devAccountsSource, devAccountsTarget, "junction");
  } catch (e) {}

  const ctx: ExecutionContext = {
    options: {
      version: "0.12.0-rc.19",
      gates: [],
      fresh: false,
      keepOnFailure: false,
      consumerRoot: os.tmpdir(),
      reportDir: path.join(repoRoot, "reports")
    },
    manifest: {
      runId: `qf005-verification-${Date.now()}`,
      startTime: new Date().toISOString(),
      os: os.platform(),
      osVersion: os.release(),
      arch: os.arch(),
      nodeVersion: process.version,
      npmVersion: "10.0.0",
      packageSource: "local",
      registry: "local",
      hardkasVersion: "0.12.0-rc.19",
      consumerPath: consumerDir,
      logPath: "",
      artifactPath: "",
      reportPath: "",
      results: {},
      decision: "PENDING"
    },
    consumerDir,
    repoRoot,
    capabilities: new Set(["publicNpmConsumer", "rpcReady", "fundedAccount", "matureUtxo"])
  };

  // Run TX-02
  console.log("--- RUNNING TX-02 ---");
  const resTx02 = await scenarioTx02.run(ctx);
  console.log(`TX-02 STATUS: ${resTx02.status}`); console.log(resTx02.evidence.join("\n"));
  for (const a of resTx02.assertions) {
    console.log(`  ${a.passed ? '✅' : '❌'} ${a.name}`);
    if (!a.passed) console.log("     Actual:", JSON.stringify(a.actual), "Error:", a.error);
  }

  // Run TX-05
  console.log("\n--- RUNNING TX-05 ---");
  const resTx05 = await scenarioTx05.run(ctx);
  console.log(`TX-05 STATUS: ${resTx05.status}`); console.log(resTx05.evidence.join("\n"));
  for (const a of resTx05.assertions) {
    console.log(`  ${a.passed ? '✅' : '❌'} ${a.name}`);
    if (!a.passed) console.log("     Actual:", JSON.stringify(a.actual), "Error:", a.error);
  }

  // Run CON-02-LEGIT
  console.log("\n--- RUNNING CON-02-LEGIT ---");
  const resCon02 = await scenarioCon02Legit.run(ctx);
  console.log(`CON-02-LEGIT STATUS: ${resCon02.status}`); console.log(resCon02.evidence.join("\n"));
  for (const a of resCon02.assertions) {
    console.log(`  ${a.passed ? '✅' : '❌'} ${a.name}`);
    if (!a.passed) console.log("     Actual:", JSON.stringify(a.actual), "Error:", a.error);
  }

  const allPassed = resTx02.status === "PASS" && resTx05.status === "PASS" && resCon02.status === "PASS";
  console.log("\n=========================================");
  console.log(`QF-005 SCENARIOS VERDICT: ${allPassed ? "PASS ✅" : "FAIL ❌"}`);
  console.log("=========================================");

  await fs.rm(consumerDir, { recursive: true, force: true });
  process.exit(allPassed ? 0 : 1);
}

runQF005Scenarios().catch(err => {
  console.error("FATAL RUNNER ERROR:", err);
  process.exit(1);
});
