import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { KASPAD_REFERENCE_IMAGE, encodeSilverEntryArgs, loadManagedKaspaWasmSync, silverSigFromInputSignature, silverUnlockScript, systemRuntimeContext } from "@hardkas/core";
import { createV1TxPlanArtifact, expectedScriptPublicKeyHex } from "@hardkas/artifacts";
import { calculateUpstreamStorageMass, filterMatureUtxos, v1FeeMass, v1MinimumRelayFee, v1NonContextualMasses, v1StorageMass } from "@hardkas/tx-builder";
import { buildV1WasmTransaction, createWorkspaceV1Facts, parseWasmTxToRpc, v1ArgToSil, v1SignedArtifact } from "@hardkas/accounts";
import { fundTestAccount, getHardkasFixtureKey, mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, waitForUtxo, type IsolatedSimnetSession } from "../../testing/src/index.js";
import { Hardkas } from "../src/index.js";

vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 });

// -----------------------------------------------------------------------------
// INT9-C4 · differential vectors of HardKAS's OWN transaction construction (not the simulator's) against a real
// rusty-kaspad v2.1.0 (simnet level). `consensus-vectors.simnet` compares the simulator with the node; here every
// transaction is built by HardKAS — the SDK's payment planner and signer (`sdk.tx.plan / sign / send`, tx-builder +
// accounts) and the SDK's v1 engine (`sdk.covenants.planContractDeploy / planContractSpend / sign / send`) — and the
// node decides. Each vector records what HardKAS computed (txid, fee, mass, minimum fee, maturity) next to the node's
// answer; boundaries are probed one unit on each side.
//
//   V-01 txid and fee of a payment          V-05 coinbase maturity at the boundary (HardKAS's rule vs the node's)
//   V-02 a Schnorr signature one byte off   V-06 v1 deploy (engine) txid
//   V-03 the payment's fee at the minimum   V-07 relative time lock (sequence, this.ageDaa) and the v1 fee floor
//   V-04 a payment to an ECDSA address      V-08 a contract signature slot signed by another key
//
// Not covered, by construction: absolute time locks (CLTV) — HardKAS builds every transaction with lockTime 0 (tx-builder,
// accounts, the v1 engine), so a lockTime-dependent spend cannot be built by it at all; and spends FROM an ECDSA address
// (the accounts signer signs Schnorr P2PK only). Both are reported as NOT TESTED, never as evidence.
//
// Evidence: a JSON written to HARDKAS_TEST_CONSTRUCTION_VECTORS_EVIDENCE (or the OS temp directory).
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const cliDist = path.join(repoRoot, "packages", "cli", "dist", "index.js");
const TIMEOUT_SRC = path.join(repoRoot, "fixtures", "toccata-v2", "silver", "p2sh-transfer-with-timeout", "contract.sil");
const PW_ENV = "HK_INT9_VECTORS_PW";
const PASSWORD = `int9-vectors-${process.pid}`;
const PERIOD = 20;

let session: IsolatedSimnetSession;
let sdk: Hardkas;
let parent = "";
let ws = "";
let k: any;
let ALICE = "";
let BOB = "";
let BOB_ECDSA = "";
const KEY_OF: Record<string, string> = {};
const keys = {
  publicKeyOf: (a: string) => (KEY_OF[a] ? String(new k.PrivateKey(KEY_OF[a]).toPublicKey().toXOnlyPublicKey().toString()).toLowerCase() : undefined),
  privateKeyOf: async (a: string) => {
    if (!KEY_OF[a]) throw new Error(`no key for ${a}`);
    return KEY_OF[a]!;
  }
};
const evidence: Record<string, any> = { schema: "hardkas.int9.constructionVectorsNode.v1", startedAt: new Date().toISOString(), node: {}, vectors: [] as any[] };
const record = (v: Record<string, unknown>) => {
  evidence.vectors.push(v);
  return v;
};

const int = (n: number | bigint) => ({ kind: "int", value: String(n) });
const xonlyBytes = (name: string) => Array.from(Buffer.from(String(new k.PrivateKey(KEY_OF[name]!).toPublicKey().toXOnlyPublicKey().toString()), "hex"));
const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

async function submit(rpcTx: unknown, expectedTxId?: string): Promise<{ accepted: boolean; reason?: string; txId?: string }> {
  try {
    const res: any = await session.rpc.submitTransaction(rpcTx as any, { allowOrphan: false, ...(expectedTxId ? { expectedTxId } : {}) });
    return { accepted: res?.accepted !== false, ...(res?.error ? { reason: String(res.error) } : {}), ...(res?.transactionId ? { txId: String(res.transactionId).toLowerCase() } : {}) };
  } catch (e: any) {
    return { accepted: false, reason: String(e?.message ?? e).slice(0, 600) };
  }
}

