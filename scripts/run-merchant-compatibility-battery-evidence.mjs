// scripts/run-merchant-compatibility-battery-evidence.mjs
// Evidence rules of the merchant-demo compatibility battery (HK-07, CA-EV-06, SIM-12).
//
// A row is PASS only if the battery EXECUTED the named operation through an executor declared for that operation and
// environment, and kept what it observed:
//   - executor: an id from EXECUTORS whose `ops` include the operation (the declared, reviewable equivalence);
//   - command: the literal call or command line that ran (it must start with the executor's command);
//   - startedAt and durationMs (> 0, measured with hrtime);
//   - outputRef: a file under the run directory holding the raw observed response, its runId and the command;
//   - outputSha256: the digest of that file;
//   - checks: assertions over the observed response, re-evaluated by the checker against the file;
//   - detail: the verdict text, generated from the observed response by the executor's describe(); never a literal.
// Everything not executed is NOT_EXECUTED with a reason code. There is no OFFLINE_PASS, NOT_IMPLEMENTED, SKIP,
// BLOCKED or NOT_TESTED status any more: those rows used to be counted next to PASS (v1 wrote PASS with fixed texts).
// A row whose execution threw, or whose checks do not hold, is FAIL with the real error text.
//
// The checker (verifyMerchantCompatResults) verifies semantics, not only structure: it re-reads every output file,
// recomputes its digest, re-evaluates every check and regenerates every verdict text from the observed response.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const RESULTS_SCHEMA = "hardkas.merchantCompat.v3";
export const OUTPUT_SCHEMA = "hardkas.merchantCompat.output.v1";
export const ENVIRONMENTS = ["simulator", "simnet", "testnet"];
export const STATUSES = ["PASS", "FAIL", "NOT_EXECUTED"];
export const NOT_EXECUTED_REASONS = {
  NO_EXECUTOR: "the battery has no executor that runs this operation in this environment",
  NOT_APPLICABLE: "the operation does not target this environment",
  POLICY_BLOCKED: "mutating operation on a public network: not run without the owner's explicit authorization and funds",
  NO_ENDPOINT: "no endpoint of this network was configured for the run",
  ENVIRONMENT_UNAVAILABLE: "the environment could not be started or reached (see detail)",
  PREREQUISITE_FAILED: "an operation this one depends on did not pass in this run (see detail)",
  NOT_SELECTED: "the environment was not selected for this run (--envs)"
};

