import fs from "node:fs";
import net from "node:net";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import path from "node:path";
import {
  waitForFundingConfirmation,
  getVirtualDaaScore,
  getVirtualDaaScoreBestEffort,
  coinbaseMaturity,
  waitForDaaScore,
  readBalanceSompi,
  cleanWorkspaceState
} from "./real-node-helpers.mjs";
import { CPUMINER_REFERENCE_IMAGE, CANONICAL_LOCALNET, nodeRpcUrl } from "@hardkas/core";
import { requireNodeIdentity, requireEndpointIdentity } from "@hardkas/node-runner";

// Upstream Kaspa CPU miner, pinned by digest. Do not swap this for a bespoke
// image: funding must be reproducible from public artifacts on any machine.
const MINER_IMAGE = process.env.HARDKAS_TOCCATA_MINER_IMAGE || CPUMINER_REFERENCE_IMAGE;
// How long to let the DAG settle after mining, before selecting UTXOs.
const SETTLE_MS = parseInt(process.env.HARDKAS_TOCCATA_SETTLE_MS || "5000", 10);

// HARDKAS_GAUNTLET_RPC_URL (set by `toccata-gauntlet.mjs --url`): this phase runs on a simnet node HardKAS does not
// manage — the caller's own container, named by HARDKAS_GAUNTLET_NODE_CONTAINER. Its identity is what it reports at
// that URL (network, version, synced, not the simulator), not the canonical container + image check. The miner joins
// that container's network namespace under its own name (HARDKAS_GAUNTLET_MINER_CONTAINER) and labels
// (HARDKAS_GAUNTLET_MINER_LABELS, comma-separated key=value): the canonical localnet and its miner are never used.
const URL_MODE = Boolean(process.env.HARDKAS_GAUNTLET_RPC_URL);
// wRPC endpoint of the node: the caller's (URL mode), or the canonical one (the one requireNodeIdentity verifies).
const RPC_URL = process.env.HARDKAS_GAUNTLET_RPC_URL || nodeRpcUrl();
// kaspad's gRPC port, reached inside the node container's own network namespace.
const MINER_GRPC_PORT = URL_MODE ? String(process.env.HARDKAS_GAUNTLET_GRPC_PORT || "") : String(CANONICAL_LOCALNET.ports.rpc);
const NODE_CONTAINER = URL_MODE ? String(process.env.HARDKAS_GAUNTLET_NODE_CONTAINER || "") : CANONICAL_LOCALNET.containerName;
const MINER_CONTAINER = URL_MODE ? String(process.env.HARDKAS_GAUNTLET_MINER_CONTAINER || "") : CANONICAL_LOCALNET.minerContainerName;
const MINER_LABELS = URL_MODE
  ? String(process.env.HARDKAS_GAUNTLET_MINER_LABELS || "").split(",").map((l) => l.trim()).filter(Boolean)
  : [];
const HARDKAS_VERSION = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

/** The node this phase runs on, proven before anything is asked of it. */
function proveNode() {
  return URL_MODE ? requireEndpointIdentity(RPC_URL, "simnet") : requireNodeIdentity();
}

// Written on failure so the gauntlet report keeps the real reason, not just "command failed".
const FAILURE_FILE = path.join(".hardkas", "real-node-failure.json");

// HARDKAS_GAUNTLET_NODE=disposable: this phase runs on a node it starts itself from KASPAD_BIN (the pinned kaspad) on the
// canonical port of its OWN network namespace (a disposable container), and mines through block templates. It never uses a
// Docker engine, the canonical localnet container or its miner, and a busy port is a failure: it never attaches to, or
// mines into, a node it did not start. The node's identity is the binary's digest, not the canonical image check.
const DISPOSABLE = process.env.HARDKAS_GAUNTLET_NODE === "disposable";
let disposable;

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
    socket.once("error", () => resolve(false));
  });
}