async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; code: string; message: string }> {
  try {
    return { ok: true, value: await p };
  } catch (e: any) {
    return { ok: false, code: String(e?.code ?? "UNCODED"), message: String(e?.message ?? e).slice(0, 600) };
  }
}

async function confirm(address: string, outpoint: { transactionId: string; index: number }) {
  for (let round = 0; round < 6; round++) {
    await mineBlocks(session, 1);
    try {
      return await waitForUtxo(session, address, outpoint, 5_000);
    } catch {
      /* not yet in a block */
    }
  }
  throw new Error(`NOT_CONFIRMED: ${outpoint.transactionId}:${outpoint.index} at ${address}`);
}

const virtualDaa = async () => BigInt(((await session.rpc.getBlockDagInfo()) as any).virtualDaaScore);

/** Mines until the virtual DAA score is exactly `target` (one block = one DAA on this single-miner node). */
async function mineTo(target: bigint) {
  for (let guard = 0; guard < 5000; guard++) {
    const v = await virtualDaa();
    if (v >= target) return v;
    await mineBlocks(session, Number(target - v > 200n ? 200n : target - v));
  }
  throw new Error("mineTo: no progress");
}

/** The (storage) mass a transaction commits, or the one the node holds for it. */
const massOf = (tx: any): bigint | undefined => {
  const v = tx?.storageMass ?? tx?.storage_mass ?? tx?.mass;
  return v === undefined || v === null ? undefined : BigInt(v);
};
const heldMassOf = (entry: any) => massOf((entry?.mempoolEntry ?? entry?.entry)?.transaction);
const heldFeeOf = (entry: any) => {
  const v = (entry?.mempoolEntry ?? entry?.entry)?.fee;
  return v === undefined || v === null ? undefined : BigInt(v);
};