// 58 operations of the merchant-demo-rc28 inventory (source: the demo's server/index.mjs, COMANDOS.md, tests).
export const OPERATIONS = [
  { id: "OP-01", name: "localnet status", category: "localnet", isMutating: false, source: "server/index.mjs:182" },
  { id: "OP-02", name: "localnet start --toccata", category: "localnet", isMutating: true, source: "server/index.mjs:369" },
  { id: "OP-03", name: "simulator start", category: "simulator", isMutating: false, source: "commands/simulator.ts:12" },
  { id: "OP-04", name: "localnet fund", category: "localnet", isMutating: true, source: "server/index.mjs:403" },
  { id: "OP-05", name: "localnet stop --toccata", category: "localnet", isMutating: true, source: "server/index.mjs:1821" },
  { id: "OP-06", name: "node status", category: "localnet", isMutating: false, source: "server/index.mjs:1737" },
  { id: "OP-07", name: "node reset", category: "localnet", isMutating: true, source: "server/index.mjs:1853" },
  { id: "OP-08", name: "node logs", category: "localnet", isMutating: false, source: "COMANDOS.md:20" },
  { id: "OP-09", name: "accounts list", category: "accounts", isMutating: false, source: "server/index.mjs:377" },
  { id: "OP-10", name: "accounts real generate", category: "accounts", isMutating: false, source: "server/index.mjs:386" },
  { id: "OP-11", name: "accounts balance", category: "accounts", isMutating: false, source: "server/index.mjs:203" },
  { id: "OP-12", name: "sdk.accounts.resolve", category: "accounts", isMutating: false, source: "golden-core.test.ts:25" },
  { id: "OP-13", name: "sdk.accounts.balance", category: "accounts", isMutating: false, source: "golden-core.test.ts:48" },
  { id: "OP-14", name: "tx plan", category: "tx", isMutating: false, source: "server/index.mjs:662" },
  { id: "OP-15", name: "tx profile", category: "tx", isMutating: false, source: "server/index.mjs:628" },
  { id: "OP-16", name: "tx sign", category: "tx", isMutating: false, source: "server/index.mjs:694" },
  { id: "OP-17", name: "tx send (signed)", category: "tx", isMutating: true, source: "server/index.mjs:720" },
  { id: "OP-18", name: "tx send (short-form)", category: "tx", isMutating: true, source: "server/index.mjs:411" },
  { id: "OP-19", name: "tx wait", category: "tx", isMutating: false, source: "server/index.mjs:307" },
  { id: "OP-20", name: "tx status", category: "tx", isMutating: false, source: "server/index.mjs:801" },
  { id: "OP-21", name: "tx receipt", category: "tx", isMutating: false, source: "server/index.mjs:803" },
  { id: "OP-22", name: "tx batch", category: "tx", isMutating: true, source: "server/index.mjs:1682" },
  { id: "OP-23", name: "sdk.tx.plan", category: "tx", isMutating: false, source: "golden-core.test.ts:28" },
  { id: "OP-24", name: "sdk.tx.sign", category: "tx", isMutating: false, source: "golden-core.test.ts:33" },
  { id: "OP-25", name: "sdk.tx.send", category: "tx", isMutating: true, source: "golden-core.test.ts:37" },
  { id: "OP-26", name: "sdk.tx.observe", category: "tx", isMutating: false, source: "golden-core.test.ts:16" },
  { id: "OP-27", name: "sdk.tx.status", category: "tx", isMutating: false, source: "report.ts:35" },
  { id: "OP-28", name: "silver compile", category: "silver", isMutating: false, source: "server/index.mjs:1146" },
  { id: "OP-29", name: "silver verify", category: "silver", isMutating: false, source: "server/index.mjs:1171" },
  { id: "OP-30", name: "silver deploy", category: "silver", isMutating: true, source: "server/index.mjs:1178" },
  { id: "OP-31", name: "silver spend (intruder)", category: "silver", isMutating: true, source: "server/index.mjs:1208" },
  { id: "OP-32", name: "silver spend (owner)", category: "silver", isMutating: true, source: "server/index.mjs:1217" },
  { id: "OP-33", name: "silver covenant genesis", category: "silver", isMutating: true, source: "server/index.mjs:1408" },
  { id: "OP-34", name: "silver covenant transition", category: "silver", isMutating: true, source: "server/index.mjs:1343" },
  { id: "OP-35", name: "deploy track", category: "silver", isMutating: false, source: "server/index.mjs:269" },
  { id: "OP-36", name: "deploy history", category: "silver", isMutating: false, source: "server/index.mjs:235" },
  { id: "OP-37", name: "evidence pack", category: "evidence", isMutating: false, source: "server/index.mjs:837" },
  { id: "OP-38", name: "evidence verify", category: "evidence", isMutating: false, source: "server/index.mjs:842" },
  { id: "OP-39", name: "verify (artifact)", category: "evidence", isMutating: false, source: "server/index.mjs:755" },
  { id: "OP-40", name: "why", category: "evidence", isMutating: false, source: "server/index.mjs:763" },
  { id: "OP-41", name: "artifact lineage", category: "evidence", isMutating: false, source: "server/index.mjs:645" },
  { id: "OP-42", name: "artifact verify", category: "evidence", isMutating: false, source: "server/index.mjs:1640" },
  { id: "OP-43", name: "explain --tx", category: "evidence", isMutating: false, source: "server/index.mjs:787" },
  { id: "OP-44", name: "query tx", category: "evidence", isMutating: false, source: "server/index.mjs:805" },
  { id: "OP-45", name: "query store rebuild", category: "evidence", isMutating: false, source: "server/index.mjs:1619" },
  { id: "OP-46", name: "query store doctor", category: "evidence", isMutating: false, source: "server/index.mjs:1621" },
  { id: "OP-47", name: "query artifacts list", category: "evidence", isMutating: false, source: "server/index.mjs:1625" },
  { id: "OP-48", name: "query lineage orphans", category: "evidence", isMutating: false, source: "server/index.mjs:1633" },
  { id: "OP-49", name: "security audit", category: "evidence", isMutating: false, source: "server/index.mjs:1643" },
  { id: "OP-50", name: "ci verify", category: "evidence", isMutating: false, source: "COMANDOS.md:94" },
  { id: "OP-51", name: "doctor", category: "diagnostics", isMutating: false, source: "server/index.mjs:1735" },
  { id: "OP-52", name: "rpc health", category: "diagnostics", isMutating: false, source: "server/index.mjs:1739" },
  { id: "OP-53", name: "rpc doctor", category: "diagnostics", isMutating: false, source: "server/index.mjs:1747" },
  { id: "OP-54", name: "toolchain status", category: "diagnostics", isMutating: false, source: "server/index.mjs:224" },
  { id: "OP-55", name: "config networks", category: "diagnostics", isMutating: false, source: "server/index.mjs:1754" },
  { id: "OP-56", name: "lock list", category: "diagnostics", isMutating: false, source: "server/index.mjs:1756" },
  { id: "OP-57", name: "test --evidence", category: "testing", isMutating: false, source: "server/index.mjs:1550" },
  { id: "OP-58", name: "task balances", category: "testing", isMutating: false, source: "server/index.mjs:1785" }
];

