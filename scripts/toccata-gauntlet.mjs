import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const { HardkasSchemas } = await import(pathToFileURL(path.join(root, "packages", "artifacts", "dist", "index.js")));
const { KASPAD_REFERENCE_IMAGE, CPUMINER_REFERENCE_IMAGE, CANONICAL_LOCALNET, endpointNodeExpectation } = await import(
  pathToFileURL(path.join(root, "packages", "core", "dist", "index.js"))
);

const cli = path.join(root, "packages", "cli", "dist", "index.js");
const realNodeDir = path.join(root, "packages", "cli", "test-gauntlet", "real-node");
const phases = [];

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: pnpm gauntlet:toccata [--url <ws-url> --node-container <name> --grpc-port <n> [--miner-label <key=value>]...] [--report <path>]

Runs the local Toccata v2 baseline gauntlet.

Preconditions:
  - Docker Toccata v2 simnet node reachable on ws://127.0.0.1:18210
    (reference image: ${KASPAD_REFERENCE_IMAGE})
  - upstream CPU miner image available locally (docker pull ${CPUMINER_REFERENCE_IMAGE})
  - fixture account has mature simnet funds, or localnet fund has been run
  - managed toolchains installed: hardkas toolchain install kaspa-wasm && hardkas toolchain install silverc

--url: run on a simnet node HardKAS does not manage instead of the canonical localnet. The node is proven by what it
  reports at that URL (simnet, the reference rusty-kaspad version, synced, not the simulator), never by the canonical
  container check; the canonical localnet and its miner are not used. --node-container is the Docker container that
  runs it (the miner joins its network namespace, as <name>-miner, with the --miner-label labels) and --grpc-port the
  port kaspad's gRPC listens on inside it. The Silver commands run with --url. Simnet only. A node whose only problem
  is "not synced" (an idle simnet node with no peers) is warmed up first: the miner runs in its container until the
  full check passes (HARDKAS_GAUNTLET_WARMUP_TIMEOUT_MS, default 60000).
--report: where the JSON result is written (default docs/internal/audit/gauntlet/TOCCATA_GAUNTLET_RESULT.json).