/** The node's own record of a mempool transaction (fee, and the transaction as it holds it), raw. */
async function mempoolEntry(txId: string): Promise<any> {
  try {
    return json(await session.rpc.call("getMempoolEntryRequest", { transactionId: txId, includeOrphanPool: false, filterTransactionPool: false }));
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}

/** A v0 rpc transaction with every output amount kept, the change output's amount moved by `delta`, re-signed by kaspa-wasm. */
function resignV0(rpcTx: any, utxos: any[], changeIndex: number, delta: bigint, key: string): any {
  const values: bigint[] = rpcTx.outputs.map((o: any, idx: number) => BigInt(o.amount ?? o.value) + (idx === changeIndex ? delta : 0n));
  const make = (sigs: string[]) => {
    const tx = new k.Transaction({
      version: 0,
      inputs: rpcTx.inputs.map((i: any, idx: number) => ({
        previousOutpoint: { transactionId: i.previousOutpoint.transactionId, index: Number(i.previousOutpoint.index) },
        signatureScript: sigs[idx] ?? "",
        sequence: BigInt(i.sequence ?? 0),
        sigOpCount: Number(i.sigOpCount ?? 1),
        utxo: utxos[idx]
      })),
      outputs: rpcTx.outputs.map((o: any, idx: number) => ({
        value: values[idx]!,
        scriptPublicKey: new k.ScriptPublicKey(Number(o.scriptPublicKey.version ?? 0), String(o.scriptPublicKey.scriptPublicKey ?? o.scriptPublicKey.script))
      })),
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    });
    tx.storageMass = calculateUpstreamStorageMass(utxos.map((u: any) => BigInt(u.amount)), values, "simnet");
    tx.finalize();
    return tx;
  };
  const unsigned = make([]);
  const sigs = rpcTx.inputs.map((_: any, idx: number) => String(k.createInputSignature(unsigned, idx, new k.PrivateKey(key), k.SighashType.All)));
  const tx = make(sigs);
  return { rpc: parseWasmTxToRpc(tx.serializeToObject()), txId: String(tx.id) };
}

/** The node's UTXO entries of a plan's inputs, as kaspa-wasm takes them. */
async function utxoEntriesOf(planInputs: any[]): Promise<any[]> {
  const out: any[] = [];
  for (const i of planInputs) {
    const u = await waitForUtxo(session, i.address ?? ALICE, { transactionId: String(i.outpoint.transactionId).toLowerCase(), index: Number(i.outpoint.index) }, 10_000);
    out.push({
      outpoint: u.outpoint,
      amount: u.amountSompi,
      scriptPublicKey: new k.ScriptPublicKey(u.scriptPublicKey.version, u.scriptPublicKey.script),
      blockDaaScore: u.blockDaaScore,
      isCoinbase: u.isCoinbase
    });
  }
  return out;
}

/** HardKAS's own storage mass of a v0 payment (tx-builder, the node's formula): its inputs' and outputs' amounts. */
function hardkasV0StorageMass(plan: any, rpcTx: any): bigint {
  return BigInt(
    calculateUpstreamStorageMass(
      (plan.inputs as any[]).map((i) => BigInt(i.amountSompi)),
      (rpcTx.outputs as any[]).map((o) => BigInt(o.amount ?? o.value)),
      "simnet"
    )
  );
}

/** HardKAS's own relay minimum for a v0 P2PK-input transaction of these output script sizes (the node's formula). */
function hardkasV0Minimum(inputs: number, outputScriptBytes: number[]): bigint {
  return v1MinimumRelayFee(
    v1FeeMass(
      v1NonContextualMasses({
        version: 0,
        inputs: Array.from({ length: inputs }, () => ({ signatureScriptBytes: 66, sigOpCount: 1 })),
        outputs: outputScriptBytes.map((b) => ({ scriptBytes: b, covenant: false })),
        payloadBytes: 0
      })
    )
  );
}

const BODY_KEYS = ["txVersion", "inputs", "outputs", "genesisCovenantGroups", "covenantOutpoints", "nextState", "estimatedFeeSompi", "estimatedMass", "storageMass", "maxFeeSompi", "payload"];
/** A valid v1 plan with one thing changed, sealed again (storage mass and fee from its own amounts). */
function reseal(valid: any, mutate: (body: any) => void): any {
  const body: any = {};
  for (const key of BODY_KEYS) if (valid[key] !== undefined) body[key] = JSON.parse(JSON.stringify(valid[key]));
  mutate(body);
  const sumIn = body.inputs.reduce((s: bigint, i: any) => s + BigInt(i.amountSompi), 0n);
  const sumOut = body.outputs.reduce((s: bigint, o: any) => s + BigInt(o.amountSompi), 0n);
  body.estimatedFeeSompi = String(sumIn - sumOut);
  body.maxFeeSompi = String(sumIn - sumOut);
  body.storageMass = String(
    v1StorageMass(
      body.inputs.map((i: any) => ({ amountSompi: BigInt(i.amountSompi), scriptBytes: String(i.scriptPublicKey).length / 2 - 2, covenantId: i.covenantId !== undefined })),
      body.outputs.map((o: any) => ({ amountSompi: BigInt(o.amountSompi), scriptBytes: expectedScriptPublicKeyHex(o.address)!.length / 2, covenantId: Boolean(o.covenant) }))
    ) ?? 0n
  );
  return createV1TxPlanArtifact({
    networkId: "simnet" as any,
    mode: valid.mode,
    from: { input: valid.from?.input ?? valid.from.address, address: valid.from.address },
    to: { input: body.outputs[0].address, address: body.outputs[0].address },
    amountSompi: BigInt(body.outputs[0].amountSompi),
    body,
    ctx: systemRuntimeContext
  });
}

/** A v1 contract plan's transaction WITHOUT F1.4 (the engine's builder and unlock encoding; any key in any slot). */
async function rawV1(plan: any) {
  const facts = createWorkspaceV1Facts({ workspaceRoot: ws });
  const unsigned = buildV1WasmTransaction(k, plan);
  const scripts: string[] = [];
  for (const [i, input] of (plan.inputs as any[]).entries()) {
    const at = await facts.contract(input.contract);
    const args = (input.contract.args as any[]).map((a, j) =>
      a?.kind === "signer"
        ? { kind: "bytes", value: silverSigFromInputSignature(String(k.createInputSignature(unsigned, i, new k.PrivateKey(KEY_OF[a.signer]!), k.SighashType.All))) }
        : v1ArgToSil(a, `input ${i}.args[${j}]`)
    );
    scripts.push(silverUnlockScript(at.bytecodeHex, encodeSilverEntryArgs({ artifact: at.artifact, contractName: at.contractName, entry: input.contract.entry, args: args as any })));
  }
  const tx = buildV1WasmTransaction(k, plan, scripts);
  const { rpcTransaction, txId } = v1SignedArtifact(plan, tx);
  return { ...(await submit(rpcTransaction, txId)), txId };
}

/** An SDK send's outcome: a v1 rejection comes back as `rejection` (F1.6), anything thrown is a refusal. */
const accepted = (sent: Awaited<ReturnType<typeof settle>>) => sent.ok && (sent.value as any)?.rejection === undefined && (sent.value as any)?.submitted !== false;

beforeAll(async () => {
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  k = loadManagedKaspaWasmSync();
  ALICE = session.minerAddress;
  KEY_OF[ALICE] = session.minerPrivateKey;
  KEY_OF.alice = session.minerPrivateKey;
  KEY_OF.bob = getHardkasFixtureKey("bob");
  const bobPub = new k.PrivateKey(KEY_OF.bob).toPublicKey();
  BOB = String(bobPub.toAddress("simnet").toString());
  BOB_ECDSA = String(bobPub.toAddressECDSA("simnet").toString());
  const info: any = await session.rpc.getServerInfo();
  evidence.node = {
    rpcUrl: session.rpcUrl,
    containerName: session.containerName,
    image: process.env.HARDKAS_KASPAD_IMAGE ?? KASPAD_REFERENCE_IMAGE,
    serverVersion: info.serverVersion,
    networkId: info.networkId,
    harnessRunId: process.env.HARDKAS_TEST_RUN_ID
  };
  await fundTestAccount(session, ALICE, 1_000_000_000n);
  await mineBlocks(session, 30);

  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-vectors-"));
  const init = spawnSync(process.execPath, [cliDist, "init", "app", "--network", "simnet", "--skip-toolchain", "--json"], { cwd: parent, encoding: "utf8", env: process.env, timeout: 180_000 });
  expect(init.status, `${init.stdout}\n${init.stderr}`).toBe(0);
  ws = path.join(parent, "app");
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: session.rpcUrl } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  // the funder as an encrypted account of the workspace (the project's fixture key, a test-only value)
  // (the import needs --address with --private-key-env: it does not derive it from the key)
  const imp = spawnSync(process.execPath, [cliDist, "accounts", "real", "import", "--name", "alice", "--address", ALICE, "--private-key-env", "HK_INT9_VECTORS_KEY", "--password-env", PW_ENV, "--json"], {
    cwd: ws,
    encoding: "utf8",
    env: { ...process.env, HK_INT9_VECTORS_KEY: session.minerPrivateKey, [PW_ENV]: PASSWORD },
    timeout: 180_000
  });
  expect(imp.status, `${imp.stdout}\n${imp.stderr}`).toBe(0);
  sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
});

