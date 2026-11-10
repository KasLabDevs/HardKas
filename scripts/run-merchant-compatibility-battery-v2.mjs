// scripts/run-merchant-compatibility-battery-v2.mjs
// Merchant-demo compatibility battery (merchant-demo-rc28 inventory, 58 operations) across the simulator, an isolated
// rusty-kaspad simnet node and testnet.
//
// HK-07 / CA-EV-06 / SIM-12: no row is PASS unless the battery executed the named operation through a declared executor
// and kept the observed response (scripts/run-merchant-compatibility-battery-evidence.mjs has the rules and the
// checker). Operations without an executor are NOT_EXECUTED with a reason. Verdict texts are derived from the observed
// responses. Nothing is written into the repository: every run goes to its own directory (default
// .hardkas/merchant-compat/<runId>, git-ignored), and the reports are generated from that run's results.json.
//
// CA-EV-07: the simnet node is started by @hardkas/testing's isolated simnet harness: the reference rusty-kaspad image
// by digest (KASPAD_REFERENCE_IMAGE), a free port published on 127.0.0.1 only, labelled containers removed at the end.
// Toolchains (kaspa-wasm, silverc) come from the managed HARDKAS_HOME; there are no machine paths in this script.
//
// Usage: node scripts/run-merchant-compatibility-battery-v2.mjs [--out <dir>] [--envs simulator,simnet,testnet]
// Exit code: 0 when the run's results verify (whatever their PASS/FAIL/NOT_EXECUTED split), 1 otherwise.
// Requires a build (packages/*/dist) and `hardkas toolchain install kaspa-wasm silverc` in HARDKAS_HOME.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ENVIRONMENTS,
  EvidenceRecorder,
  LOCAL_NODE_OPS,
  OFFLINE_OPS,
  OPERATIONS,
  RESULTS_SCHEMA,
  assertMerchantCompatResults,
  renderReports,
  verifyMerchantCompatResults
} from "./run-merchant-compatibility-battery-evidence.mjs";

export { OPERATIONS, verifyMerchantCompatResults };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = (pkg) => pathToFileURL(path.join(ROOT, "packages", pkg, "dist", "index.js")).href;

/**
 * Former v2 entry point, kept for scripts/test-runner-negatives.mjs: now the semantic checker. Throws on any problem.
 * `options.outDir` is the run directory the rows' outputRefs are relative to.
 */
export function runIntegrityChecker(targetModel, options = {}) {
  const r = assertMerchantCompatResults(targetModel, options);
  for (const env of ENVIRONMENTS) {
    console.log(`✓ ${env}: PASS=${r.counts[env].PASS} FAIL=${r.counts[env].FAIL} NOT_EXECUTED=${r.counts[env].NOT_EXECUTED}`);
  }
  return r;
}

function parseArgs(argv) {
  const out = { envs: [...ENVIRONMENTS], outDir: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out.outDir = path.resolve(argv[++i]);
    else if (argv[i] === "--envs") out.envs = String(argv[++i]).split(",").map((s) => s.trim()).filter(Boolean);
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  for (const e of out.envs) if (!ENVIRONMENTS.includes(e)) throw new Error(`unknown environment ${e}`);
  return out;
}

function gitInfo() {
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
    return { head, dirty };
  } catch {
    return { head: null, dirty: null };
  }
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve({ httpStatus: res.statusCode, body: JSON.parse(body) });
          } catch (e) {
            reject(new Error(`GET ${url}: HTTP ${res.statusCode}, body is not JSON`));
          }
        });
      })
      .on("error", reject);
  });
}

const p2pkTx = (inputs, outputs, payload = "") => ({
  version: 0,
  inputs: inputs.map((u) => ({ previousOutpoint: { transactionId: u.transactionId, index: u.index }, signatureScript: "", sequence: 0n, sigOpCount: 1 })),
  outputs: outputs.map(([amount, script]) => ({ amount, scriptPublicKey: { version: 0, scriptPublicKey: script } })),
  lockTime: 0n,
  subnetworkId: "00".repeat(20),
  gas: 0n,
  payload
});

