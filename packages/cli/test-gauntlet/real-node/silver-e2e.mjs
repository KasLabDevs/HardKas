// Shared plumbing for the SilverScript real-node E2E runners (M8-B1, M8-B1b):
// a throwaway workspace, the canonical miner, RPC access, deploy through the
// standard transaction lifecycle, and submissions expected to be rejected.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CANONICAL_LOCALNET, CPUMINER_REFERENCE_IMAGE, nodeRpcUrl } from "@hardkas/core";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "..", "..", "dist", "index.js");
const MINER_IMAGE = process.env.HARDKAS_TOCCATA_MINER_IMAGE || CPUMINER_REFERENCE_IMAGE;
export const RPC_URL = nodeRpcUrl();

// Pre-funded simnet fixture (same as run-real-node.mjs): mature coinbase UTXOs.
export const FIXTURE_KEY = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
export const FIXTURE_ADDRESS = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";

/** Only the scope these runners prove. Covenant / stateful Toccata semantics are M8-B2. */
export const P2SH_SCOPE = "SilverScript L1/P2SH execution — not evidence of covenant or stateful Toccata semantics";

/** The scope M8-B2 proves, and what it does not. */
export const COVENANT_SCOPE =
  "Toccata tx-v1 covenant/state-transition execution (1:1 auth-bound singleton transition) against verified rusty-kaspad 2.0.1 — " +
  "not vProgs, L2, EVM, multi-input/leader covenants, or production/audited contracts";

/**
 * Coarse class of a node rejection, for evidence. Controls assert the class,
 * never the exact wording, which rusty-kaspa may change between releases.
 */
export function classifyNodeRejection(message) {
  const m = String(message);
  if (/script units exceeded/i.test(m)) return "compute-budget-exceeded";
  if (/covenant field but transaction version/i.test(m)) return "tx-version-rule";
  if (/covenants error|genesis hashing/i.test(m)) return "covenant-rule";
  if (/under the required amount|fee.*(too low|insufficient|below)/i.test(m)) return "fee-below-minimum";
  if (/verification failed|false stack entry|returned early/i.test(m)) return "script-verify";
  return "unclassified";
}

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (msg) => console.log(msg);
export const jsonReplacer = (_k, v) => (typeof v === "bigint" ? v.toString() : v);

/** A clean throwaway workspace outside the repo (it holds plaintext test keys). */
export function createWorkspace(defaultName) {
  const work = path.resolve(process.env.HARDKAS_SILVER_E2E_WORK || path.join(os.tmpdir(), defaultName));
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  fs.writeFileSync(path.join(work, "package.json"), '{"name":"silver-e2e"}');
  fs.writeFileSync(
    path.join(work, "hardkas.config.ts"),
    `export default {
  execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } },
  networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "${RPC_URL}" } }
};
`
  );
  const hardkas = (args) => {
    try {
      return execFileSync(process.execPath, [CLI, ...args], { cwd: work, encoding: "utf8", stdio: "pipe", maxBuffer: 50 * 1024 * 1024 });
    } catch (e) {
      throw new Error(`hardkas ${args.join(" ")} failed:\n${e.stdout || ""}\n${e.stderr || ""}`);
    }
  };
  hardkas(["accounts", "real", "import", "--name", "fixture", "--private-key", FIXTURE_KEY, "--address", FIXTURE_ADDRESS, "--unsafe-plaintext", "--yes"]);
  const generate = (name) => {
    hardkas(["accounts", "real", "generate", "--name", name, "--unsafe-plaintext", "--yes"]);
    const all = JSON.parse(fs.readFileSync(path.join(work, ".hardkas", "accounts.real.json"), "utf8")).accounts;
    const account = all.find((a) => a.name.startsWith(name));
    if (!account) throw new Error(`account ${name} missing`);
    return account;
  };
  return { dir: work, hardkas, generate };
}

// HARNESS-LOCAL knob only. It sets the upstream miner's `--throttle` flag
// ("for development testing") so this local runner does not outrun the node's
// UTXO index. It is not a Kaspa or Toccata protocol parameter, is not evidence
// of anything about consensus, and does not belong in any capability claim.
// The value used in a run is recorded in the evidence so runs are reproducible.
// Set 0 to disable.
const MINER_THROTTLE_MS = process.env.HARDKAS_TOCCATA_MINER_THROTTLE_MS ?? "5";
export const HARNESS_MINER_THROTTLE = { environment: "HARDKAS_TOCCATA_MINER_THROTTLE_MS", valueMs: MINER_THROTTLE_MS, purpose: "harness-local rate limit (not a consensus parameter)" };

