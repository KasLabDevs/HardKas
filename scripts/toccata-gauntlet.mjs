import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const { HardkasSchemas } = await import(pathToFileURL(path.join(root, "packages", "artifacts", "dist", "index.js")));
const { KASPAD_REFERENCE_IMAGE, CPUMINER_REFERENCE_IMAGE, CANONICAL_LOCALNET } = await import(
  pathToFileURL(path.join(root, "packages", "core", "dist", "index.js"))
);

const cli = path.join(root, "packages", "cli", "dist", "index.js");
const realNodeDir = path.join(root, "packages", "cli", "test-gauntlet", "real-node");
const reportPath = path.join(root, "TOCCATA_GAUNTLET_RESULT.json");
const phases = [];

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: pnpm gauntlet:toccata

Runs the local Toccata v2 baseline gauntlet.

Preconditions:
  - Docker Toccata v2 simnet node reachable on ws://127.0.0.1:18210
    (reference image: ${KASPAD_REFERENCE_IMAGE})
  - upstream CPU miner image available locally (docker pull ${CPUMINER_REFERENCE_IMAGE})
  - fixture account has mature simnet funds, or localnet fund has been run
  - managed toolchains installed: hardkas toolchain install kaspa-wasm && hardkas toolchain install silverc

SilverScript capabilities, each reported on its own:
  silver.compile.v1, silver.p2sh.deploy-spend.v1, toccata.covenant.auth-1to1-transition.v1
  (and the golden corpus: fixtures/toccata-v2/silver). No simulated step counts.`);
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
    phases,
    ...details
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function tryDocker(args, stdio = "ignore") {
  execFileSync("docker", args, { cwd: root, stdio });
}

/** `hardkas silver ... --json` in the real-node workspace: the record it wrote. */
function silverJson(args) {
  const out = runHardkas(["silver", ...args, "--json"], { cwd: realNodeDir });
  return JSON.parse(out.slice(out.indexOf("{")));
}

/** The expected refusal of a `hardkas` command, by error code. */
function expectHardkasFailure(args, code) {
  try {
    runHardkas(args, { cwd: realNodeDir });
  } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}${error.message || ""}`;
    if (output.includes(code)) return;
    throw error;
  }
  throw new Error(`expected ${code}, the command succeeded`);
}

const MINER_IMAGE = process.env.HARDKAS_TOCCATA_MINER_IMAGE || CPUMINER_REFERENCE_IMAGE;
const MINER_CONTAINER = CANONICAL_LOCALNET.minerContainerName;
const NODE_CONTAINER = CANONICAL_LOCALNET.containerName;
// Set by the "node identity" phase and written into every report.
let nodeIdentity;
const NODE_GRPC_PORT = "16210";

/**
 * The upstream Kaspa CPU miner, kept running while `--wait` commands poll for
 * their outputs.
 *
 * The miner joins the node's network namespace rather than talking to it over
 * the host: kaspad binds its gRPC server to loopback inside its own container,
 * so no other container can reach it by host address.
 *
 * `--throttle` is a HARNESS-LOCAL knob (`HARDKAS_TOCCATA_MINER_THROTTLE_MS`,
 * default 5 ms): it keeps the local miner from outrunning the node's UTXO
 * validation on this machine. It is not a Kaspa or Toccata protocol parameter,
 * is not evidence of anything about consensus, and does not belong in any
 * capability claim. The value used in a run is recorded in the report.
 */
function startMiner(address) {
  tryDocker(["image", "inspect", MINER_IMAGE]);
  try {
    tryDocker(["rm", "-f", MINER_CONTAINER]);
  } catch {}
  const throttle = process.env.HARDKAS_TOCCATA_MINER_THROTTLE_MS ?? "5";
  tryDocker([
    "run", "-d", "--name", MINER_CONTAINER, `--network=container:${NODE_CONTAINER}`, MINER_IMAGE,
    "--mining-address", address, "--kaspad-address", "127.0.0.1", "--port", NODE_GRPC_PORT,
    "--threads", "1", "--mine-when-not-synced", ...(throttle !== "0" ? ["--throttle", throttle] : [])
  ]);
}