// Operations that manage a local node: not applicable to a public network.
export const LOCAL_NODE_OPS = new Set(["OP-01", "OP-02", "OP-03", "OP-05", "OP-06", "OP-07", "OP-08"]);
// Offline toolchain operations: executed once, under the simulator column (no network).
export const OFFLINE_OPS = new Set(["OP-28", "OP-29"]);

const short = (v, n = 16) => (typeof v === "string" && v.length > n ? `${v.slice(0, n)}…` : String(v));

/**
 * The declared equivalences: which executor may evidence which operation in which environment, what its command line
 * starts with, and how its verdict text is derived from what it observed. Reviewing this table is reviewing every
 * claim the battery can make. "simulator-api" executors call @hardkas/simulator (not the HardKAS CLI); "hardkas-core"
 * calls the @hardkas/core function the CLI command runs; "hardkas-rpc" is @hardkas/kaspa-rpc against rusty-kaspad;
 * "kaspa-wasm-rpc" is the official RpcClient against rusty-kaspad.
 */
export const EXECUTORS = {
  "sim.getBlockDagInfo": {
    env: "simulator", kind: "simulator-api", ops: ["OP-01"], command: "simulator.rpc.getBlockDagInfo()",
    describe: (o) => `simulator getBlockDagInfo: network=${o.networkId ?? o.network} virtualDaaScore=${o.virtualDaaScore} tips=${o.tipHashes?.length}`
  },
  "sim.server.start": {
    env: "simulator", kind: "simulator-api", ops: ["OP-03"], command: "SimulatorRpcServer.start(",
    describe: (o) => `simulator RPC server listening on ${o.start?.httpUrl}; GET /info answered HTTP ${o.info?.httpStatus} status=${o.info?.body?.status}`
  },
  "sim.fund": {
    env: "simulator", kind: "simulator-api", ops: ["OP-04"], command: "simulator.fund(",
    describe: (o) => `simulator fund ${o.fundedSompi} sompi to ${short(o.address, 20)}: balance ${o.balanceBefore} -> ${o.balanceAfter}`
  },
  "sim.getInfo": {
    env: "simulator", kind: "simulator-api", ops: ["OP-06"], command: "simulator.rpc.getInfo()",
    describe: (o) => `simulator getInfo: serverVersion=${o.serverVersion} isUtxoIndexed=${o.isUtxoIndexed} isSynced=${o.isSynced}`
  },
  "sim.snapshotRevert": {
    env: "simulator", kind: "simulator-api", ops: ["OP-07"], command: "simulator.snapshot()+fund+revert(",
    describe: (o) => `simulator revert(${o.snapshotId}) returned ${o.reverted}: balance ${o.balanceBefore} -> ${o.balanceMutated} -> ${o.balanceAfterRevert}`
  },
  "sim.getDevAccounts": {
    env: "simulator", kind: "simulator-api", ops: ["OP-09"], command: "simulator.getDevAccounts()",
    describe: (o) => `simulator dev accounts: ${o.count} (${(o.names ?? []).join(", ")})`
  },
  "sim.getBalanceByAddress": {
    env: "simulator", kind: "simulator-api", ops: ["OP-11"], command: "simulator.rpc.getBalanceByAddress(",
    describe: (o) => `simulator getBalanceByAddress(${short(o.address, 20)}) = ${o.balance} sompi`
  },
  "sim.signInput": {
    env: "simulator", kind: "simulator-api", ops: ["OP-16"], command: "simulator.signInputForAccount(",
    describe: (o) => `simulator signer wrote a ${o.signatureScriptBytes}-byte signature script (push 0x${o.pushOp}, sighash type 0x${o.sighashType})`
  },
  "sim.submitAndMine": {
    env: "simulator", kind: "simulator-api", ops: ["OP-17", "OP-18"], command: "simulator.rpc.submitTransaction(",
    describe: (o) => `simulator accepted ${short(o.transactionId)} and mined it: recipient ${o.recipientBefore} -> ${o.recipientAfter}, sender ${o.senderBefore} -> ${o.senderAfter}`
  },
  "sim.batch": {
    env: "simulator", kind: "simulator-api", ops: ["OP-22"], command: "simulator.rpc.submitTransaction(x3)+mine(1)",
    describe: (o) => `simulator mempool held ${o.mempoolCountBeforeMine} tx; one block mined ${o.minedNonCoinbase} non-coinbase tx (${(o.transactionIds ?? []).map((t) => short(t, 8)).join(", ")})`
  },
  "core.compileSilverScript": {
    env: "simulator", kind: "hardkas-core", ops: ["OP-28"], command: "@hardkas/core.compileSilverScript(",
    describe: (o) => `silverc ${o.provenance?.compiler?.releaseTag} compiled ${o.contract}: bytecode sha256 ${short(o.provenance?.contracts?.[0]?.bytecodeSha256)} (${o.bytecodeBytes} bytes)`
  },
  "core.verifySilverCorpus": {
    env: "simulator", kind: "hardkas-core", ops: ["OP-29"], command: "@hardkas/core.verifySilverCorpus(",
    describe: (o) => `verifySilverCorpus(${o.corpus}): ok=${o.ok} cases=${o.cases} problems=${o.problems}`
  },
  "sim.deployP2sh": {
    env: "simulator", kind: "simulator-api", ops: ["OP-30"], command: "simulator.rpc.submitTransaction(P2SH",
    describe: (o) => `simulator accepted deploy ${short(o.transactionId)}: ${o.contractUtxoAmount} sompi at ${short(o.p2shAddress, 24)}`
  },
  "sim.spendP2sh": {
    env: "simulator", kind: "simulator-api", ops: ["OP-31", "OP-32"], command: "simulator.rpc.submitTransaction(P2SH spend",
    describe: (o) => (o.accepted ? `simulator accepted ${o.signer}'s spend ${short(o.transactionId)}: recipient ${o.recipientBefore} -> ${o.recipientAfter}` : `simulator rejected ${o.signer}'s spend: ${o.error}`)
  },
  "rpc.getBlockDagInfo": {
    env: "simnet", kind: "hardkas-rpc", ops: ["OP-01"], command: "@hardkas/kaspa-rpc JsonWrpcKaspaClient.getBlockDagInfo()",
    describe: (o) => `rusty-kaspad getBlockDagInfo: network=${o.networkId ?? o.network} virtualDaaScore=${o.virtualDaaScore}`
  },
  "rpc.getServerInfo": {
    env: "simnet", kind: "hardkas-rpc", ops: ["OP-06"], command: "@hardkas/kaspa-rpc JsonWrpcKaspaClient.getServerInfo()",
    describe: (o) => `rusty-kaspad getServerInfo: serverVersion=${o.serverVersion} networkId=${o.networkId} hasUtxoIndex=${o.hasUtxoIndex} isSynced=${o.isSynced}`
  },
  "rpc.getBalanceByAddress": {
    env: "simnet", kind: "hardkas-rpc", ops: ["OP-11"], command: "@hardkas/kaspa-rpc JsonWrpcKaspaClient.getBalanceByAddress(",
    describe: (o) => `rusty-kaspad getBalanceByAddress(${short(o.address, 20)}) = ${o.balanceSompi} sompi`
  }
};