export function startMiner(address = FIXTURE_ADDRESS) {
  const name = CANONICAL_LOCALNET.minerContainerName;
  execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
  execFileSync("docker", [
    "run", "-d", "--name", name, `--network=container:${CANONICAL_LOCALNET.containerName}`, MINER_IMAGE,
    "--mining-address", address, "--kaspad-address", "127.0.0.1", "--port", String(CANONICAL_LOCALNET.ports.rpc),
    "--threads", "1", "--mine-when-not-synced", ...(MINER_THROTTLE_MS !== "0" ? ["--throttle", MINER_THROTTLE_MS] : [])
  ], { stdio: "ignore" });
}

export function stopMiner() {
  try {
    execFileSync("docker", ["rm", "-f", CANONICAL_LOCALNET.minerContainerName], { stdio: "ignore" });
  } catch {}
}

export async function rpc(fn) {
  const client = new JsonWrpcKaspaClient({ rpcUrl: RPC_URL, timeoutMs: 15000 });
  try {
    return await fn(client);
  } finally {
    await client.close?.();
  }
}

export async function virtualDaaScore() {
  return BigInt((await rpc((c) => c.getBlockDagInfo())).virtualDaaScore);
}

function spkOf(utxo) {
  const raw = utxo.raw?.utxoEntry ?? utxo.raw?.utxo_entry ?? utxo.raw ?? {};
  const spk = raw.scriptPublicKey ?? raw.script_public_key ?? utxo.scriptPublicKey;
  if (spk && typeof spk === "object") return { version: Number(spk.version ?? 0), script: String(spk.scriptPublicKey ?? spk.script ?? "") };
  const hex = String(spk ?? "");
  if (/^0000[0-9a-f]+$/i.test(hex)) return { version: 0, script: hex.slice(4) };
  throw new Error(`Unrecognized scriptPublicKey in node UTXO: ${JSON.stringify(spk)}`);
}

/** A node-reported UTXO in the shape buildSilverSweep takes. */
export function toContractUtxo(u) {
  const raw = u.raw?.utxoEntry ?? u.raw?.utxo_entry ?? u.raw ?? {};
  return {
    outpoint: { transactionId: u.outpoint.transactionId, index: u.outpoint.index },
    amountSompi: BigInt(u.amountSompi),
    scriptPublicKey: spkOf(u),
    blockDaaScore: BigInt(raw.blockDaaScore ?? raw.block_daa_score ?? u.blockDaaScore ?? 0),
    isCoinbase: Boolean(raw.isCoinbase ?? raw.is_coinbase ?? u.isCoinbase),
    ...(raw.covenantId ?? raw.covenant_id ?? u.covenantId ? { covenantId: String(raw.covenantId ?? raw.covenant_id ?? u.covenantId) } : {})
  };
}

/**
 * Records a case of the SilverScript golden corpus (verified offline by
 * `hardkas corpus verify`), when HARDKAS_SILVER_CORPUS_OUT names the corpus
 * directory. `compiles` carry the exact source, canonical constructor
 * arguments and silverc output; nothing is re-encoded here.
 */
