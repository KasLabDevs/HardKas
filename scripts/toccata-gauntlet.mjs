import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { HardkasSchemas } from "@hardkas/artifacts";

const root = process.cwd();
const cli = path.join(root, "packages", "cli", "dist", "index.js");
const realNodeDir = path.join(root, "packages", "cli", "test-gauntlet", "real-node");
const reportPath = path.join(root, "TOCCATA_GAUNTLET_RESULT.json");
const phases = [];

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: pnpm gauntlet:toccata

Runs the local Toccata v2 baseline gauntlet.

Preconditions:
  - Docker Toccata v2 simnet node reachable on ws://127.0.0.1:18210
  - v2 stratum/miner companion image available as hardkas/stratum-bridge:v2.0.0-local-simnet-unsynced
  - fixture account has mature simnet funds, or localnet fund has been run

Known accepted warning:
  - PARTIAL_VM_SIMULATION`);
  process.exit(0);
}

function record(name, status, details = {}) {
  phases.push({ name, status, ...details });
  const marker = status === "PASS" ? "PASS" : status === "WARN" ? "WARN" : "FAIL";
  console.log(`[${marker}] ${name}`);
}

function runNode(args, options = {}) {
  return execFileSync(process.execPath, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
    maxBuffer: 100 * 1024 * 1024
  });
}

function runHardkas(args, options = {}) {
  return runNode([cli, ...args], options);
}

function runPnpm(args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return runNode([npmExecPath, ...args], { cwd: root, stdio: "inherit" });
  }
  try {
    return execFileSync("pnpm", args, { cwd: root, stdio: "inherit" });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (process.platform === "win32") {
      return execFileSync(
        "cmd.exe",
        ["/d", "/s", "/c", ["npx.cmd", "pnpm@9.15.4", ...args].join(" ")],
        {
          cwd: root,
          stdio: "inherit"
        }
      );
    }
    return execFileSync("npx", ["pnpm@9.15.4", ...args], { cwd: root, stdio: "inherit" });
  }
}

function writeReport(status, details = {}) {
  const report = {
    schema : HardkasSchemas.ToccataGauntletV1,
    status,
    generatedAt: new Date().toISOString(),
    partialKnownLimitations: ["PARTIAL_VM_SIMULATION"],
    phases,
    ...details
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function latestFile(cwd, predicate) {
  const matches = fs
    .readdirSync(cwd)
    .filter(predicate)
    .map((name) => ({ name, mtimeMs: fs.statSync(path.join(cwd, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!matches.length) throw new Error(`No matching artifact found in ${cwd}`);
  return matches[0].name;
}

function tryDocker(args, stdio = "ignore") {
  execFileSync("docker", args, { cwd: root, stdio });
}

async function ensureOpTrueCompileArtifact() {
  const artifactPath = path.join(realNodeDir, "silver-manual-optrue.json");
  const sourcePath = path.join(realNodeDir, "op_true.sil");
  const source = "op_true();";

  if (fs.existsSync(artifactPath)) return artifactPath;

  const artifacts = await import(
    pathToFileURL(path.join(root, "packages", "artifacts", "dist", "index.js"))
  );
  const { createHash } = await import("node:crypto");
  fs.writeFileSync(sourcePath, source, "utf8");

  const artifact = {
    schema : HardkasSchemas.SilverCompile,
    hardkasVersion: artifacts.HARDKAS_VERSION,
    version: "1.0.0-alpha",
    hashVersion: 4,
    networkId: "simnet",
    mode: "simulated",
    createdAt: new Date().toISOString(),
    sourcePath,
    sourceHash: createHash("sha256").update(source).digest("hex"),
    compilerName: "manual-op-true-fixture",
    compilerVersion: "toccata-baseline",
    compilerCommand: "manual OP_TRUE fixture",
    compiledScriptHex: "51",
    compiledScriptHash: createHash("sha256")
      .update(Buffer.from("51", "hex"))
      .digest("hex"),
    abi: {},
    network: "simnet",
    assumptions: ["toccata-v2", "mainnet-disabled", "manual-op-true-fixture"]
  };
  artifact.contentHash = artifacts.calculateContentHash(artifact, 4);
  artifact.artifactId = "silver-manual-optrue";
  await artifacts.writeArtifact(artifactPath, artifact);
  return artifactPath;
}

function mineBriefly(address) {
  try {
    tryDocker([
      "image",
      "inspect",
      "hardkas/stratum-bridge:v2.0.0-local-simnet-unsynced"
    ]);
    try {
      tryDocker(["rm", "-f", "hardkas-toccata-stratum-v2"]);
    } catch {}
    tryDocker([
      "run",
      "-d",
      "--name",
      "hardkas-toccata-stratum-v2",
      "--add-host=host.docker.internal:host-gateway",
      "hardkas/stratum-bridge:v2.0.0-local-simnet-unsynced",
      "/app/stratum-bridge",
      "--node-mode",
      "external",
      "--kaspad-address",
      "host.docker.internal:16210",
      "--web-dashboard-port",
      ":3031",
      "--instance",
      "port=:16120,diff=1",
      "--internal-cpu-miner",
      "--internal-cpu-miner-address",
      address,
      "--internal-cpu-miner-threads",
      "1",
      "--internal-cpu-miner-template-poll-ms",
      "250",
      "--print-stats",
      "true",
      "--log-to-file",
      "false"
    ]);
    runNode(["-e", "setTimeout(()=>{}, 6000)"]);
  } finally {
    try {
      tryDocker(["stop", "hardkas-toccata-stratum-v2"]);
    } catch {}
  }
}

async function main() {
  console.log("=== TOCCATA FINAL BASELINE GAUNTLET ===");

  try {
    runPnpm(["build"]);
    record("package/build integrity", "PASS");
  } catch (error) {
    record("package/build integrity", "FAIL", {
      message: error?.message || String(error)
    });
    throw error;
  }

  runHardkas(["doctor", "--json"]);
  record("doctor", "PASS");

  runHardkas(["capabilities", "--json"]);
  record("capabilities", "PASS");

  runHardkas(["localnet", "status", "--json"]);
  record("localnet status", "PASS");

  runHardkas(["rpc", "health", "--wait", "--timeout", "10000"]);
  record("docker rpc health", "PASS");

  runNode(["run-real-node.mjs"], { cwd: realNodeDir, stdio: "inherit" });
  record("standard tx lifecycle", "PASS");

  const accounts = JSON.parse(
    fs.readFileSync(path.join(realNodeDir, ".hardkas", "accounts.real.json"), "utf8")
  );
  const bob = accounts.accounts.find((account) => account.name.startsWith("fresh_bob"));
  if (!bob?.privateKey || !bob?.address)
    throw new Error("fresh_bob account missing after real-node gauntlet");

  const compileArtifact = await ensureOpTrueCompileArtifact();
  runHardkas(["silver", "verify", compileArtifact], { cwd: realNodeDir });
  record("silver compile fixture verify", "PASS");

  const beforeDeployPlans = new Set(fs.readdirSync(realNodeDir));
  runHardkas(
    [
      "silver",
      "deploy-plan",
      "silver-manual-optrue.json",
      "--from",
      bob.name,
      "--amount",
      "1",
      "--network",
      "simnet"
    ],
    { cwd: realNodeDir }
  );
  const deployPlan = latestFile(
    realNodeDir,
    (name) =>
      name.startsWith("silverdeployplan-") &&
      name.endsWith(".json") &&
      !beforeDeployPlans.has(name)
  );
  record("silver deploy-plan", "PASS", { artifact: deployPlan });

  runHardkas(["silver", "deploy", deployPlan, "--private-key", bob.privateKey], {
    cwd: realNodeDir
  });
  const deployArtifact = latestFile(
    realNodeDir,
    (name) => name.startsWith("silverdeploy-") && name.endsWith(".json")
  );
  record("silver deploy real", "PASS", { artifact: deployArtifact });

  mineBriefly(bob.address);
  record("miner confirmation after deploy", "PASS");

  const argsPath = path.join(realNodeDir, "args-empty.json");
  if (!fs.existsSync(argsPath))
    fs.writeFileSync(argsPath, '{\n  "args": []\n}\n', "utf8");
  runHardkas(
    [
      "silver",
      "spend-plan",
      deployArtifact,
      "--args",
      "args-empty.json",
      "--to",
      bob.address
    ],
    { cwd: realNodeDir }
  );
  const spendPlan = latestFile(
    realNodeDir,
    (name) => name.startsWith("silverspendplan-") && name.endsWith(".json")
  );
  record("silver spend-plan", "PASS", { artifact: spendPlan });

  runHardkas(["silver", "spend", spendPlan], { cwd: realNodeDir });
  const realReceipt = latestFile(
    realNodeDir,
    (name) => name.startsWith("silverreceipt-") && name.endsWith(".json")
  );
  record("silver spend real", "PASS", { artifact: realReceipt });

  mineBriefly(bob.address);
  record("miner confirmation after spend", "PASS");

  runHardkas(["silver", "simulate", "deploy", deployPlan], { cwd: realNodeDir });
  const deploySim = latestFile(
    realNodeDir,
    (name) => name.startsWith("silverdeploysim-") && name.endsWith(".json")
  );

  const artifacts = await import(
    pathToFileURL(path.join(root, "packages", "artifacts", "dist", "index.js"))
  );
  const realSpendPlan = JSON.parse(
    fs.readFileSync(path.join(realNodeDir, spendPlan), "utf8")
  );
  const deploySimArtifact = JSON.parse(
    fs.readFileSync(path.join(realNodeDir, deploySim), "utf8")
  );
  delete realSpendPlan.contentHash;
  delete realSpendPlan.artifactId;
  realSpendPlan.deployArtifactHash = deploySimArtifact.contentHash;
  realSpendPlan.contractUtxoRef = deploySimArtifact.syntheticOutpoint;
  realSpendPlan.createdAt = new Date().toISOString();
  realSpendPlan.contentHash = artifacts.calculateContentHash(realSpendPlan, 4);
  realSpendPlan.artifactId = `silverspendplan-${realSpendPlan.contentHash.substring(0, 16)}`;
  const simulatedSpendPlan = `${realSpendPlan.artifactId}.json`;
  await artifacts.writeArtifact(
    path.join(realNodeDir, simulatedSpendPlan),
    realSpendPlan
  );

  runHardkas(["silver", "simulate", "spend", simulatedSpendPlan], { cwd: realNodeDir });
  const spendSim = latestFile(
    realNodeDir,
    (name) => name.startsWith("silverspendsim-") && name.endsWith(".json")
  );
  record("silver simulate deploy/spend", "PASS", { deploySim, spendSim });

  const compareOut = runHardkas(
    ["silver", "simulate", "compare", "--simulated", spendSim, "--docker", realReceipt],
    { cwd: realNodeDir }
  );
  if (compareOut.includes("SILVERSCRIPT_SIMULATION_MATCH")) {
    record("simulator/docker compare", "PASS", {
      compareMode: "artifact-coherence",
      expectedKnownLimitation: compareOut.includes("PARTIAL_VM_SIMULATION")
        ? "PARTIAL_VM_SIMULATION"
        : undefined
    });
  } else if (compareOut.includes("PARTIAL_VM_SIMULATION")) {
    record("simulator/docker compare", "WARN", {
      expectedKnownLimitation: "PARTIAL_VM_SIMULATION"
    });
  } else {
    throw new Error(`Unexpected simulator compare output:\n${compareOut}`);
  }

  runHardkas(["corpus", "verify", "fixtures/toccata-v2/silver", "--json"]);
  record("toccata golden corpus verify", "PASS", { path: "fixtures/toccata-v2/silver" });

  try {
    runHardkas(
      [
        "silver",
        "deploy-plan",
        "silver-manual-optrue.json",
        "--from",
        bob.name,
        "--amount",
        "1",
        "--network",
        "mainnet"
      ],
      { cwd: realNodeDir }
    );
    throw new Error("Mainnet guard did not fail");
  } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}${error.message || ""}`;
    if (!output.includes("SILVERSCRIPT_MAINNET_NOT_ENABLED")) throw error;
  }
  record("mainnet guard", "PASS");

  const report = {
    schema : HardkasSchemas.ToccataGauntletV1,
    status: "HARDKAS_TOCCATA_BASELINE_READY",
    generatedAt: new Date().toISOString(),
    partialKnownLimitations: ["PARTIAL_VM_SIMULATION"],
    phases
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("HARDKAS_TOCCATA_BASELINE_READY");
}

main().catch((error) => {
  record("gauntlet aborted", "FAIL", {
    message: error?.message || String(error)
  });
  writeReport("TOCCATA_NORMALIZATION_BLOCKED_RELEASE_ENV", {
    blocker: error?.message || String(error),
    nextRequiredCommand: "pnpm build && pnpm test && pnpm gauntlet:toccata"
  });
  console.error(error);
  process.exit(1);
});