SilverScript capabilities, each reported on its own:
  silver.compile.v1, silver.p2sh.deploy-spend.v1, toccata.covenant.auth-1to1-transition.v1
  (and the golden corpus: fixtures/toccata-v2/silver). No simulated step counts.`);
  process.exit(0);
}

/** `--name value` (the last one), or every `--name value` when `all`. */
function argOf(name, { all = false } = {}) {
  const values = [];
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === name) {
      const value = process.argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`GAUNTLET_ARGUMENT_MISSING: ${name} needs a value`);
      values.push(value);
      i++;
    }
  }
  return all ? values : values[values.length - 1];
}

const reportPath = path.resolve(root, argOf("--report") ?? path.join("docs", "internal", "audit", "gauntlet", "TOCCATA_GAUNTLET_RESULT.json"));
// L1-CORE-1 B3: --url, a simnet node HardKAS does not manage (see --help).
const NODE_URL = argOf("--url");
const URL_MODE = NODE_URL !== undefined;

function record(name, status, details = {}) {
  phases.push({ name, status, ...details });
  const marker = status === "PASS" ? "PASS" : status === "WARN" ? "WARN" : status === "SKIP" ? "SKIP" : "FAIL";
  console.log(`[${marker}] ${name}`);
}

function runNode(args, options = {}) {
  return execFileSync(process.execPath, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
    maxBuffer: 100 * 1024 * 1024,
    ...(options.env ? { env: options.env } : {})
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

/** Which node the run used: the canonical localnet, or (--url) one HardKAS does not manage. */
function nodeTarget() {
  return URL_MODE
    ? { mode: "endpoint", url: NODE_URL, container: NODE_CONTAINER, miner: MINER_CONTAINER, network: "simnet" }
    : { mode: "canonical-localnet", container: CANONICAL_LOCALNET.containerName, network: CANONICAL_LOCALNET.network };
}

function writeReport(status, details = {}) {
  const report = {
    schema : HardkasSchemas.ToccataGauntletV1,
    status,
    generatedAt: new Date().toISOString(),
    node: nodeTarget(),
    phases,
    ...details
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function tryDocker(args, stdio = "ignore") {
  execFileSync("docker", args, { cwd: root, stdio });
}

/** `hardkas silver ... --json` in the real-node workspace: the record it wrote. `onNode`: the command talks to the node. */
function silverJson(args, { onNode = false } = {}) {
  const out = runHardkas(["silver", ...args, ...(onNode && URL_MODE ? ["--url", NODE_URL] : []), "--json"], { cwd: realNodeDir });
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
const NODE_CONTAINER = URL_MODE ? argOf("--node-container") : CANONICAL_LOCALNET.containerName;
const MINER_CONTAINER = URL_MODE ? `${NODE_CONTAINER}-miner` : CANONICAL_LOCALNET.minerContainerName;
const NODE_GRPC_PORT = URL_MODE ? argOf("--grpc-port") : String(CANONICAL_LOCALNET.ports.rpc);
const MINER_LABELS = URL_MODE ? argOf("--miner-label", { all: true }) : [];
if (URL_MODE) {
  let url;
  try {
    url = new URL(NODE_URL);
  } catch {
    url = undefined;
  }
  if (!url || (url.protocol !== "ws:" && url.protocol !== "wss:")) throw new Error(`GAUNTLET_URL_INVALID: --url ${NODE_URL} is not a ws:// URL`);
  if (!NODE_CONTAINER || !NODE_GRPC_PORT || !/^\d+$/.test(NODE_GRPC_PORT)) {
    throw new Error("GAUNTLET_URL_MODE_INCOMPLETE: --url needs --node-container <name> and --grpc-port <n> (the miner joins that container)");
  }
  // L1-CORE-1 B6 (review): the miner is <node-container>-miner and is removed with `docker rm -f`; a node container whose
  // miner name is the canonical miner's (e.g. --node-container hardkas-toccata) would remove the canonical miner.
  if (NODE_CONTAINER === CANONICAL_LOCALNET.containerName || MINER_CONTAINER === CANONICAL_LOCALNET.minerContainerName) {
    throw new Error("GAUNTLET_URL_MODE_CANONICAL: --url never uses the canonical localnet container or its miner (run without --url for those)");
  }
  for (const label of MINER_LABELS) {
    if (!/^[A-Za-z0-9._-]+=[^,\s]*$/.test(label)) throw new Error(`GAUNTLET_LABEL_INVALID: --miner-label ${label} is not key=value`);
  }
}
// Set by the "node identity" phase and written into every report.
let nodeIdentity;
// --url warm-up: the real-node phase's fixture address (a public simnet test key, never real funds), so the blocks
// mined to bring an idle node back to "synced" only add to the funds that phase spends anyway.
const WARMUP_ADDRESS = process.env.HARDKAS_GAUNTLET_WARMUP_ADDRESS || "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";

/**
 * The node proved all it must except being synced. INT9-A: being synced is the record's own `sync` verdict, apart from
 * the identity (a verified node may still be unsynced); identity records of an earlier build carried it as a problem.
 */