afterAll(async () => {
  evidence.finishedAt = new Date().toISOString();
  const file = process.env.HARDKAS_TEST_CONSTRUCTION_VECTORS_EVIDENCE || path.join(os.tmpdir(), `construction-vectors-node-${Date.now()}.json`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(json(evidence), null, 2));
    console.log(`[construction-vectors-node] evidence written to ${file}`);
  } catch {
    /* diagnostic */
  }
  await sdk?.close?.();
  if (session) await stopIsolatedSimnet(session);
  if (parent) fs.rmSync(parent, { recursive: true, force: true });
});

describe("INT9-C4 · HardKAS's payment construction (sdk.tx: tx-builder + accounts) against a real rusty-kaspad", () => {
  async function payment(to: string, amount: string) {
    const plan: any = await sdk.tx.plan({ from: "alice", to, amount });
    const signed: any = await sdk.tx.sign(plan, { account: "alice", keystorePassword: PASSWORD });
    const rpcTx = JSON.parse(signed.signedTransaction.payload);
    return { plan, signed, rpcTx };
  }

  it("V-01..V-03 a 1 KAS payment: a signature one byte off is refused; one sompi under HardKAS's minimum is refused; the plan is accepted with HardKAS's txid and fee, and mined", async () => {
    const { plan, signed, rpcTx } = await payment(BOB, "1");
    const fee = BigInt(plan.estimatedFeeSompi);
    const minimum = hardkasV0Minimum(rpcTx.inputs.length, rpcTx.outputs.map((o: any) => String(o.scriptPublicKey.scriptPublicKey ?? o.scriptPublicKey.script).length / 2));
    const changeIndex = rpcTx.outputs.findIndex((o: any) => expectedScriptPublicKeyHex(ALICE) === String(o.scriptPublicKey.scriptPublicKey ?? o.scriptPublicKey.script));

    // V-02: the same transaction, the first input's Schnorr signature one byte off
    const tampered = JSON.parse(JSON.stringify(rpcTx));
    const s: string = tampered.inputs[0].signatureScript;
    const at = 20;
    tampered.inputs[0].signatureScript = s.slice(0, at) + (s[at] === "0" ? "1" : "0") + s.slice(at + 1);
    const bad = await submit(tampered);
    record({ id: "V-02", vector: "Schnorr signature, one byte off (HardKAS-signed payment)", hardkas: { signedTxId: signed.txId }, node: bad, agree: !bad.accepted });
    expect(bad.accepted, bad.reason).toBe(false);
    expect(bad.reason ?? "").toMatch(/signature|script/i);

    // V-03: the plan's fee against HardKAS's relay minimum, and one sompi under it (re-signed by kaspa-wasm)
    let under: any = { skipped: "the plan has no change output to move" };
    if (changeIndex >= 0 && fee === minimum) {
      const variant = resignV0(rpcTx, await utxoEntriesOf(plan.inputs), changeIndex, 1n, KEY_OF.alice!);
      under = await submit(variant.rpc);
      expect(under.accepted, under.reason).toBe(false);
      expect(under.reason ?? "").toMatch(/under the required amount|fee/i);
    }
    record({ id: "V-03", vector: "payment fee vs the node's minimum", hardkas: { planFeeSompi: fee, minimumSompi: minimum, estimatedMass: plan.estimatedMass }, node: { underMinimumByOne: under }, agree: fee >= minimum && (under.skipped !== undefined || under.accepted === false) });
    expect(fee).toBeGreaterThanOrEqual(minimum);

    // V-01: the plan as HardKAS built it
    const sent = await settle(sdk.tx.send(signed));
    expect(accepted(sent), JSON.stringify(sent)).toBe(true);
    const nodeTxId = String((sent as any).value?.txId ?? "").toLowerCase();
    const entry = await mempoolEntry(signed.txId);
    const out = await confirm(BOB, { transactionId: signed.txId, index: rpcTx.outputs.findIndex((o: any) => BigInt(o.amount ?? o.value) === 100_000_000n) });
    const committed = massOf(rpcTx);
    const computed = hardkasV0StorageMass(plan, rpcTx);
    const held = heldMassOf(entry);
    const nodeFee = heldFeeOf(entry);
    record({
      id: "V-01",
      vector: "payment txid, fee and storage mass (sdk.tx.plan → sign → send)",
      hardkas: { txId: signed.txId, feeSompi: fee, estimatedMass: plan.estimatedMass, computedStorageMass: computed, committedStorageMass: committed, inputs: plan.inputs.length, outputs: rpcTx.outputs.length },
      node: { txId: nodeTxId, feeSompi: nodeFee, heldStorageMass: held, mined: Boolean(out) },
      // INT9-C4 · DIVERGENCE (documented, owner's decision): the signed v0 transaction commits storage mass 0; the node's
      // mempool replaces it with its own value (SkipMassCheck), which is HardKAS's computed one, and mines it; the txid is
      // the same (a v0 id does not cover the field)
      divergence: committed !== undefined && held !== undefined && committed !== held ? `v0 commits ${committed}, the node holds and mines ${held}` : undefined,
      agree: nodeTxId === String(signed.txId).toLowerCase() && (nodeFee === undefined || nodeFee === fee) && (held === undefined || held === computed)
    });
    expect(nodeTxId).toBe(String(signed.txId).toLowerCase());
    if (nodeFee !== undefined) expect(nodeFee).toBe(fee);
    if (held !== undefined) expect(held).toBe(computed);
  });

  it("V-04 a payment to an ECDSA address (35-byte script): HardKAS plans, signs and pays it; the node accepts it and mines it", async () => {
    const { plan, signed, rpcTx } = await payment(BOB_ECDSA, "1");
    const scripts = rpcTx.outputs.map((o: any) => String(o.scriptPublicKey.scriptPublicKey ?? o.scriptPublicKey.script));
    expect(scripts).toContain(expectedScriptPublicKeyHex(BOB_ECDSA));
    const fee = BigInt(plan.estimatedFeeSompi);
    const minimum = hardkasV0Minimum(rpcTx.inputs.length, scripts.map((s: string) => s.length / 2));
    const sent = await settle(sdk.tx.send(signed));
    const ok = accepted(sent);
    const index = scripts.indexOf(expectedScriptPublicKeyHex(BOB_ECDSA));
    const out = ok ? await confirm(BOB_ECDSA, { transactionId: signed.txId, index }) : undefined;
    record({ id: "V-04", vector: "payment to an ECDSA address", hardkas: { txId: signed.txId, feeSompi: fee, minimumSompi: minimum }, node: { accepted: ok, ...(ok ? {} : { reason: JSON.stringify(sent) }), mined: Boolean(out) }, agree: ok && fee >= minimum });
    expect(ok, JSON.stringify(sent)).toBe(true);
    expect(fee).toBeGreaterThanOrEqual(minimum);
  });

  it("V-10 the storage-mass commitment (WrongMass): a HardKAS payment sent committing its mass + 1 is accepted, the node holds HardKAS's value and mines it", async () => {
    // The node's mempool validates with SkipMassCheck and sets the contextual mass itself (SIM-07, L1-04); only a BLOCK
    // must commit it exactly (check_mass_commitment, WrongMass). The simulator models the same (its mempool sets the mass,
    // its own blocks are checked) but accepts no external block, so the block-level rule is the one part that cannot be
    // compared: UNVERIFIED for the simulator. This vector shows the node's half with HardKAS's own transaction.
    const { plan, signed, rpcTx } = await payment(BOB, "0.5");
    const computed = hardkasV0StorageMass(plan, rpcTx);
    const committed = computed + 1n;
    const off = { ...rpcTx, ...(rpcTx.storageMass !== undefined ? { storageMass: Number(committed) } : { mass: Number(committed) }) };
    const res = await submit(off);
    const id = String(res.txId ?? signed.txId).toLowerCase();
    const entry = res.accepted ? await mempoolEntry(id) : undefined;
    const held = heldMassOf(entry);
    const index = rpcTx.outputs.findIndex((o: any) => BigInt(o.amount ?? o.value) === 50_000_000n);
    const out = res.accepted ? await confirm(BOB, { transactionId: id, index }).catch(() => undefined) : undefined;
    record({
      id: "V-10",
      vector: "storage-mass commitment off by one (WrongMass is a block rule; the mempool replaces the field)",
      hardkas: { txId: signed.txId, computedStorageMass: computed, signedCommitment: massOf(rpcTx), sentStorageMass: committed, planFeeSompi: plan.estimatedFeeSompi },
      node: { accepted: res.accepted, reason: res.reason, txId: id, heldStorageMass: held, mined: Boolean(out) },
      simulator: "UNVERIFIED: the simulator accepts no external block, so a block committing a wrong mass cannot be compared",
      agree: res.accepted && Boolean(out) && (held === undefined || held === computed)
    });
    expect(res.accepted, res.reason).toBe(true);
    // the node holds its own value — HardKAS's computed storage mass — not the one sent
    if (held !== undefined) expect(held).toBe(computed);
    expect(Boolean(out)).toBe(true);
  });
});