export async function writeCorpusCase({ id, scenario, scope, capabilities, compiles, covenant, evidence }) {
  const out = process.env.HARDKAS_SILVER_CORPUS_OUT;
  if (!out) return undefined;
  const { serializeSilArtifactValues, silverP2shLock, silverP2shAddress, silContractBytecodeHex, getSilContract } = await import("@hardkas/core");
  const root = path.resolve(out);
  const dir = path.join(root, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const caseCompiles = compiles.map((c) => {
    const sourceFile = `${c.name}.sil`;
    const argsFile = `${c.name}.constructor-args.json`;
    const artifactFile = `${c.name}.artifact.json`;
    fs.writeFileSync(path.join(dir, sourceFile), c.source);
    fs.writeFileSync(path.join(dir, argsFile), serializeSilArtifactValues(c.constructorArgs));
    fs.writeFileSync(path.join(dir, artifactFile), Buffer.from(c.result.artifactBytes));
    const bytecode = silContractBytecodeHex(getSilContract(c.result.artifact, c.contract).contract);
    return {
      name: c.name,
      source: sourceFile,
      constructorArgs: argsFile,
      artifact: artifactFile,
      contract: c.contract,
      provenance: c.result.provenance,
      lockingScript: silverP2shLock(bytecode),
      address: silverP2shAddress(bytecode, "simnet")
    };
  });
  const caseDoc = {
    schema: "hardkas.silverCorpusCase.v1",
    id,
    scenario,
    scope,
    capabilities,
    network: "simnet",
    compiles: caseCompiles,
    ...(covenant ? { covenant } : {}),
    evidence: "evidence.json"
  };
  fs.writeFileSync(path.join(dir, "case.json"), JSON.stringify(caseDoc, jsonReplacer, 2) + "\n");
  fs.writeFileSync(path.join(dir, "evidence.json"), JSON.stringify(evidence, jsonReplacer, 2) + "\n");

  const manifestPath = path.join(root, "manifest.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : {
        schema: "hardkas.silverCorpus.v1",
        network: "simnet",
        profile: "toccata-v2",
        generatedBy: "packages/cli/test-gauntlet/real-node/run-silver-*.mjs with HARDKAS_SILVER_CORPUS_OUT",
        constructorArgsPolicy: "public test values only (x-only public keys, scripts, amounts); never private material",
        cases: []
      };
  manifest.cases = [...manifest.cases.filter((x) => x.id !== id), { id, path: id, capabilities }].sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  log(`  corpus case written: ${dir}`);
  return dir;
}

/** Submits and reports the outcome without throwing; rejections carry the node's reason and class. */
export async function trySubmit(label, rpcTransaction) {
  try {
    const res = await rpc((c) => c.submitTransaction(structuredClone(rpcTransaction)));
    return { name: label, accepted: true, txId: res.transactionId };
  } catch (e) {
    const nodeError = String(e.message || e).replace(/\s+/g, " ").slice(0, 400);
    return { name: label, accepted: false, rejectionClass: classifyNodeRejection(nodeError), nodeError };
  }
}

/** A control that must be refused with the expected class. The text itself is only recorded. */
export async function expectRejectionClass(label, expectedClass, rpcTransaction, note) {
  const r = await trySubmit(label, rpcTransaction);
  if (r.accepted) throw new Error(`NEGATIVE_CONTROL_ACCEPTED: ${label} was accepted (${r.txId})`);
  if (r.rejectionClass !== expectedClass) {
    throw new Error(`NEGATIVE_CONTROL_WRONG_CLASS: ${label} expected ${expectedClass}, node said (${r.rejectionClass}): ${r.nodeError}`);
  }
  log(`  ${label}: rejected [${r.rejectionClass}] ${r.nodeError}`);
  return { ...r, expectedClass, ...(note ? { note } : {}) };
}

/**
 * CERTIFICATION ONLY — not an estimator and not a HardKAS API. Raises the
 * compute budget one unit at a time and lets the verified node judge each
 * candidate; when the node's reason is the fee (the SDK does not price v1
 * budgets), the fee is taken from the node's stated requirement. Every attempt
 * is returned for the evidence. Stops at the first acceptance, at the first
 * rejection of another class, or at the cap.
 */
export async function certifyComputeBudget(label, build, { start = 0, cap = 32, submit = true } = {}) {
  const attempts = [];
  for (let budget = start; budget <= cap; budget++) {
    let fee;
    for (let feeRound = 0; feeRound < 3; feeRound++) {
      const built = build(budget, fee);
      const r = submit ? await trySubmit(`${label} budget=${budget}`, built.rpcTransaction) : { accepted: false };
      attempts.push({ budget, feeSompi: String(built.feeSompi), accepted: r.accepted, rejectionClass: r.rejectionClass, nodeError: r.nodeError });
      log(`  ${label} budget ${budget} fee ${built.feeSompi}: ${r.accepted ? "ACCEPTED " + r.txId : `[${r.rejectionClass}] ${r.nodeError}`}`);
      if (r.accepted) return { certifiedBudget: budget, built, txId: r.txId, attempts };
      if (r.rejectionClass === "fee-below-minimum") {
        const required = /required amount of (\d+)/i.exec(r.nodeError ?? "");
        if (!required) throw new Error(`${label}: fee rejected without a stated requirement: ${r.nodeError}`);
        fee = BigInt(required[1]);
        continue;
      }
      if (r.rejectionClass === "compute-budget-exceeded") break;
      return { stopped: r.rejectionClass, attempts, built };
    }
  }
  throw new Error(`${label}: no budget up to ${cap} was accepted`);
}

/** Mines until `predicate(utxos of address)` returns a value; stops the miner and lets the DAG settle. */
export async function mineUntil(address, predicate, label, timeoutMs = 180000) {
  startMiner();
  try {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const hit = predicate(await rpc((c) => c.getUtxosByAddress(address)));
      if (hit) return hit;
      await sleep(2000);
    }
    throw new Error(`TIMEOUT waiting for ${label}`);
  } finally {
    stopMiner();
    await sleep(3000);
  }
}