function isOnlyUnsynced(identity) {
  if (identity.verified) return identity.sync !== undefined && identity.sync !== "synced";
  return identity.problems.length > 0 && identity.problems.every((p) => /is not synced$/.test(p));
}

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
    "run", "-d", "--name", MINER_CONTAINER, ...MINER_LABELS.flatMap((label) => ["--label", label]),
    `--network=container:${NODE_CONTAINER}`, MINER_IMAGE,
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
  // With --url: the node's own report at that URL (verification "endpoint"); no container is inspected.
  const identityOptions = URL_MODE ? { expected: endpointNodeExpectation(NODE_URL, "simnet") } : {};
  nodeIdentity = await verifyNodeIdentity(identityOptions);
  // INT9-A: the managed localnet is held to the same sync rule now (I-3), so it is warmed up the same way
  if (isOnlyUnsynced(nodeIdentity)) {
    // A simnet node with no peers reports "not synced" once its last block is old (an idle node, or the build above
    // took minutes). It has already proven everything else (simnet, the reference version, not the simulator): a few
    // blocks from the miner, in its own container, bring it back; the full check then runs again from scratch.
    const started = Date.now();
    startMiner(WARMUP_ADDRESS);
    try {
      const deadline = started + Number(process.env.HARDKAS_GAUNTLET_WARMUP_TIMEOUT_MS || "60000");
      while (isOnlyUnsynced(nodeIdentity) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        nodeIdentity = await verifyNodeIdentity(identityOptions);
      }
    } finally {
      stopMiner();
    }
    record("node warm-up", nodeIdentity.verified && !isOnlyUnsynced(nodeIdentity) ? "PASS" : "FAIL", {
      reason: "the node reported only 'not synced'",
      minedTo: WARMUP_ADDRESS,
      seconds: Math.round((Date.now() - started) / 1000)
    });
  }
  if (!nodeIdentity.verified) {
    record("node identity", "FAIL", { problems: nodeIdentity.problems });
    throw new Error(`NODE_IDENTITY_UNVERIFIED: ${nodeIdentity.problems.join("; ")}`);
  }
  // INT9-A: the Silver phases need the current chain state: a well-identified node must also say it is synced
  if (isOnlyUnsynced(nodeIdentity)) {
    record("node identity", "FAIL", { sync: nodeIdentity.sync });
    throw new Error(`NODE_NOT_SYNCED: the node proved its identity but reports sync '${nodeIdentity.sync}'`);
  }
  record("node identity", "PASS", {
    verification: URL_MODE ? "endpoint" : "container",
    ...(URL_MODE
      ? { url: NODE_URL, container: NODE_CONTAINER }
      : { container: nodeIdentity.observed.container?.name, imageDigest: nodeIdentity.expected.imageDigest }),
    serverVersion: nodeIdentity.observed.server?.serverVersion,
    network: nodeIdentity.observed.server?.networkId
  });

  // The repository root is the canonical localnet's workspace (its .hardkas/ holds the node's data). With --url there is
  // no localnet there, and the real-node workspace keeps plaintext test keys on purpose (the doctor rightly fails it):
  // the doctor checks a clean workspace of its own whose simnet is the --url node.
  if (URL_MODE) {
    const doctorWs = path.join(realNodeDir, ".hardkas", "gauntlet-doctor");
    fs.rmSync(doctorWs, { recursive: true, force: true });
    fs.mkdirSync(path.join(doctorWs, ".hardkas"), { recursive: true });
    const doctorConfig = {
      execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
      networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: NODE_URL } }
    };
    fs.writeFileSync(path.join(doctorWs, "hardkas.config.ts"), `export default ${JSON.stringify(doctorConfig, null, 2)};\n`);
    runHardkas(["doctor", "--json"], { cwd: doctorWs });
    record("doctor", "PASS", { workspace: path.relative(root, doctorWs).replace(/\\/g, "/") });
  } else {
    runHardkas(["doctor", "--json"]);
    record("doctor", "PASS");
  }

  runHardkas(["capabilities", "--json"]);
  record("capabilities", "PASS");

  if (URL_MODE) {
    record("localnet status", "SKIP", { reason: "--url: the node is not the canonical localnet" });
  } else {
    runHardkas(["localnet", "status", "--json"]);
    record("localnet status", "PASS");
  }

  runHardkas(["rpc", "health", ...(URL_MODE ? ["--url", NODE_URL] : []), "--wait", "--timeout", "10000"]);
  record(URL_MODE ? "rpc health" : "docker rpc health", "PASS");

  runNode(["run-real-node.mjs"], {
    cwd: realNodeDir,
    stdio: "inherit",
    env: URL_MODE
      ? {
          ...process.env,
          HARDKAS_GAUNTLET_RPC_URL: NODE_URL,
          HARDKAS_GAUNTLET_NODE_CONTAINER: NODE_CONTAINER,
          HARDKAS_GAUNTLET_MINER_CONTAINER: MINER_CONTAINER,
          HARDKAS_GAUNTLET_GRPC_PORT: NODE_GRPC_PORT,
          HARDKAS_GAUNTLET_MINER_LABELS: MINER_LABELS.join(",")
        }
      : undefined
  });
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
  // Every Silver record this run writes, checked by `hardkas artifact verify` once the run is done.
  const silverRecords = [];
  const silverRecord = (result) => (silverRecords.push(result.recordPath), result);

  // silver.compile.v1: a SignedRelease owned by bob (the golden case's source), reproduced byte for byte.
  const releaseSource = writeWork("signed-release.sil", fs.readFileSync(path.join(corpusDir, "p2sh-signed-release", "contract.sil")));
  const ownerArgs = writeWork("signed-release.args.json", JSON.stringify([{ kind: "bytes", value: [...Buffer.from(bobXOnly, "hex")] }]));
  const compiled = silverRecord(silverJson(["compile", releaseSource, "--args", ownerArgs]));
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
    const deployed = silverRecord(silverJson(["deploy", compiled.recordPath, "--from", bob.name, "--amount", "1", "--wait"], { onNode: true }));
    record("silver deploy real", "PASS", {
      capability: "silver.p2sh.deploy-spend.v1",
      txId: deployed.txId,
      address: deployed.address,
      confirmedAtBlockDaaScore: deployed.confirmedAtBlockDaaScore
    });
    const spendArgs = writeWork("release.args.json", JSON.stringify([{ kind: "signature", account: bob.name }]));
    const spent = silverRecord(silverJson(["spend", deployed.recordPath, "--entry", "release", "--to", bob.address, "--args", spendArgs, "--wait"], { onNode: true }));
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
    const counter = silverRecord(silverJson(["compile", counterSource, "--args", counterArgs]));
    // Budget 10 covers the P2PK funding input's Schnorr check (certified by the node in the corpus run).
    // The fee is explicit (the SDK does not price v1 budgets) and must clear the SDK minimum, which
    // storage mass drives: 10 KAS keeps it near 0.004 KAS (a 1 KAS output needs 0.04 KAS).
    const genesis = silverRecord(silverJson([
      "covenant", "genesis", counter.recordPath, "--from", bob.name, "--amount", "10",
      "--compute-budget", "10", "--fee", "1000000", "--wait"
    ], { onNode: true }));
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
    const transition = silverRecord(silverJson([
      "covenant", "transition", genesis.recordPath, "--policy", "bump", "--constructor-args", counterArgs,
      "--state-map", JSON.stringify({ value: 0 }), "--next-state", nextState, "--args", bumpArgs,
      "--compute-budget", "0", "--wait"
    ], { onNode: true }));
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

  // Each record this run wrote is a valid artifact of its schema (its node, network and identity included).
  const verifiedRecords = silverRecords.map((recordPath) => {
    const out = runHardkas(["artifact", "verify", recordPath, "--json"], { cwd: realNodeDir });
    const verdict = JSON.parse(out.slice(out.indexOf("{")));
    if (!verdict.ok) throw new Error(`SILVER_RECORD_INVALID: ${recordPath}: ${JSON.stringify(verdict.result?.errors)}`);
    return path.basename(recordPath);
  });
  record("silver records verify", "PASS", { records: verifiedRecords });

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
    node: nodeTarget(),
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
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
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