describe("INT9-C4 · coinbase maturity: HardKAS's rule (tx-builder filterMatureUtxos) against the node, at the boundary", () => {
  it("V-05 one DAA before maturity HardKAS says immature and the node refuses; at maturity both accept", async () => {
    const erinKey = getHardkasFixtureKey("erin");
    const erin = String(new k.PrivateKey(erinKey).toPublicKey().toAddress("simnet").toString());
    await mineBlocks(session, 1, erin);
    await mineBlocks(session, 2);
    const coinbase = (await session.rpc.getUtxosByAddress(erin)).map((u: any) => u)[0];
    expect(coinbase).toBeDefined();
    const entry = await waitForUtxo(session, erin, { transactionId: String(coinbase.outpoint.transactionId).toLowerCase(), index: Number(coinbase.outpoint.index) });
    expect(entry.isCoinbase).toBe(true);
    const probe = (v: bigint) => filterMatureUtxos({ networkId: "simnet", virtualDaaScore: v, utxos: [entry], readEntry: (u: any) => ({ blockDaaScore: BigInt(u.blockDaaScore), isCoinbase: Boolean(u.isCoinbase) }) });
    const maturity = BigInt(probe(0n).coinbaseMaturity);
    const spend = () => {
      // far above the relay minimum (≈ 162,400 sompi for this shape): the verdict is the maturity's, never the fee's
      const fee = 1_000_000n;
      const make = (sig: string) => {
        const tx = new k.Transaction({
          version: 0,
          inputs: [{ previousOutpoint: entry.outpoint, signatureScript: sig, sequence: 0n, sigOpCount: 1, utxo: { outpoint: entry.outpoint, amount: entry.amountSompi, scriptPublicKey: new k.ScriptPublicKey(entry.scriptPublicKey.version, entry.scriptPublicKey.script), blockDaaScore: entry.blockDaaScore, isCoinbase: true } }],
          outputs: [{ value: entry.amountSompi - fee, scriptPublicKey: k.payToAddressScript(new k.Address(ALICE)) }],
          lockTime: 0n,
          subnetworkId: "0000000000000000000000000000000000000000",
          gas: 0n,
          payload: ""
        });
        tx.storageMass = calculateUpstreamStorageMass([entry.amountSompi], [entry.amountSompi - fee], "simnet");
        tx.finalize();
        return tx;
      };
      const sig = String(k.createInputSignature(make(""), 0, new k.PrivateKey(erinKey), k.SighashType.All));
      return parseWasmTxToRpc(make(sig).serializeToObject());
    };
    const before = await mineTo(entry.blockDaaScore + maturity - 1n);
    const hkBefore = probe(before).mature.length === 1;
    const nodeBefore = before === entry.blockDaaScore + maturity - 1n ? await submit(spend()) : { accepted: false, reason: `virtual overshot to ${before}` };
    const after = await mineTo(entry.blockDaaScore + maturity);
    const hkAfter = probe(after).mature.length === 1;
    const nodeAfter = nodeBefore.accepted ? { accepted: true, reason: "already accepted one DAA earlier" } : await submit(spend());
    record({
      id: "V-05",
      vector: "coinbase maturity boundary",
      hardkas: { coinbaseMaturity: maturity, blockDaaScore: entry.blockDaaScore, matureAtVirtualMinus1: hkBefore, matureAtVirtual: hkAfter },
      node: { virtualBefore: before, acceptedBefore: nodeBefore.accepted, reasonBefore: nodeBefore.reason, virtualAfter: after, acceptedAfter: nodeAfter.accepted, reasonAfter: nodeAfter.reason },
      agree: hkBefore === nodeBefore.accepted && hkAfter === nodeAfter.accepted
    });
    expect(before).toBe(entry.blockDaaScore + maturity - 1n);
    expect({ hardkas: hkBefore, node: nodeBefore.accepted }).toEqual({ hardkas: false, node: false });
    expect({ hardkas: hkAfter, node: nodeAfter.accepted }).toEqual({ hardkas: true, node: true });
  });
});