/** Probes: real node checks that are not one of the 58 operations (kept apart so they are never counted as one). */
export const PROBE_EXECUTORS = {
  "wasm.submitV0WithCovenant": {
    env: "simnet", kind: "kaspa-wasm-rpc", command: "kaspa-wasm RpcClient.submitTransaction(v0+covenant",
    describe: (o) => `rusty-kaspad answered the v0 transaction carrying a covenant binding: rejected=${o.rejected}: ${o.error}`
  }
};

export function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** JSON-safe copy of an observed response: bigint → decimal string, bytes → hex, Map → object. */
export function toJsonSafe(v) {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
  if (Array.isArray(v)) return v.map(toJsonSafe);
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [String(k), toJsonSafe(x)]));
  if (v && typeof v === "object") {
    if (typeof v.toJSON === "function" && !(v instanceof Date)) {
      try {
        return toJsonSafe(v.toJSON());
      } catch {
        // fall through to the own enumerable properties
      }
    }
    const out = {};
    for (const [k, x] of Object.entries(v)) if (typeof x !== "function") out[k] = toJsonSafe(x);
    return out;
  }
  return v;
}

function getPath(obj, p) {
  return p.split(".").reduce((acc, k) => (acc === undefined || acc === null ? undefined : acc[k]), obj);
}