// Above the simulator's relay minimum (100 sompi/gram since the 2026-11-06 repair) for every transaction built here.
const FEE = 1_000_000n;
const SIGNED_RELEASE = path.join(ROOT, "fixtures", "toccata-v2", "silver", "p2sh-signed-release", "contract.sil");
const SILVER_CORPUS = path.join(ROOT, "fixtures", "toccata-v2", "silver");

// ---------------------------------------------------------------------------
// 1. Simulator (@hardkas/simulator, in memory; approximate model, never consensus evidence)
// ---------------------------------------------------------------------------
async function runSimulator(rec, rows) {
  const simMod = await import(dist("simulator"));
  const core = await import(dist("core"));
  const { createKaspaSimulator, SimulatorRpcServer, SOMPI_PER_KAS, signInputForAccount } = simMod;
  const sim = createKaspaSimulator({ networkId: "simnet", automine: false, bootstrapDevAccounts: true });
  const server = new SimulatorRpcServer(sim);
  const alice = sim.accounts.alice;
  const bob = sim.accounts.bob;
  const carol = sim.accounts.carol;
  const set = (id, row) => (rows[id] = row);
  const balance = async (address) => BigInt((await sim.rpc.getBalanceByAddress(address)).balance);
  try {
    set("OP-01", await rec.execute({
      id: "OP-01", env: "simulator", executor: "sim.getBlockDagInfo", command: "simulator.rpc.getBlockDagInfo()",
      exec: () => sim.rpc.getBlockDagInfo(),
      checks: () => [{ path: "observed.virtualDaaScore", op: "gte", value: "0" }, { path: "observed.tipHashes", op: "lenGte", value: 1 }]
    }));
    set("OP-03", await rec.execute({
      id: "OP-03", env: "simulator", executor: "sim.server.start", command: "SimulatorRpcServer.start({ host: \"127.0.0.1\", port: 0 }) + GET /info",
      exec: async () => {
        const start = await server.start({ host: "127.0.0.1", port: 0 });
        const info = await httpGetJson(`${start.httpUrl.replace(/\/$/, "")}/info`);
        return { start, info };
      },
      checks: () => [
        { path: "observed.start.httpUrl", op: "match", value: "^http://127\\.0\\.0\\.1:\\d+" },
        { path: "observed.info.httpStatus", op: "eq", value: 200 },
        { path: "observed.info.body.status", op: "eq", value: "healthy" }
      ]
    }));
    set("OP-04", await rec.execute({
      id: "OP-04", env: "simulator", executor: "sim.fund", command: `simulator.fund(${alice.address}, 100 KAS)`,
      exec: async () => {
        const balanceBefore = await balance(alice.address);
        const fundedSompi = 100n * SOMPI_PER_KAS;
        sim.fund(alice, fundedSompi);
        return { address: alice.address, fundedSompi, balanceBefore, balanceAfter: await balance(alice.address) };
      },
      checks: () => [{ path: "observed.balanceAfter", op: "sum", value: { terms: [["observed.balanceBefore", 1], ["observed.fundedSompi", 1]] } }]
    }));
    set("OP-06", await rec.execute({
      id: "OP-06", env: "simulator", executor: "sim.getInfo", command: "simulator.rpc.getInfo()",
      exec: () => sim.rpc.getInfo(),
      checks: () => [{ path: "observed.isUtxoIndexed", op: "eq", value: true }, { path: "observed.serverVersion", op: "truthy" }]
    }));
    set("OP-07", await rec.execute({
      id: "OP-07", env: "simulator", executor: "sim.snapshotRevert", command: "simulator.snapshot()+fund+revert(snapshot)",
      exec: async () => {
        const balanceBefore = await balance(carol.address);
        const snapshotId = sim.snapshot();
        sim.fund(carol, 7n * SOMPI_PER_KAS);
        const balanceMutated = await balance(carol.address);
        const reverted = sim.revert(snapshotId);
        return { snapshotId, reverted, balanceBefore, balanceMutated, balanceAfterRevert: await balance(carol.address) };
      },
      checks: () => [
        { path: "observed.reverted", op: "eq", value: true },
        { path: "observed.balanceMutated", op: "sum", value: { terms: [["observed.balanceBefore", 1]], plus: (7n * SOMPI_PER_KAS).toString() } },
        { path: "observed.balanceAfterRevert", op: "sum", value: { terms: [["observed.balanceBefore", 1]] } }
      ]
    }));
    set("OP-09", await rec.execute({
      id: "OP-09", env: "simulator", executor: "sim.getDevAccounts", command: "simulator.getDevAccounts()",
      exec: () => {
        const accounts = sim.getDevAccounts();
        return { count: accounts.length, names: accounts.map((a) => a.name), addresses: accounts.map((a) => a.address) };
      },
      checks: () => [{ path: "observed.count", op: "gte", value: 3 }, { path: "observed.addresses", op: "lenGte", value: 3 }]
    }));
    set("OP-11", await rec.execute({
      id: "OP-11", env: "simulator", executor: "sim.getBalanceByAddress", command: `simulator.rpc.getBalanceByAddress(${alice.address})`,
      exec: async () => ({ address: alice.address, ...(await sim.rpc.getBalanceByAddress(alice.address)) }),
      checks: () => [{ path: "observed.balance", op: "gte", value: "0" }]
    }));
    set("OP-16", await rec.execute({
      id: "OP-16", env: "simulator", executor: "sim.signInput", command: "simulator.signInputForAccount(alice, tx, 0, utxo)",
      exec: () => {
        const u = sim.ledger.getUtxosByAddress(alice.address)[0];
        const tx = p2pkTx([u], [[10n * SOMPI_PER_KAS, bob.scriptPublicKey], [u.amountSompi - 10n * SOMPI_PER_KAS - FEE, alice.scriptPublicKey]]);
        signInputForAccount(alice, tx, 0, u);
        const s = tx.inputs[0].signatureScript;
        return { signatureScript: s, signatureScriptBytes: s.length / 2, pushOp: s.slice(0, 2), sighashType: s.slice(-2) };
      },
      checks: () => [
        { path: "observed.signatureScriptBytes", op: "eq", value: 66 },
        { path: "observed.pushOp", op: "eq", value: "41" },
        { path: "observed.sighashType", op: "eq", value: "01" }
      ]
    }));
    const sendCase = (id, from, to, amount, payload) =>
      rec.execute({
        id, env: "simulator", executor: "sim.submitAndMine", command: `simulator.rpc.submitTransaction(${from.name} -> ${to.name}, ${amount} sompi) + mine(1)`,
        exec: async () => {
          const u = sim.ledger.getUtxosByAddress(from.address)[0];
          const senderBefore = await balance(from.address);
          const recipientBefore = await balance(to.address);
          const tx = p2pkTx([u], [[amount, to.scriptPublicKey], [u.amountSompi - amount - FEE, from.scriptPublicKey]], payload);
          signInputForAccount(from, tx, 0, u);
          const res = await sim.rpc.submitTransaction(tx);
          sim.mine(1);
          return { transactionId: res.transactionId, amount, fee: FEE, senderBefore, senderAfter: await balance(from.address), recipientBefore, recipientAfter: await balance(to.address) };
        },
        checks: () => [
          { path: "observed.transactionId", op: "hex64" },
          { path: "observed.recipientAfter", op: "sum", value: { terms: [["observed.recipientBefore", 1], ["observed.amount", 1]] } },
          { path: "observed.senderAfter", op: "sum", value: { terms: [["observed.senderBefore", 1], ["observed.amount", -1], ["observed.fee", -1]] } }
        ]
      });
    set("OP-17", await sendCase("OP-17", alice, bob, 10n * SOMPI_PER_KAS, Buffer.from("op-17").toString("hex")));
    set("OP-18", await sendCase("OP-18", bob, carol, 5n * SOMPI_PER_KAS, Buffer.from("op-18").toString("hex")));
    set("OP-22", await rec.execute({
      id: "OP-22", env: "simulator", executor: "sim.batch", command: "simulator.rpc.submitTransaction(x3)+mine(1)",
      exec: async () => {
        const split = sim.ledger.getUtxosByAddress(alice.address)[0];
        const splitTx = p2pkTx([split], [[10n * SOMPI_PER_KAS, alice.scriptPublicKey], [10n * SOMPI_PER_KAS, alice.scriptPublicKey], [split.amountSompi - 20n * SOMPI_PER_KAS - FEE, alice.scriptPublicKey]], Buffer.from("op-22-split").toString("hex"));
        signInputForAccount(alice, splitTx, 0, split);
        await sim.rpc.submitTransaction(splitTx);
        sim.mine(1);
        const utxos = sim.ledger.getUtxosByAddress(alice.address).slice(0, 3);
        if (utxos.length < 3) throw new Error(`only ${utxos.length} UTXOs available for the batch`);
        const transactionIds = [];
        const recipientBefore = await balance(bob.address);
        const batchTotal = 3n * SOMPI_PER_KAS;
        for (let i = 0; i < 3; i++) {
          const u = utxos[i];
          const tx = p2pkTx([u], [[1n * SOMPI_PER_KAS, bob.scriptPublicKey], [u.amountSompi - 1n * SOMPI_PER_KAS - FEE, alice.scriptPublicKey]], Buffer.from(`op-22-${i}`).toString("hex"));
          signInputForAccount(alice, tx, 0, u);
          transactionIds.push((await sim.rpc.submitTransaction(tx)).transactionId);
        }
        const mempoolCountBeforeMine = sim.mempool.getAllTransactions().length;
        const [block] = sim.mine(1);
        return {
          transactionIds,
          mempoolCountBeforeMine,
          minedNonCoinbase: block.transactions.length - 1,
          blockHash: block.header?.hash,
          blockTransactionIds: block.transactionIds ?? null,
          batchTotal,
          recipientBefore,
          recipientAfter: await balance(bob.address)
        };
      },
      checks: () => [
        { path: "observed.mempoolCountBeforeMine", op: "gte", value: 3 },
        { path: "observed.minedNonCoinbase", op: "gte", value: 3 },
        // the three payments were applied by that one block
        { path: "observed.recipientAfter", op: "sum", value: { terms: [["observed.recipientBefore", 1], ["observed.batchTotal", 1]] } }
      ]
    }));
    // SilverScript: compile with the HardKAS function `hardkas silver compile` runs, verify with the corpus verifier,
    // then deploy the compiled P2SH on the simulator and spend it with a real Schnorr signature of the owner (Alice) and
    // of an intruder (Bob). The simulator's ScriptVM decides; that is simulator evidence, not consensus evidence.
    let compiled;
    set("OP-28", await rec.execute({
      id: "OP-28", env: "simulator", executor: "core.compileSilverScript", command: `@hardkas/core.compileSilverScript(fixtures/toccata-v2/silver/p2sh-signed-release/contract.sil, owner=alice)`,
      exec: async () => {
        const r = await core.compileSilverScript({
          source: fs.readFileSync(SIGNED_RELEASE),
          constructorArgs: [{ kind: "bytes", value: Array.from(Buffer.from(alice.publicKey, "hex")) }]
        });
        const { name, contract } = core.getSilContract(r.artifact);
        compiled = { artifact: r.artifact, bytecodeHex: core.silContractBytecodeHex(contract) };
        return { contract: name, bytecodeBytes: compiled.bytecodeHex.length / 2, provenance: r.provenance };
      },
      checks: () => [
        { path: "observed.contract", op: "eq", value: "SignedRelease" },
        { path: "observed.provenance.artifactSha256", op: "hex64" },
        { path: "observed.provenance.contracts.0.bytecodeSha256", op: "hex64" },
        { path: "observed.provenance.compiler.releaseTag", op: "truthy" }
      ]
    }));
    set("OP-29", await rec.execute({
      id: "OP-29", env: "simulator", executor: "core.verifySilverCorpus", command: "@hardkas/core.verifySilverCorpus(fixtures/toccata-v2/silver)",
      exec: async () => {
        const r = await core.verifySilverCorpus(SILVER_CORPUS, { workspaceRoot: ROOT });
        return { corpus: "fixtures/toccata-v2/silver", ok: r.ok, cases: r.cases.length, failedCases: r.cases.filter((c) => !c.ok).length, problems: r.issues.length, summary: r.summary, issues: r.issues };
      },
      checks: () => [{ path: "observed.ok", op: "eq", value: true }, { path: "observed.cases", op: "gte", value: 1 }, { path: "observed.failedCases", op: "eq", value: 0 }]
    }));
    let contractUtxo;
    if (compiled) {
      set("OP-30", await rec.execute({
        id: "OP-30", env: "simulator", executor: "sim.deployP2sh", command: "simulator.rpc.submitTransaction(P2SH deploy of SignedRelease, 10 KAS) + mine(1)",
        exec: async () => {
          const lock = core.silverP2shLock(compiled.bytecodeHex);
          const p2shAddress = core.silverP2shAddress(compiled.bytecodeHex, "simnet");
          const u = sim.ledger.getUtxosByAddress(alice.address)[0];
          const tx = p2pkTx([u], [[10n * SOMPI_PER_KAS, lock.script], [u.amountSompi - 10n * SOMPI_PER_KAS - FEE, alice.scriptPublicKey]], Buffer.from("op-30").toString("hex"));
          signInputForAccount(alice, tx, 0, u);
          const res = await sim.rpc.submitTransaction(tx);
          sim.mine(1);
          contractUtxo = sim.ledger.getUtxosByAddress(p2shAddress).find((x) => x.transactionId === res.transactionId);
          return { transactionId: res.transactionId, p2shAddress, lockScript: lock.script, contractUtxoAmount: contractUtxo?.amountSompi ?? null };
        },
        checks: () => [
          { path: "observed.transactionId", op: "hex64" },
          { path: "observed.contractUtxoAmount", op: "eq", value: (10n * SOMPI_PER_KAS).toString() }
        ]
      }));
    } else {
      set("OP-30", rec.notExecuted("OP-30", "simulator", "PREREQUISITE_FAILED", "OP-28 (compile) did not pass"));
    }
    const spendCase = (id, signer, expectAccepted) =>
      rec.execute({
        id, env: "simulator", executor: "sim.spendP2sh", command: `simulator.rpc.submitTransaction(P2SH spend of SignedRelease.release signed by ${signer.name})`,
        exec: async () => {
          const recipientBefore = await balance(carol.address);
          const tx = p2pkTx([contractUtxo], [[contractUtxo.amountSompi - FEE, carol.scriptPublicKey]], Buffer.from(id).toString("hex"));
          signInputForAccount(signer, tx, 0, contractUtxo);
          const sig65 = core.silverSigFromInputSignature(tx.inputs[0].signatureScript);
          const entryArgs = core.encodeSilverEntryArgs({ artifact: compiled.artifact, entry: "release", args: [{ kind: "bytes", value: Array.from(sig65) }] });
          tx.inputs[0].signatureScript = core.silverUnlockScript(compiled.bytecodeHex, entryArgs);
          try {
            const res = await sim.rpc.submitTransaction(tx);
            sim.mine(1);
            return { signer: signer.name, accepted: true, transactionId: res.transactionId, recipientBefore, recipientAfter: await balance(carol.address), amount: contractUtxo.amountSompi - FEE };
          } catch (e) {
            return { signer: signer.name, accepted: false, error: String(e?.message ?? e) };
          }
        },
        checks: () =>
          expectAccepted
            ? [
                { path: "observed.accepted", op: "eq", value: true },
                { path: "observed.transactionId", op: "hex64" },
                { path: "observed.recipientAfter", op: "sum", value: { terms: [["observed.recipientBefore", 1], ["observed.amount", 1]] } }
              ]
            : [
                { path: "observed.accepted", op: "eq", value: false },
                { path: "observed.error", op: "match", value: "script|signature|checksig|verify" }
              ]
      });
    if (contractUtxo) {
      set("OP-31", await spendCase("OP-31", bob, false));
      set("OP-32", await spendCase("OP-32", alice, true));
    } else {
      set("OP-31", rec.notExecuted("OP-31", "simulator", "PREREQUISITE_FAILED", "OP-30 (deploy) did not pass"));
      set("OP-32", rec.notExecuted("OP-32", "simulator", "PREREQUISITE_FAILED", "OP-30 (deploy) did not pass"));
    }
  } finally {
    await server.close().catch(() => {});
    try {
      sim.close();
    } catch {
      // already closed
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Simnet: an isolated rusty-kaspad v2.1.0 node (by digest, 127.0.0.1, free port) started by @hardkas/testing
// ---------------------------------------------------------------------------
async function runSimnet(rec, rows, probes, metadata) {
  const testing = await import(dist("testing"));
  const core = await import(dist("core"));
  let session;
  try {
    session = await testing.startIsolatedSimnet({ startupTimeoutMs: 90_000 });
  } catch (e) {
    metadata.environments.simnet = { started: false, error: String(e?.message ?? e) };
    for (const op of OPERATIONS) rows[op.id] = rec.notExecuted(op.id, "simnet", "ENVIRONMENT_UNAVAILABLE", String(e?.message ?? e));
    probes.push({ id: "PROBE-01", env: "simnet", name: "v0 transaction with a covenant binding is rejected", ...rec.notExecuted("PROBE-01", "simnet", "ENVIRONMENT_UNAVAILABLE", String(e?.message ?? e)) });
    return;
  }
  metadata.environments.simnet = {
    started: true,
    image: core.KASPAD_REFERENCE_IMAGE,
    rpcUrl: session.rpcUrl,
    containerName: session.containerName ?? null,
    identity: session.handle?.identity ? JSON.parse(JSON.stringify(session.handle.identity, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) : null
  };
  try {
    rows["OP-01"] = await rec.execute({
      id: "OP-01", env: "simnet", executor: "rpc.getBlockDagInfo", command: `@hardkas/kaspa-rpc JsonWrpcKaspaClient.getBlockDagInfo() @ ${session.rpcUrl}`,
      exec: () => session.rpc.getBlockDagInfo(),
      checks: () => [{ path: "observed.virtualDaaScore", op: "gte", value: "0" }]
    });
    rows["OP-06"] = await rec.execute({
      id: "OP-06", env: "simnet", executor: "rpc.getServerInfo", command: `@hardkas/kaspa-rpc JsonWrpcKaspaClient.getServerInfo() @ ${session.rpcUrl}`,
      exec: () => session.rpc.getServerInfo(),
      checks: () => [{ path: "observed.serverVersion", op: "match", value: "^2\\.1\\.0" }, { path: "observed.networkId", op: "match", value: "simnet" }]
    });
    rows["OP-11"] = await rec.execute({
      id: "OP-11", env: "simnet", executor: "rpc.getBalanceByAddress", command: `@hardkas/kaspa-rpc JsonWrpcKaspaClient.getBalanceByAddress(${session.minerAddress})`,
      exec: async () => ({ address: session.minerAddress, ...(await session.rpc.getBalanceByAddress(session.minerAddress)) }),
      checks: () => [{ path: "observed.balanceSompi", op: "gte", value: "0" }, { path: "observed.address", op: "eq", value: session.minerAddress }]
    });
    // PROBE-01: not one of the 58 operations (it is a rejection probe, not a covenant genesis); kept apart.
    const probe = await rec.execute({
      id: "PROBE-01", env: "simnet", executor: "wasm.submitV0WithCovenant", probe: true,
      command: `kaspa-wasm RpcClient.submitTransaction(v0+covenant binding, unknown outpoint) @ ${session.rpcUrl}`,
      exec: async () => {
        const k = core.loadManagedKaspaWasmSync();
        const client = new k.RpcClient({ url: session.rpcUrl, encoding: k.Encoding.SerdeJson });
        await client.connect({ blockAsyncConnect: true });
        try {
          const spk = new k.ScriptPublicKey(0, "20" + "00".repeat(32) + "ac");
          const tx = new k.Transaction({
            version: 0,
            inputs: [{ previousOutpoint: { transactionId: "11".repeat(32), index: 0 }, signatureScript: "", sequence: 0n, sigOpCount: 1 }],
            outputs: [{ value: 100000n, scriptPublicKey: spk, covenant: { authorizingInput: 0, covenantId: "00".repeat(32) } }],
            lockTime: 0n,
            subnetworkId: "00".repeat(20),
            gas: 0n,
            payload: ""
          });
          try {
            const r = await client.submitTransaction({ transaction: tx, allowOrphan: false });
            return { rejected: false, error: null, response: r };
          } catch (e) {
            return { rejected: true, error: String(e?.message ?? e) };
          }
        } finally {
          await client.disconnect().catch(() => {});
        }
      },
      checks: () => [{ path: "observed.rejected", op: "eq", value: true }, { path: "observed.error", op: "match", value: "covenant" }]
    });
    probes.push({ ...probe, name: "v0 transaction with a covenant binding is rejected" });
  } finally {
    await testing.stopIsolatedSimnet(session).catch((e) => console.error(`[simnet] stop failed: ${e?.message ?? e}`));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = crypto.randomBytes(16).toString("hex");
  const outDir = args.outDir ?? path.join(ROOT, ".hardkas", "merchant-compat", runId);
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) throw new Error(`--out ${outDir} is not empty: every run gets its own directory`);
  const rec = new EvidenceRecorder({ outDir, runId });
  const metadata = {
    runId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    tool: "scripts/run-merchant-compatibility-battery-v2.mjs",
    git: gitInfo(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    envs: args.envs,
    environments: {}
  };
  const rowsByEnv = { simulator: {}, simnet: {}, testnet: {} };
  const probes = [];

  if (args.envs.includes("simulator")) {
    console.log("[1/3] simulator (@hardkas/simulator)");
    try {
      await runSimulator(rec, rowsByEnv.simulator);
    } catch (e) {
      metadata.environments.simulator = { error: String(e?.message ?? e) };
      console.error(`[simulator] ${e?.stack ?? e}`);
    }
  }
  if (args.envs.includes("simnet")) {
    console.log("[2/3] simnet (isolated rusty-kaspad by digest)");
    await runSimnet(rec, rowsByEnv.simnet, probes, metadata);
  }

  const operations = {};
  for (const op of OPERATIONS) {
    const environments = {};
    for (const env of ENVIRONMENTS) {
      let row = rowsByEnv[env][op.id];
      if (!row) {
        if (!args.envs.includes(env)) row = rec.notExecuted(op.id, env, "NOT_SELECTED");
        else if (env === "testnet") {
          row = LOCAL_NODE_OPS.has(op.id) || OFFLINE_OPS.has(op.id)
            ? rec.notExecuted(op.id, env, "NOT_APPLICABLE", OFFLINE_OPS.has(op.id) ? "offline toolchain operation, executed once under the simulator column" : "local node management")
            : op.isMutating
              ? rec.notExecuted(op.id, env, "POLICY_BLOCKED")
              : rec.notExecuted(op.id, env, "NO_ENDPOINT", "this battery does not connect to testnet");
        } else if (env === "simnet" && OFFLINE_OPS.has(op.id)) {
          row = rec.notExecuted(op.id, env, "NOT_APPLICABLE", "offline toolchain operation, executed once under the simulator column");
        } else if (env === "simulator" && metadata.environments.simulator?.error) {
          row = rec.notExecuted(op.id, env, "ENVIRONMENT_UNAVAILABLE", metadata.environments.simulator.error);
        } else {
          row = rec.notExecuted(op.id, env, "NO_EXECUTOR", `nothing in this battery runs '${op.name}' against the ${env}`);
        }
      }
      environments[env] = row;
    }
    operations[op.id] = { id: op.id, name: op.name, category: op.category, isMutating: op.isMutating, source: op.source, environments };
  }
  metadata.finishedAt = new Date().toISOString();
  const model = { schema: RESULTS_SCHEMA, metadata, operations, probes };
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(model, null, 2) + "\n", "utf8");
  const verdict = verifyMerchantCompatResults(model, { outDir });
  const { summaryMd, matrixCsv } = renderReports(model);
  fs.writeFileSync(path.join(outDir, "summary.md"), summaryMd, "utf8");
  fs.writeFileSync(path.join(outDir, "matrix.csv"), matrixCsv, "utf8");
  for (const env of ENVIRONMENTS) console.log(`${env}: PASS=${verdict.counts[env].PASS} FAIL=${verdict.counts[env].FAIL} NOT_EXECUTED=${verdict.counts[env].NOT_EXECUTED}`);
  console.log(`results: ${path.join(outDir, "results.json")}`);
  if (!verdict.ok) {
    console.error(`results do not verify:\n  - ${verdict.problems.join("\n  - ")}`);
    process.exitCode = 1;
  } else {
    console.log("results verify (semantic checker): every PASS was executed and its checks hold on the stored output");
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error("merchant compatibility battery:", err?.stack ?? err);
    process.exit(1);
  });
}