describe("INT9-C4 · the v1 engine's construction (sdk.covenants) of a P2SH contract against a real rusty-kaspad", () => {
  let ref: any;
  let ctor: any[] = [];
  let deployed: any;
  const contract = () => ({ compileRecord: ref, contract: "TransferWithTimeout", constructorArgs: ctor });

  it("V-06 deploy (planContractDeploy): accepted with the engine's txid, and mined", async () => {
    // sender alice, recipient bob, a relative lock of PERIOD DAA (the corpus contract, other arguments)
    ctor = [{ kind: "bytes", value: xonlyBytes("alice") }, { kind: "bytes", value: xonlyBytes("bob") }, int(PERIOD)];
    fs.copyFileSync(TIMEOUT_SRC, path.join(ws, "timeout.sil"));
    fs.writeFileSync(path.join(ws, "timeout.args.json"), JSON.stringify([{ kind: "bytes", value: xonlyBytes("alice") }, { kind: "bytes", value: xonlyBytes("bob") }, { kind: "int", value: PERIOD }]));
    const c = spawnSync(process.execPath, [cliDist, "silver", "compile", "timeout.sil", "--args", "timeout.args.json", "--network", "simnet", "--json"], { cwd: ws, encoding: "utf8", env: process.env, timeout: 180_000 });
    expect(c.status, `${c.stdout}\n${c.stderr}`).toBe(0);
    const rec = JSON.parse(c.stdout.trim());
    ref = { contentHash: rec.contentHash, artifactSha256: rec.provenance.artifactSha256, path: path.relative(ws, rec.recordPath).replace(/\\/g, "/") };
    const plan: any = await sdk.covenants.planContractDeploy({ contract: contract() as any, amountSompi: 2_000_000_000n, funder: ALICE });
    const signed = await sdk.covenants.sign(plan, { keys });
    const sent = await settle(sdk.covenants.send(signed.signed));
    expect(accepted(sent), JSON.stringify(sent)).toBe(true);
    const entry = await mempoolEntry(signed.txId);
    const held = heldMassOf(entry);
    const index = plan.outputs.findIndex((o: any) => o.role === "payment");
    deployed = await confirm(plan.outputs[index].address, { transactionId: signed.txId, index });
    deployed.address = plan.outputs[index].address;
    deployed.scriptPublicKeyHex = deployed.scriptPublicKey.version.toString(16).padStart(4, "0") + deployed.scriptPublicKey.script;
    const nodeTxId = String((sent as any).value?.txId ?? "").toLowerCase();
    record({
      id: "V-06",
      vector: "v1 contract deploy txid, fee and committed storage mass (engine)",
      hardkas: { txId: signed.txId, feeSompi: signed.feeSompi, committedStorageMass: plan.storageMass, mass: signed.mass },
      node: { txId: nodeTxId, feeSompi: heldFeeOf(entry), heldStorageMass: held, mined: true },
      agree: nodeTxId === signed.txId.toLowerCase() && (held === undefined || held === BigInt(plan.storageMass))
    });
    expect(nodeTxId).toBe(signed.txId.toLowerCase());
    if (held !== undefined) expect(held).toBe(BigInt(plan.storageMass));
  });

  const reclaim = (sequence: bigint, signer = ALICE) =>
    sdk.covenants.planContractSpend({
      outpoint: deployed.outpoint,
      contract: { ...contract(), entry: "reclaim", args: [{ kind: "signer", signer }] } as any,
      payments: [],
      sweepTo: ALICE,
      sequence,
      computeBudget: "estimate"
    });

  it("V-08 the recipient's slot (transfer) signed with the sender's key: refused by the engine before any key, and by the node", async () => {
    const plan: any = await sdk.covenants.planContractSpend({
      outpoint: deployed.outpoint,
      contract: { ...contract(), entry: "transfer", args: [{ kind: "signer", signer: "bob" }] } as any,
      payments: [],
      sweepTo: BOB,
      computeBudget: "estimate"
    });
    const wrong = reseal(plan, (b) => (b.inputs[0].contract.args = [{ kind: "signer", signer: "alice" }]));
    const engine = await settle(sdk.covenants.check(wrong, { keys }));
    const node = await rawV1(wrong);
    record({ id: "V-08", vector: "contract signature slot signed by another key", hardkas: engine.ok ? { ok: true } : { ok: false, code: engine.code }, node, agree: !engine.ok && !node.accepted });
    expect(engine.ok ? "ACCEPTED" : engine.code).toBe("SIGNER_SLOT_KEY_MISMATCH");
    expect(node.accepted, node.reason).toBe(false);
  });

  it("V-07 relative time lock: sequence under the period (script) and the period before the UTXO's age (sequence lock) are refused by the node; at age ≥ period the engine's spend is accepted; one sompi under the engine's v1 floor is the node's verdict too", async () => {
    // age PERIOD/2 + 2: a sequence of PERIOD/2 is old enough for the lock, but the script wants PERIOD
    await mineTo(deployed.blockDaaScore + BigInt(PERIOD / 2 + 2));
    const short = await settle(reclaim(BigInt(PERIOD / 2)));
    const shortPlan: any = short.ok ? short.value : undefined;
    const shortEngine = shortPlan ? await settle(sdk.covenants.check(shortPlan, { keys })) : short;
    const shortNode = shortPlan ? await rawV1(shortPlan) : { accepted: false, reason: "not planned" };
    record({ id: "V-07a", vector: `reclaim with sequence ${PERIOD / 2} (< period ${PERIOD}), UTXO age ${PERIOD / 2 + 2}`, hardkas: shortEngine.ok ? { ok: true } : { ok: false, code: (shortEngine as any).code }, node: shortNode, expectation: "policy: engine accepts, node rejects", agree: !shortNode.accepted });
    expect(shortNode.accepted, shortNode.reason).toBe(false);

    // the period as the sequence, before the UTXO is PERIOD DAA old: the node's sequence lock
    const early = await settle(reclaim(BigInt(PERIOD)));
    const earlyPlan: any = early.ok ? early.value : undefined;
    const earlyEngine = earlyPlan ? await settle(sdk.covenants.check(earlyPlan, { keys })) : early;
    const earlyNode = earlyPlan ? await rawV1(earlyPlan) : { accepted: false, reason: "not planned" };
    record({ id: "V-07b", vector: `reclaim with sequence ${PERIOD} at UTXO age ${PERIOD / 2 + 2} (sequence lock not met)`, hardkas: earlyEngine.ok ? { ok: true } : { ok: false, code: (earlyEngine as any).code }, node: earlyNode, agree: !earlyNode.accepted });
    expect(earlyNode.accepted, earlyNode.reason).toBe(false);

    // old enough: the engine's spend, and first the same spend one sompi under the engine's floor
    await mineTo(deployed.blockDaaScore + BigInt(PERIOD) + 2n);
    const plan: any = await reclaim(BigInt(PERIOD));
    const floor = BigInt(plan.estimatedFeeSompi);
    const under = reseal(plan, (b) => (b.outputs[0].amountSompi = String(BigInt(b.outputs[0].amountSompi) + 1n)));
    const underNode = await rawV1(under);
    const signed = await sdk.covenants.sign(plan, { keys });
    const sent = await settle(sdk.covenants.send(signed.signed));
    const ok = accepted(sent);
    const entry = ok ? await mempoolEntry(signed.txId) : undefined;
    const out = ok ? await confirm(ALICE, { transactionId: signed.txId, index: 0 }) : undefined;
    record({
      id: "V-07c",
      vector: `reclaim with sequence ${PERIOD} at age ≥ ${PERIOD}; the v1 fee floor ± 1`,
      hardkas: { txId: signed.txId, floorSompi: floor, committedStorageMass: plan.storageMass, mass: signed.mass },
      node: { accepted: ok, ...(ok ? {} : { reason: JSON.stringify(sent) }), feeSompi: heldFeeOf(entry), heldStorageMass: heldMassOf(entry), mined: Boolean(out), underFloorByOne: underNode },
      agree: ok && !underNode.accepted
    });
    expect(ok, JSON.stringify(sent)).toBe(true);
    expect(String((sent as any).value?.txId ?? "").toLowerCase()).toBe(signed.txId.toLowerCase());
    // the node's minimum is the engine's floor when one sompi less is refused for its fee; recorded either way
    if (underNode.accepted) console.warn(`[V-07c] the node accepted one sompi under the engine's v1 floor (${floor}): the floor is above the node's minimum`);
    expect(underNode.accepted, underNode.reason).toBe(false);
  });
});

describe("INT9-C4 · summary", () => {
  it("every vector agrees with the node", () => {
    const off = (evidence.vectors as any[]).filter((v) => v.agree !== true);
    expect(off, JSON.stringify(json(off), null, 2)).toEqual([]);
  });
});