async function startDisposableNode() {
  const bin = process.env.KASPAD_BIN;
  if (!bin) throw new Error("GAUNTLET_DISPOSABLE_NO_BINARY: HARDKAS_GAUNTLET_NODE=disposable needs KASPAD_BIN (the pinned kaspad)");
  const port = Number(new URL(RPC_URL).port);
  if (await portInUse(port)) {
    throw new Error(`GAUNTLET_DISPOSABLE_PORT_BUSY: 127.0.0.1:${port} is in use; the disposable phase starts its own node and never uses another`);
  }
  const { startIsolatedSimnet } = await import("@hardkas/testing");
  const session = await startIsolatedSimnet({ rpcPort: port, minerFixture: "alice" });
  const info = await session.rpc.getServerInfo();
  const digest = crypto.createHash("sha256").update(fs.readFileSync(bin)).digest("hex");
  console.log(`  DISPOSABLE node (not the canonical localnet): kaspad ${info.serverVersion} (${info.networkId}) from ${path.basename(bin)} sha256 ${digest}`);
  return session;
}

async function stopDisposableNode() {
  if (!disposable) return;
  const { stopIsolatedSimnet } = await import("@hardkas/testing");
  await stopIsolatedSimnet(disposable);
  disposable = undefined;
}

/** Disposable mode: blocks to the miner address, through templates, until the account holds the amount (then maturity). */
async function ensureFundingDisposable(minerAddress, targetAccountName, expectedSompi, label, { requireCoinbaseMaturity = false } = {}) {
  console.log(`  Mining confirmation blocks for ${label} (disposable node, block templates)...`);
  const { mineBlocks } = await import("@hardkas/testing");
  const timeoutMs = parseInt(process.env.HARDKAS_TOCCATA_FUNDING_TIMEOUT_MS || "60000", 10);
  const deadline = Date.now() + timeoutMs;
  let last;
  for (;;) {
    await mineBlocks(disposable, 10, minerAddress);
    try {
      last = readBalanceSompi(run, targetAccountName);
    } catch {
      last = undefined;
    }
    if (last !== undefined && last >= expectedSompi) break;
    if (Date.now() > deadline) {
      throw new Error(`TOCCATA_FUNDING_CONFIRMATION_TIMEOUT: ${targetAccountName} holds ${last ?? "no readable balance"} of ${expectedSompi} sompi (disposable node)`);
    }
  }
  if (requireCoinbaseMaturity) {
    const blocks = Number(coinbaseMaturity()) + 20;
    console.log(`  Maturing the coinbase: ${blocks} more blocks...`);
    await mineBlocks(disposable, blocks, minerAddress);
  }
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  return { accountName: targetAccountName, balanceSompi: last };
}