/**
 * Mines until the node's virtual DAA score reaches `target`, observing it
 * rather than mining a fixed number of blocks. Returns the scores seen.
 */
export async function mineUntilDaa(target, label, timeoutMs = 300000) {
  const before = await virtualDaaScore();
  startMiner();
  let reached;
  try {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const daa = await virtualDaaScore();
      if (daa >= target) {
        reached = daa;
        break;
      }
      await sleep(500);
    }
    if (reached === undefined) throw new Error(`TIMEOUT waiting for virtual DAA ${target} (${label})`);
  } finally {
    stopMiner();
    await sleep(3000);
  }
  return { before, reachedWhileMining: reached, settled: await virtualDaaScore() };
}

/** Deploys `amountKas` to `p2shAddress` via hardkas tx plan/sign/send; returns the confirmed contract UTXO. */
export async function deployToP2sh(ws, { p2shAddress, amountKas, label }) {
  const artifactsDir = path.join(ws.dir, ".hardkas", "artifacts");
  const plansBefore = new Set(fs.existsSync(artifactsDir) ? fs.readdirSync(artifactsDir) : []);
  ws.hardkas(["tx", "plan", "--from", "fixture", "--to", p2shAddress, "--amount", amountKas, "--network", "simnet", "--provider", "rpc"]);
  const plan = fs.readdirSync(artifactsDir).find((f) => f.endsWith(".plan.json") && !plansBefore.has(f));
  if (!plan) throw new Error(`no plan artifact for ${label}`);
  const signedPath = path.join(artifactsDir, `${label}.signed.json`);
  ws.hardkas(["tx", "sign", path.join(artifactsDir, plan), "--account", "fixture", "--out", signedPath]);

  const receiptsBefore = new Set(listJson(path.join(ws.dir, ".hardkas")));
  ws.hardkas(["tx", "send", signedPath, "--network", "simnet", "--provider", "rpc", "--yes"]);
  const receipt = listJson(path.join(ws.dir, ".hardkas"))
    .filter((f) => !receiptsBefore.has(f))
    .map((f) => JSON.parse(fs.readFileSync(f, "utf8")))
    .find((a) => /receipt/i.test(String(a.schema)) && a.txId);
  if (!receipt) throw new Error(`no receipt for ${label}`);
  const txId = receipt.txId;
  log(`  ${label}: submitted ${txId}`);

  const found = await mineUntil(p2shAddress, (us) => {
    const u = us.find((x) => x.outpoint.transactionId === txId);
    return u ? u : null;
  }, `${label} confirmation`);
  const utxo = toContractUtxo(found);
  log(`  ${label}: confirmed ${txId}:${utxo.outpoint.index} ${utxo.amountSompi} sompi, block DAA ${utxo.blockDaaScore}`);
  return { txId, utxo };
}

function listJson(dir) {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** Submits a transaction that must be refused; returns the node's reason. Acceptance is a failure. */
export async function submitExpectingRejection(label, rpcTransaction) {
  let accepted;
  try {
    accepted = await rpc((c) => c.submitTransaction(structuredClone(rpcTransaction)));
  } catch (e) {
    const nodeError = String(e.message || e).replace(/\s+/g, " ").slice(0, 400);
    log(`  rejected as expected: ${nodeError}`);
    return { name: label, rejected: true, nodeError };
  }
  throw new Error(`NEGATIVE_CONTROL_ACCEPTED: ${label} was accepted by the node (${accepted?.transactionId}); the contract is not enforced`);
}

/** Submits a transaction that must be accepted; checks the node reports the id that was built. */
export async function submitExpectingAcceptance(label, built) {
  const res = await rpc((c) => c.submitTransaction(structuredClone(built.rpcTransaction)));
  if (res.transactionId && res.transactionId !== built.txId) {
    throw new Error(`${label}: node reports txid ${res.transactionId}, built ${built.txId}`);
  }
  log(`  ${label}: accepted ${built.txId} (fee ${built.feeSompi}, mass ${built.mass})`);
  return built.txId;
}