/** Evaluates one check against a parsed output file; returns { holds, actual }. */
export function evaluateCheck(output, check) {
  const actual = getPath(output, check.path);
  let holds = false;
  switch (check.op) {
    case "eq":
      holds = actual !== undefined && String(actual) === String(check.value);
      break;
    case "gte":
      holds = actual !== undefined && BigInt(actual) >= BigInt(check.value);
      break;
    case "gt":
      holds = actual !== undefined && BigInt(actual) > BigInt(check.value);
      break;
    case "match":
      holds = typeof actual === "string" && new RegExp(check.value, "i").test(actual);
      break;
    case "hex64":
      holds = typeof actual === "string" && /^[0-9a-f]{64}$/i.test(actual);
      break;
    case "truthy":
      holds = Boolean(actual);
      break;
    case "lenGte":
      holds = Array.isArray(actual) && actual.length >= Number(check.value);
      break;
    case "sum": {
      // actual == Σ sign·value(path) + plus  (all as integers)
      try {
        let expected = BigInt(check.value.plus ?? 0);
        for (const [p, sign] of check.value.terms) expected += BigInt(sign) * BigInt(getPath(output, p));
        holds = actual !== undefined && BigInt(actual) === expected;
      } catch {
        holds = false;
      }
      break;
    }
    default:
      holds = false;
  }
  return { holds, actual: actual === undefined ? undefined : toJsonSafe(actual) };
}

/**
 * Records rows for one run. Every executed row writes its observed output to `<outDir>/outputs/<env>/<id>.json` and
 * streams the row to `<outDir>/rows.jsonl`.
 */
export class EvidenceRecorder {
  constructor({ outDir, runId }) {
    this.outDir = outDir;
    this.runId = runId;
    this.rowsFile = path.join(outDir, "rows.jsonl");
    fs.mkdirSync(outDir, { recursive: true });
  }

  stream(row) {
    // hardkas-append-allow: a run-local, append-only progress log of the rows (one writer: this process)
    fs.appendFileSync(this.rowsFile, JSON.stringify(row) + "\n", "utf8");
  }

  notExecuted(id, env, reason, extra) {
    if (!NOT_EXECUTED_REASONS[reason]) throw new Error(`unknown NOT_EXECUTED reason ${reason}`);
    const row = { id, env, status: "NOT_EXECUTED", reason, detail: extra ? `${NOT_EXECUTED_REASONS[reason]}: ${extra}` : NOT_EXECUTED_REASONS[reason] };
    this.stream(row);
    return row;
  }