function stopMiner() {
  try {
    tryDocker(["rm", "-f", MINER_CONTAINER]);
  } catch {}
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

  // Managed toolchains: the pinned Kaspa SDK and the pinned silverc release,
  // verified file by file. Nothing from PATH, nothing built locally.
  const doctor = JSON.parse(runHardkas(["silver", "doctor", "--json"]));
  const toolchains = doctor.toolchains;
  if (!toolchains?.["kaspa-wasm"]?.ok || !toolchains?.silverc?.ok) {
    record("managed toolchains", "FAIL", { toolchains });
    throw new Error(`MANAGED_TOOLCHAINS_UNAVAILABLE: ${JSON.stringify(toolchains)}`);
  }
  record("managed toolchains", "PASS", { toolchains, silverscript: doctor.silverscript });

  // Which rusty-kaspad this run is validated against. Not the name on a port:
  // container identity + image digest + endpoint ownership + network/version.
  const { verifyNodeIdentity } = await import(
    pathToFileURL(path.join(root, "packages", "node-runner", "dist", "index.js"))
  );
  nodeIdentity = await verifyNodeIdentity();
  if (!nodeIdentity.verified) {
    record("node identity", "FAIL", { problems: nodeIdentity.problems });
    throw new Error(`NODE_IDENTITY_UNVERIFIED: ${nodeIdentity.problems.join("; ")}`);
  }
  record("node identity", "PASS", {
    container: nodeIdentity.observed.container?.name,
    imageDigest: nodeIdentity.expected.imageDigest,
    serverVersion: nodeIdentity.observed.server?.serverVersion,
    network: nodeIdentity.observed.server?.networkId
  });

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

  // ---- SilverScript v1 against the verified node. Each capability is reported on its own.
  const core = await import(pathToFileURL(path.join(root, "packages", "core", "dist", "index.js")));
  const k = core.loadManagedKaspaWasmSync();
  const bobXOnly = String(new k.PrivateKey(bob.privateKey).toPublicKey().toXOnlyPublicKey().toString());
  const work = path.join(realNodeDir, ".hardkas", "gauntlet-silver");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const corpusDir = path.join(root, "fixtures", "toccata-v2", "silver");
  const writeWork = (name, content) => {
    fs.writeFileSync(path.join(work, name), content);
    return path.relative(realNodeDir, path.join(work, name));
  };
  const capabilities = {};

  // silver.compile.v1: a SignedRelease owned by bob (the golden case's source), reproduced byte for byte.
  const releaseSource = writeWork("signed-release.sil", fs.readFileSync(path.join(corpusDir, "p2sh-signed-release", "contract.sil")));
  const ownerArgs = writeWork("signed-release.args.json", JSON.stringify([{ kind: "bytes", value: [...Buffer.from(bobXOnly, "hex")] }]));
  const compiled = silverJson(["compile", releaseSource, "--args", ownerArgs]);
  record("silver compile", "PASS", {
    capability: "silver.compile.v1",
    compiler: `silverc ${compiled.provenance.compiler.releaseTag} ${compiled.provenance.compiler.binarySha256}`,
    artifactSha256: compiled.provenance.artifactSha256
  });
  const reproduced = silverJson(["verify", compiled.recordPath, "--args", ownerArgs]);
  if (!reproduced.reproduced) throw new Error(`SILVER_NOT_REPRODUCED: ${reproduced.problems.join("; ")}`);
  record("silver compile reproduced", "PASS", { artifactSha256: reproduced.artifactSha256 });
  capabilities["silver.compile.v1"] = "PASS";

  expectHardkasFailure(
    ["silver", "deploy", compiled.recordPath, "--from", bob.name, "--amount", "1", "--network", "mainnet"],
    "SILVERSCRIPT_MAINNET_NOT_ENABLED"
  );
  record("mainnet guard", "PASS");

  startMiner(bob.address);
  try {
    // silver.p2sh.deploy-spend.v1: the node accepts the funding and the signed entry call.
    const deployed = silverJson(["deploy", compiled.recordPath, "--from", bob.name, "--amount", "1", "--wait"]);
    record("silver deploy real", "PASS", {
      capability: "silver.p2sh.deploy-spend.v1",
      txId: deployed.txId,
      address: deployed.address,
      confirmedAtBlockDaaScore: deployed.confirmedAtBlockDaaScore
    });
    const spendArgs = writeWork("release.args.json", JSON.stringify([{ kind: "signature", account: bob.name }]));
    const spent = silverJson(["spend", deployed.recordPath, "--entry", "release", "--to", bob.address, "--args", spendArgs, "--wait"]);
    record("silver spend real", "PASS", {
      capability: "silver.p2sh.deploy-spend.v1",
      txId: spent.txId,
      entry: spent.entry,
      dispatchTag: spent.dispatchTag,
      confirmedAtBlockDaaScore: spent.confirmedAtBlockDaaScore
    });
    capabilities["silver.p2sh.deploy-spend.v1"] = "PASS";

    // toccata.covenant.auth-1to1-transition.v1: genesis bound to the SDK-derived
    // covenant id (reported back by the node), then one state transition.
    const counterSource = writeWork("counter.sil", fs.readFileSync(path.join(corpusDir, "covenant-counter-transition", "current.sil")));
    const counterArgs = writeWork("counter.args.json", JSON.stringify([{ kind: "int", value: 7 }]));
    const counter = silverJson(["compile", counterSource, "--args", counterArgs]);
    // Budget 10 covers the P2PK funding input's Schnorr check (certified by the node in the corpus run).
    // The fee is explicit (the SDK does not price v1 budgets) and must clear the SDK minimum, which
    // storage mass drives: 10 KAS keeps it near 0.004 KAS (a 1 KAS output needs 0.04 KAS).
    const genesis = silverJson([
      "covenant", "genesis", counter.recordPath, "--from", bob.name, "--amount", "10",
      "--compute-budget", "10", "--fee", "1000000", "--wait"
    ]);
    if (genesis.covenantIdFromNode !== genesis.covenantId) {
      throw new Error(`COVENANT_ID_MISMATCH: node ${genesis.covenantIdFromNode}, SDK ${genesis.covenantId}`);
    }
    record("covenant genesis", "PASS", {
      capability: "toccata.covenant.auth-1to1-transition.v1",
      covenantId: genesis.covenantId,
      txId: genesis.txId,
      computeBudget: genesis.computeBudget
    });
    const nextState = writeWork("counter.next-state.json", JSON.stringify({ value: { kind: "int", value: 12 } }));
    const bumpArgs = writeWork("bump.args.json", JSON.stringify([{ kind: "int", value: 5 }]));
    const transition = silverJson([
      "covenant", "transition", genesis.recordPath, "--policy", "bump", "--constructor-args", counterArgs,
      "--state-map", JSON.stringify({ value: 0 }), "--next-state", nextState, "--args", bumpArgs,
      "--compute-budget", "0", "--wait"
    ]);
    if (transition.covenantIdFromNode !== genesis.covenantId) {
      throw new Error(`COVENANT_LINEAGE_BROKEN: successor carries ${transition.covenantIdFromNode}`);
    }
    record("covenant transition", "PASS", {
      capability: "toccata.covenant.auth-1to1-transition.v1",
      covenantId: transition.covenantId,
      txId: transition.txId,
      entry: transition.entry,
      stateGuard: transition.stateGuard
    });
    capabilities["toccata.covenant.auth-1to1-transition.v1"] = "PASS";
  } finally {
    stopMiner();
  }

  // Evidence/replay: the golden corpus, recompiled and re-derived offline, per capability.
  const corpus = JSON.parse(runHardkas(["corpus", "verify", "fixtures/toccata-v2/silver", "--json"]));
  if (!corpus.ok) throw new Error(`SILVER_CORPUS_VERIFY_FAIL: ${JSON.stringify(corpus.issues)}`);
  record("silver golden corpus verify", "PASS", {
    path: "fixtures/toccata-v2/silver",
    cases: corpus.summary.cases,
    recompiled: corpus.summary.compilesRecompiled,
    capabilities: corpus.capabilities
  });

  const report = {
    schema : HardkasSchemas.ToccataGauntletV1,
    status: "HARDKAS_TOCCATA_BASELINE_READY",
    generatedAt: new Date().toISOString(),
    nodeIdentity,
    // Independent claims: one failing never voids the others.
    capabilities,
    harness: {
      minerThrottle: {
        environment: "HARDKAS_TOCCATA_MINER_THROTTLE_MS",
        valueMs: process.env.HARDKAS_TOCCATA_MINER_THROTTLE_MS ?? "5",
        purpose: "harness-local rate limit (not a consensus parameter)"
      }
    },
    phases
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("HARDKAS_TOCCATA_BASELINE_READY");
}

// The failing real-node command and its output, when run-real-node.mjs recorded one.
function readRealNodeFailure() {
  const failurePath = path.join(realNodeDir, ".hardkas", "real-node-failure.json");
  try {
    const failure = JSON.parse(fs.readFileSync(failurePath, "utf8"));
    const tail = (s) => String(s || "").trim().split("\n").slice(-12).join("\n");
    return { cmd: failure.cmd, stderrTail: tail(failure.stderr), stdoutTail: tail(failure.stdout) };
  } catch {
    return undefined;
  }
}

main().catch((error) => {
  const failure = readRealNodeFailure();
  record("gauntlet aborted", "FAIL", {
    message: error?.message || String(error),
    ...(failure ? { failure } : {})
  });
  writeReport("TOCCATA_NORMALIZATION_BLOCKED_RELEASE_ENV", {
    blocker: error?.message || String(error),
    ...(nodeIdentity ? { nodeIdentity } : {}),
    ...(failure ? { failure } : {}),
    nextRequiredCommand: "pnpm build && pnpm test && pnpm gauntlet:toccata"
  });
  console.error(error);
  process.exit(1);
});