function run(cmd) {
  try {
    console.log(`Running: ${cmd}`);
    return execSync(`node ../../dist/index.js ${cmd}`, { stdio: "pipe", encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  } catch (e) {
    console.error("STDOUT:\n", e.stdout);
    console.error("STDERR:\n", e.stderr);
    try {
      fs.mkdirSync(path.dirname(FAILURE_FILE), { recursive: true });
      fs.writeFileSync(FAILURE_FILE, JSON.stringify({ cmd, stdout: String(e.stdout || ""), stderr: String(e.stderr || "") }, null, 2));
    } catch {}
    throw new Error(`Command failed: ${cmd}`);
  }
}

async function ensureFundingConfirmed(minerAddress, targetAccountName, expectedSompi, label, { requireCoinbaseMaturity = false } = {}) {
  if (DISPOSABLE) return ensureFundingDisposable(minerAddress, targetAccountName, expectedSompi, label, { requireCoinbaseMaturity });
  console.log(`  Mining confirmation blocks for ${label}...`);
  // The canonical node (or, in URL mode, the caller's), and only after it proves its
  // identity (never "the first container whose name looks like kaspad").
  await proveNode();
  const strategy = {
    type: URL_MODE ? "endpoint-node" : "canonical-node",
    containerName: NODE_CONTAINER,
    kaspadAddress: `127.0.0.1:${MINER_GRPC_PORT}`
  };
  console.log(`  [Diagnostic] Node: ${strategy.containerName} (identity verified)`);

  const minerName = MINER_CONTAINER;
  let daaStart = await getVirtualDaaScoreBestEffort(RPC_URL);

  try {
    execSync(`docker image inspect ${MINER_IMAGE}`, { stdio: "ignore" });
    execSync(`docker rm -f ${minerName}`, { stdio: "ignore" });

    // Join the node's network namespace. kaspad binds gRPC to loopback inside
    // its own container, so a miner on the bridge network cannot reach it by
    // host address no matter how the ports are published.
    const dockerCmd = [
      "docker run -d",
      `--name ${minerName}`,
      ...MINER_LABELS.map((label) => `--label ${label}`),
      `--network=container:${strategy.containerName}`,
      MINER_IMAGE,
      `--mining-address ${minerAddress}`,
      "--kaspad-address 127.0.0.1",
      `--port ${MINER_GRPC_PORT}`,
      "--threads 1",
      "--mine-when-not-synced"
    ];

    try {
      execSync(dockerCmd.join(" "), { stdio: "ignore" });
    } catch (e) {
      throw new Error(`TOCCATA_MINER_START_FAILED: Failed to start miner container. Check docker logs.`);
    }

    // Wait for balance using helper
    const timeoutMs = parseInt(process.env.HARDKAS_TOCCATA_FUNDING_TIMEOUT_MS || "60000", 10);
    const intervalMs = parseInt(process.env.HARDKAS_TOCCATA_POLL_INTERVAL_MS || "2000", 10);

    const context = {
      strategy,
      minerName,
      daaStart
    };

    const result = await waitForFundingConfirmation({
      runCmd: run,
      accountName: targetAccountName,
      expectedSompi,
      timeoutMs,
      intervalMs,
      context
    });

    // A visible coinbase balance is not a spendable one: keep the miner running until
    // the coinbase observed now has matured.
    if (requireCoinbaseMaturity) {
      const daaFunded = await getVirtualDaaScore(RPC_URL);
      const target = daaFunded + coinbaseMaturity() + 20n;
      console.log(`  Waiting for coinbase maturity: DAA ${daaFunded} -> ${target}...`);
      const reached = await waitForDaaScore({ rpcUrl: RPC_URL, target });
      console.log(`  Coinbase matured at DAA ${reached}.`);
    }

    return result;

  } catch (err) {
    if (err.message.includes("TOCCATA_FUNDING_CONFIRMATION_TIMEOUT")) {
      const daaEnd = await getVirtualDaaScoreBestEffort(RPC_URL);
      try {
        const logs = execSync(`docker logs ${minerName}`, { encoding: "utf8", stdio: "pipe" });
        console.error(`\n=== Miner Logs (${minerName}) ===\n${logs}\n=========================\n`);
      } catch (e) {
        console.error(`Could not fetch logs for ${minerName}`);
      }
      err.message = err.message.replace("DAA End: unavailable", `DAA End: ${daaEnd || "unavailable"}`);
    }
    throw err;
  } finally {
    try {
      execSync(`docker rm -f ${minerName}`, { stdio: "ignore" });
    } catch {}
    // Planning against a node that is still accepting blocks fails with
    // UTXO_VIRTUAL_STATE_UNSTABLE, so let the DAG settle before returning.
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  }
}

async function runRealNodeCert() {
  console.log(`=== Real Node ${HARDKAS_VERSION} / Toccata Certification ===`);

  if (DISPOSABLE && URL_MODE) {
    throw new Error("GAUNTLET_NODE_MODE_CONFLICT: HARDKAS_GAUNTLET_NODE=disposable and HARDKAS_GAUNTLET_RPC_URL are exclusive");
  }
  if (URL_MODE && (!NODE_CONTAINER || !MINER_CONTAINER || !/^\d+$/.test(MINER_GRPC_PORT))) {
    throw new Error("GAUNTLET_URL_MODE_INCOMPLETE: URL mode needs HARDKAS_GAUNTLET_NODE_CONTAINER, HARDKAS_GAUNTLET_MINER_CONTAINER and HARDKAS_GAUNTLET_GRPC_PORT");
  }
  if (URL_MODE && (NODE_CONTAINER === CANONICAL_LOCALNET.containerName || MINER_CONTAINER === CANONICAL_LOCALNET.minerContainerName)) {
    throw new Error("GAUNTLET_URL_MODE_CANONICAL: URL mode never uses the canonical localnet or its miner (run without --url for those)");
  }

  if (DISPOSABLE) {
    disposable = await startDisposableNode();
  } else if (URL_MODE) {
    // Fail before touching anything if the node does not prove what it is.
    const identity = await proveNode();
    console.log(
      `  Node identity verified by endpoint: ${RPC_URL} in ${NODE_CONTAINER} ` +
        `(rusty-kaspad ${identity.observed.server?.serverVersion}, ${identity.observed.server?.networkId}, synced)`
    );
  } else {
    // Fail before touching anything if the node is not the canonical one.
    const identity = await requireNodeIdentity();
    console.log(
      `  Node identity verified: ${identity.observed.container?.name} ` +
        `(rusty-kaspad ${identity.observed.server?.serverVersion}, ${identity.expected.imageDigest.slice(0, 19)}...)`
    );
  }

  // Clean state (the canonical node's own data, .hardkas/kaspad, stays: see cleanWorkspaceState)
  cleanWorkspaceState();
  fs.writeFileSync("package.json", '{"name":"real-node-cert"}');
  // `network` is the policy block, not the target selector. Writing
  // `{ network: "simnet" }` leaves the default target at `simulated`, and every
  // command against a kaspasim: account then fails with "Account network
  // mismatch". Declare the execution target explicitly instead.
  // In URL mode the node is an RPC target HardKAS does not manage, not the localnet.
  const target = URL_MODE ? "node" : "localnet";
  fs.writeFileSync(
    "hardkas.config.ts",
    `export default {
  execution: {
    default: "${target}",
    targets: {
      ${target}: { mode: "${URL_MODE ? "rpc" : "localnet"}", domain: "kaspa-l1", network: "simnet" }
    }
  },
  networks: {
    simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "${RPC_URL}" }
  }
};
`
  );

  // [1] Generate fresh accounts
  console.log("\n[1] Generating Accounts...");
  run("accounts real generate --name fresh_alice --unsafe-plaintext --yes");
  run("accounts real generate --name fresh_bob --unsafe-plaintext --yes");

  const accountsData = JSON.parse(fs.readFileSync(".hardkas/accounts.real.json", "utf8"));
  const alice = accountsData.accounts.find(a => a.name.startsWith("fresh_alice"));
  const bob = accountsData.accounts.find(a => a.name.startsWith("fresh_bob"));
  if (!alice || !bob) throw new Error("Accounts missing!");

  console.log(`  Alice: ${alice.name} -> ${alice.address}`);
  console.log(`  Bob:   ${bob.name} -> ${bob.address}`);

  // [2] Import fixture miner account (has mature coinbase UTXOs)
  console.log("\n[2] Importing Fixture Account...");
  const fixtureKey = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
  const fixtureAddress = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
  run(`accounts real import --name fixture --private-key ${fixtureKey} --address ${fixtureAddress} --unsafe-plaintext --yes`);

  // Check fixture balance
  const balanceOut = run("accounts balance fixture --provider rpc");
  console.log("  Fixture balance:", balanceOut.trim().split("\n").filter(l => l.includes("Balance")).join(""));

  // Cold start: on a fresh node nothing has mined to the fixture yet, so mine
  // coinbase to it rather than assuming a pre-funded node. Coinbase needs to
  // mature before it is spendable, which is why this mines rather than waits.
  if (/Balance:\s*0(\D|$)/.test(balanceOut)) {
    console.log("  Fixture is empty — mining coinbase to it first...");
    await ensureFundingConfirmed(fixtureAddress, "fixture", 100000000000n, "coinbase -> fixture", { requireCoinbaseMaturity: true });
  }

  // [3] Fund Alice from fixture (using mature UTXOs only — coinbase maturity filter is active)
  console.log("\n[3] Funding Alice from fixture...");
  run(`tx plan --from fixture --to ${alice.address} --amount 1000 --network simnet --provider rpc`);

  const plans = fs.readdirSync(".hardkas/artifacts").filter(f => f.endsWith(".plan.json"));
  if (!plans.length) throw new Error("No plan artifact generated!");
  console.log(`  Plan: ${plans[0]}`);

  run(`tx sign .hardkas/artifacts/${plans[0]} --account fixture --out .hardkas/artifacts/1.signed.json`);
  console.log("  Signed: 1.signed.json");

  run(`tx send .hardkas/artifacts/1.signed.json --network simnet --provider rpc --yes`);
  await ensureFundingConfirmed(fixtureAddress, alice.name, 100000000000n, "fixture -> Alice");
  console.log("  ✓ Transaction sent!");

  // [4] Verify receipt was created
  console.log("\n[4] Verifying receipt...");
  if (!fs.existsSync(".hardkas/artifacts/receipts")) {
    // Receipt might be inline in the signed artifact response
    console.log("  No receipts directory — checking send output...");
  } else {
    const receipts = fs.readdirSync(".hardkas/artifacts/receipts").filter(f => f.includes("receipt"));
    if (receipts.length) {
      console.log(`  Receipt: ${receipts[0]}`);
    }
  }

  // [5] Alice -> Bob lifecycle
  console.log("\n[5] Tx Lifecycle Alice -> Bob...");
  const aliceBalance = run(`accounts balance ${alice.name} --provider rpc`);
  console.log("  Alice balance:", aliceBalance.trim().split("\n").filter(l => l.includes("Balance")).join(""));

  run(`tx plan --from ${alice.name} --to ${bob.address} --amount 500 --network simnet --provider rpc`);
  const plans2 = fs.readdirSync(".hardkas/artifacts").filter(f => f.endsWith(".plan.json") && !plans.includes(f));
  if (!plans2.length) throw new Error("No second plan artifact!");
  console.log(`  Plan: ${plans2[0]}`);

  run(`tx sign .hardkas/artifacts/${plans2[0]} --account ${alice.name} --out .hardkas/artifacts/2.signed.json`);
  console.log("  Signed: 2.signed.json");

  run(`tx send .hardkas/artifacts/2.signed.json --network simnet --provider rpc --yes`);
  await ensureFundingConfirmed(fixtureAddress, bob.name, 50000000000n, "Alice -> Bob");
  console.log("  ✓ Transaction sent!");

  // [6] Final balances
  console.log("\n[6] Final Balances...");
  run(`accounts balance ${alice.name} --provider rpc`);
  run(`accounts balance ${bob.name} --provider rpc`);

  // [7] Serialization validation
  console.log("\n[7] Serialization Validation...");
  const finalAccounts = JSON.parse(fs.readFileSync(".hardkas/accounts.real.json", "utf8"));
  for (const acct of finalAccounts.accounts) {
    if (typeof acct.privateKey !== "string") {
      throw new Error(`CORRUPTED_PRIVATE_KEY_SERIALIZATION: ${acct.name} has non-string privateKey: ${typeof acct.privateKey}`);
    }
    if (acct.privateKey.includes("__wbg_ptr")) {
      throw new Error(`CORRUPTED_PRIVATE_KEY_SERIALIZATION: ${acct.name} has WASM pointer leak`);
    }
    if (!/^[0-9a-f]{64}$/i.test(acct.privateKey)) {
      throw new Error(`CORRUPTED_PRIVATE_KEY_SERIALIZATION: ${acct.name} has invalid hex: ${acct.privateKey.substring(0, 20)}...`);
    }
    console.log(`  ✓ ${acct.name}: valid 64-char hex privateKey`);
  }

  console.log("\n=== REAL NODE FULL PASS ===");
}

runRealNodeCert()
  .then(() => stopDisposableNode())
  .catch(async (err) => {
    console.error("Test Failed:", err);
    await stopDisposableNode().catch(() => undefined);
    process.exit(1);
  });