  /**
   * Runs `exec` (which must perform the operation and return what it observed), measures it, stores the observed
   * response and evaluates `checks(observed)` (a list of { path, op, value } over the output file: paths start with
   * "observed."). A throw is a FAIL with the real error text.
   */
  async execute({ id, env, executor, command, exec, checks, probe = false }) {
    const table = probe ? PROBE_EXECUTORS : EXECUTORS;
    const ex = table[executor];
    if (!ex) throw new Error(`unknown executor ${executor}`);
    if (ex.env !== env) throw new Error(`executor ${executor} is for ${ex.env}, not ${env}`);
    if (!probe && !ex.ops.includes(id)) throw new Error(`executor ${executor} is not declared for ${id}`);
    if (!command.startsWith(ex.command)) throw new Error(`command for ${executor} must start with ${ex.command}`);
    const startedAt = new Date().toISOString();
    const t0 = process.hrtime.bigint();
    let observed;
    let error;
    try {
      observed = toJsonSafe(await exec());
    } catch (e) {
      error = e;
    }
    const durationMs = Number(process.hrtime.bigint() - t0) / 1e6;
    const rel = path.join("outputs", env, `${id}.json`).split(path.sep).join("/");
    const file = path.join(this.outDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const output = {
      schema: OUTPUT_SCHEMA,
      runId: this.runId,
      id,
      env,
      executor,
      command,
      startedAt,
      ...(error ? { error: { message: String(error?.message ?? error), code: error?.code ?? null } } : { observed })
    };
    fs.writeFileSync(file, JSON.stringify(output, null, 2) + "\n", "utf8");
    const base = { id, env, executor, command, startedAt, durationMs, outputRef: rel, outputSha256: sha256File(file) };
    let row;
    if (error) {
      row = { ...base, status: "FAIL", checks: [], detail: `${executor} threw: ${String(error?.message ?? error)}` };
    } else {
      const declared = checks(observed);
      const evaluated = declared.map((c) => ({ ...c, ...evaluateCheck(output, c) }));
      const allHold = evaluated.length > 0 && evaluated.every((c) => c.holds);
      row = {
        ...base,
        status: allHold ? "PASS" : "FAIL",
        checks: evaluated,
        detail: allHold
          ? ex.describe(observed)
          : `checks did not hold: ${evaluated.filter((c) => !c.holds).map((c) => `${c.path} ${c.op} ${JSON.stringify(c.value)} (got ${JSON.stringify(c.actual)})`).join("; ")}`
      };
    }
    this.stream(row);
    return row;
  }
}

/**
 * Semantic checker. Returns { ok, problems, counts }. `outDir` is the run directory the outputRefs are relative to.
 */
export function verifyMerchantCompatResults(model, { outDir } = {}) {
  const problems = [];
  const add = (m) => problems.push(m);
  if (model?.schema !== RESULTS_SCHEMA) add(`schema is ${JSON.stringify(model?.schema)}, expected ${RESULTS_SCHEMA}`);
  const runId = model?.metadata?.runId;
  if (typeof runId !== "string" || !/^[0-9a-f]{32}$/.test(runId)) add("metadata.runId is not a 128-bit hex run id");
  const runStart = Date.parse(model?.metadata?.startedAt ?? "");
  const runEnd = Date.parse(model?.metadata?.finishedAt ?? "");
  if (!Number.isFinite(runStart) || !Number.isFinite(runEnd) || runEnd < runStart) add("metadata.startedAt/finishedAt missing or inverted");

  const ops = Object.values(model?.operations ?? {});
  if (ops.length !== OPERATIONS.length) add(`expected exactly ${OPERATIONS.length} operations, found ${ops.length}`);
  const seen = new Set();
  for (const op of ops) {
    if (seen.has(op.id)) add(`duplicate operation id ${op.id}`);
    seen.add(op.id);
    const inv = OPERATIONS.find((o) => o.id === op.id);
    if (!inv) add(`${op.id}: not in the inventory`);
    else if (inv.name !== op.name) add(`${op.id}: name ${JSON.stringify(op.name)} differs from the inventory (${JSON.stringify(inv.name)})`);
  }
  const counts = Object.fromEntries(ENVIRONMENTS.map((e) => [e, Object.fromEntries(STATUSES.map((s) => [s, 0]))]));
  const txIdOwners = new Map();

  const checkRow = (label, row, table, opId) => {
    if (!row || typeof row !== "object") return add(`${label}: missing`);
    if (!STATUSES.includes(row.status)) return add(`${label}: status ${JSON.stringify(row.status)} is not one of ${STATUSES.join("/")}`);
    if (row.status === "NOT_EXECUTED") {
      if (!NOT_EXECUTED_REASONS[row.reason]) add(`${label}: NOT_EXECUTED without a known reason`);
      if (row.outputRef || (row.checks && row.checks.length) || row.executor) add(`${label}: NOT_EXECUTED carries execution evidence`);
      return;
    }
    const ex = table[row.executor];
    if (!ex) return add(`${label}: executor ${JSON.stringify(row.executor)} is not declared`);
    if (opId && !ex.ops.includes(opId)) add(`${label}: executor ${row.executor} is not declared for ${opId} (it does not run that operation)`);
    if (ex.env !== row.env) add(`${label}: executor ${row.executor} runs in ${ex.env}, row says ${row.env}`);
    if (typeof row.command !== "string" || !row.command.startsWith(ex.command)) add(`${label}: command does not start with the executor's command ${JSON.stringify(ex.command)}`);
    if (!(typeof row.durationMs === "number" && Number.isFinite(row.durationMs) && row.durationMs > 0)) add(`${label}: durationMs ${JSON.stringify(row.durationMs)} is not a measured duration > 0`);
    const started = Date.parse(row.startedAt ?? "");
    if (!Number.isFinite(started) || started < runStart - 1000 || started > runEnd + 1000) add(`${label}: startedAt outside the run window`);
    if (typeof row.outputRef !== "string" || row.outputRef.includes("..") || path.isAbsolute(row.outputRef)) return add(`${label}: no output reference inside the run directory`);
    if (!outDir) return add(`${label}: no run directory to read ${row.outputRef} from`);
    const file = path.join(outDir, row.outputRef);
    if (!fs.existsSync(file)) return add(`${label}: output file ${row.outputRef} does not exist`);
    if (sha256File(file) !== row.outputSha256) add(`${label}: output file digest does not match outputSha256`);
    let output;
    try {
      output = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return add(`${label}: output file is not JSON`);
    }
    if (output.schema !== OUTPUT_SCHEMA) add(`${label}: output schema ${JSON.stringify(output.schema)}`);
    if (output.runId !== runId) add(`${label}: output belongs to run ${output.runId}, not ${runId}`);
    if (output.executor !== row.executor || output.command !== row.command || output.env !== row.env) add(`${label}: output file records another executor/command/env`);
    if (row.status === "PASS") {
      if (output.error || output.observed === undefined) return add(`${label}: PASS without an observed response`);
      if (!Array.isArray(row.checks) || row.checks.length === 0) add(`${label}: PASS without checks`);
      for (const c of row.checks ?? []) {
        if (typeof c.path !== "string" || !c.path.startsWith("observed.")) add(`${label}: check ${JSON.stringify(c.path)} does not read the observed response`);
        const r = evaluateCheck(output, c);
        if (!r.holds) add(`${label}: check ${c.path} ${c.op} ${JSON.stringify(c.value)} does not hold on the output file (got ${JSON.stringify(r.actual)})`);
      }
      let expectedDetail;
      try {
        expectedDetail = ex.describe(output.observed);
      } catch (e) {
        expectedDetail = `<describe threw: ${e?.message}>`;
      }
      if (row.detail !== expectedDetail) add(`${label}: detail is not the text derived from the observed response`);
      const txId = output.observed?.transactionId;
      if (typeof txId === "string") {
        if (txIdOwners.has(txId)) add(`${label}: transaction ${txId} is also claimed by ${txIdOwners.get(txId)}`);
        txIdOwners.set(txId, label);
      }
    } else if (row.status === "FAIL") {
      if (typeof row.detail !== "string" || row.detail.length === 0) add(`${label}: FAIL without the real error or failed checks`);
      if (output.error && !String(row.detail).includes(output.error.message)) add(`${label}: FAIL detail is not the recorded error`);
    }
  };

  for (const op of ops) {
    for (const env of ENVIRONMENTS) {
      const row = op.environments?.[env];
      const label = `${op.id}/${env}`;
      checkRow(label, row, EXECUTORS, op.id);
      if (row && STATUSES.includes(row.status)) counts[env][row.status]++;
      if (row && row.env !== env) add(`${label}: row env ${JSON.stringify(row.env)}`);
      if (row && row.id !== op.id) add(`${label}: row id ${JSON.stringify(row.id)}`);
    }
  }
  for (const probe of model?.probes ?? []) {
    if (probe.status === "NOT_EXECUTED") continue;
    checkRow(`${probe.id}/${probe.env}`, probe, Object.fromEntries(Object.entries(PROBE_EXECUTORS).map(([k, v]) => [k, { ...v, ops: [probe.id] }])), probe.id);
  }
  for (const env of ENVIRONMENTS) {
    const sum = STATUSES.reduce((a, s) => a + counts[env][s], 0);
    if (ops.length === OPERATIONS.length && sum !== OPERATIONS.length) add(`${env}: ${sum} rows with a valid status, expected ${OPERATIONS.length}`);
  }
  return { ok: problems.length === 0, problems, counts };
}

/** Throws with every problem if the model does not verify (the former runIntegrityChecker contract). */
export function assertMerchantCompatResults(model, options) {
  const r = verifyMerchantCompatResults(model, options);
  if (!r.ok) {
    const err = new Error(`INTEGRITY ERROR: ${r.problems.length} problem(s):\n  - ${r.problems.join("\n  - ")}`);
    err.problems = r.problems;
    throw err;
  }
  return r;
}

/** Reports generated from the model only: counts and per-row text that the checker derived from the outputs. */
export function renderReports(model) {
  const { counts } = verifyMerchantCompatResults(model, { outDir: undefined });
  const ops = OPERATIONS.map((o) => model.operations[o.id]);
  const cell = (r) => (r.status === "NOT_EXECUTED" ? `NOT_EXECUTED (${r.reason})` : r.status);
  const esc = (t) => String(t ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const lines = [];
  lines.push(`# Merchant-demo compatibility run ${model.metadata.runId}`);
  lines.push("");
  lines.push(`Generated by \`scripts/run-merchant-compatibility-battery-v2.mjs\` from \`results.json\` of this run (schema \`${RESULTS_SCHEMA}\`). Nothing here is written by hand.`);
  lines.push(`Run: ${model.metadata.startedAt} → ${model.metadata.finishedAt} · git ${model.metadata.git?.head ?? "unknown"}${model.metadata.git?.dirty ? " (dirty tree)" : ""} · environments selected: ${model.metadata.envs.join(", ")}`);
  lines.push("");
  lines.push("A PASS means the battery executed the operation through the executor named in its row and the checks held on the stored output. The simulator column runs @hardkas/simulator (an approximate model, not consensus evidence); the simnet column runs against the rusty-kaspad node in the metadata.");
  lines.push("");
  lines.push("| Environment | PASS | FAIL | NOT_EXECUTED |");
  lines.push("| :-- | --: | --: | --: |");
  for (const env of ENVIRONMENTS) lines.push(`| ${env} | ${counts[env].PASS} | ${counts[env].FAIL} | ${counts[env].NOT_EXECUTED} |`);
  lines.push("");
  lines.push("| ID | Operation | Environment | Status | Executor | Detail (from the observed response) | Output |");
  lines.push("| :-- | :-- | :-- | :-- | :-- | :-- | :-- |");
  for (const op of ops) {
    for (const env of ENVIRONMENTS) {
      const r = op.environments[env];
      if (r.status === "NOT_EXECUTED") continue;
      lines.push(`| ${op.id} | ${esc(op.name)} | ${env} | ${r.status} | \`${r.executor}\` | ${esc(r.detail)} | \`${r.outputRef}\` |`);
    }
  }
  for (const p of model.probes ?? []) {
    if (p.status === "NOT_EXECUTED") continue;
    lines.push(`| ${p.id} (probe) | ${esc(p.name)} | ${p.env} | ${p.status} | \`${p.executor}\` | ${esc(p.detail)} | \`${p.outputRef}\` |`);
  }
  lines.push("");
  lines.push("Rows NOT_EXECUTED are listed with their reason in `matrix.csv` and `results.json`.");
  const csv = ["id,operation,category,simulator,simnet,testnet"];
  for (const op of ops) csv.push([op.id, JSON.stringify(op.name), op.category, ...ENVIRONMENTS.map((e) => cell(op.environments[e]))].join(","));
  return { summaryMd: lines.join("\n") + "\n", matrixCsv: csv.join("\n") + "\n" };
}
