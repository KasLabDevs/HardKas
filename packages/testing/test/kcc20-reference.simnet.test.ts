import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import "../src/setup.js";
import {
  createCovenantTestbed,
  createFundedCovenant,
  fundTestAccount,
  getHardkasFixtureKey,
  mineBlocks,
  startIsolatedSimnet,
  stopIsolatedSimnet,
  waitForUtxo,
  type CompiledCovenantContract,
  type HardkasFixtureName,
  type IsolatedSimnetSession,
  type SimnetOnChainUtxo
} from "../src/index.js";
import {
  kcc1EncodeState,
  kcc1Hash,
  kcc1P2shCommitment,
  kcc1PushMinimal,
  kcc20BorrowWitness,
  kcc20CheckTransfer,
  kcc20DecodeState,
  kcc20DelegatorSignatureScript,
  kcc20DelegatorWitness,
  kcc20HashChain,
  kcc20SilverStateLayout,
  kcc20State,
  kcc20TransferSignatureScript,
  kcc20TransferWitness,
  kccBytes,
  kccHex,
  loadManagedKaspaWasmSync,
  silverP2shAddress,
  silverP2shLock,
  silverSigFromInputSignature,
  type Kcc20OwnerAuth,
  type Kcc20State,
  type SilArtifactValue
} from "@hardkas/core";
import { parseWasmTxToRpc } from "@hardkas/accounts";
import { classifyNodeRejection, type NodeRejectionCode } from "@hardkas/artifacts";
import { calculateUpstreamStorageMass, v1StorageMass } from "@hardkas/tx-builder";

// -----------------------------------------------------------------------------
// KCC-20 on a real rusty-kaspad v2.1.0 simnet node (CONSENSUS_SIMNET): the reference KCC20 program
// (argent-lang/kcc20-reference @ 27f8403f, compiled by HardKAS's pinned silverc) holds real token UTXOs; every transfer
// is a signed v1 transaction the node validates by running the program. The state, witness and signature-script bytes
// come from HardKAS's KCC-1/KCC-20 encoders; the transaction assembly below is test code (HardKAS has no KCC-20
// transaction builder: its KCC-20 support is off chain). For each case the off-chain model (kcc20CheckTransfer) gives
// its own verdict, compared with the node's where the model's scope covers the rule.
// Needs HARDKAS_TEST_KCC20_REFERENCE (the reference checkout; not vendored, ISC). Without it the suite FAILS
// (KCC20_REFERENCE_MISSING) rather than passing by omission (R-09); HARDKAS_TEST_SKIP_KCC20_REFERENCE=1 skips it
// explicitly, and it is then reported as skipped.
// HARDKAS_TEST_EVIDENCE_DIR, when set, receives this run's own file, kcc20-reference-simnet.<run id>.json (every
// transaction, verdict, node reason and its class), created exclusively: a run never overwrites another run's evidence
// (R-02). The file names the run id (the simnet level's global setup), the tree the caller declares
// (HARDKAS_TEST_TREE_ID, else null) and the node (version, network, identity, or the KASPAD_BIN binary's digest).
// -----------------------------------------------------------------------------

const REF = process.env.HARDKAS_TEST_KCC20_REFERENCE ?? "";
const SKIP_REF = process.env.HARDKAS_TEST_SKIP_KCC20_REFERENCE === "1";
const SIL_SHA256 = "9c61d62a1b90ad541bbf5c48ec53faaff1826cbc6f26bd42fa429df5c295316c";
const ZERO = "00".repeat(32);
const ZERO_SUBNET = "0000000000000000000000000000000000000000";
const BUDGET = Number(process.env.HARDKAS_TEST_KCC20_COMPUTE_BUDGET ?? "300");
const P2SH_AUTH_BUDGET = 10;
const FEE = 20_000_000n;
const TOKEN_KAS = 2_000_000_000n;
const CLI = path.resolve(__dirname, "../../cli/dist/index.js");
const TWO_53 = 9007199254740992n;
const INT64_MAX = 9223372036854775807n;

const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const bigintJson = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Uint8Array ? kccHex(x) : x), 2);

interface Key {
  readonly name: string;
  readonly priv: string;
  readonly xonly: string;
  readonly address: string;
}
interface TokenUtxo {
  readonly outpoint: { transactionId: string; index: number };
  readonly kas: bigint;
  readonly covenantId: string;
  readonly blockDaaScore: bigint;
  readonly state: Kcc20State;
}
interface PlainUtxo {
  readonly outpoint: { transactionId: string; index: number };
  readonly kas: bigint;
  readonly spk: { version: number; script: string };
  readonly blockDaaScore: bigint;
  readonly isCoinbase: boolean;
}
/** How a token input authorizes: the leader's witness is path byte + auth, a delegator's is its owner auth. */
type Auth =
  | { kind: "schnorr"; key: Key }
  | { kind: "p2pkh"; key: Key }
  | { kind: "p2sh"; inputIndex: number }
  | { kind: "covenant" }
  | { kind: "borrow-threshold" }
  | { kind: "borrow-schnorr"; key: Key }
  | { kind: "borrow-chain"; revealedGuard: string; oneTime: Key };
interface Family {
  readonly leader: { utxo: TokenUtxo; auth: Auth };
  readonly delegates?: ReadonlyArray<{ utxo: TokenUtxo; auth: Auth }>;
  readonly next: readonly Kcc20State[];
  readonly outputKas?: readonly bigint[];
  /** The leader's next_states argument when it must differ from the outputs (tampering). */
  readonly nextStatesArg?: readonly Kcc20State[];
  /** Per output: the state whose program locks it, when it must differ from next (tampering). */
  readonly outputProgramState?: ReadonlyArray<Kcc20State | undefined>;
  readonly covenantIdOverride?: string;
}
interface TransferCase {
  readonly label: string;
  readonly families: readonly Family[];
  readonly p2shAuthInputs?: ReadonlyArray<{ utxo: PlainUtxo; redeem: Uint8Array; key: Key }>;
  readonly modelInScope?: boolean;
}
interface Outcome {
  readonly label: string;
  readonly txId: string;
  readonly accepted: boolean;
  readonly rejectReason?: string;
  readonly successors: TokenUtxo[][];
  readonly inputsSpent: boolean;
  readonly daaAfter: bigint;
  readonly model: { accepted: boolean; rule?: string; path?: string; reason: string }[];
  readonly storageMass: bigint;
}

let session: IsolatedSimnetSession;
let compiled: CompiledCovenantContract;
let templateHex = "";
let layout: ReturnType<typeof kcc20SilverStateLayout>;
const keys: Record<string, Key> = {};
const evidence: Record<string, unknown>[] = [];
const signerOf = new Map<string, string>();

const bytes = (hex: string): SilArtifactValue => ({ kind: "bytes", value: [...kccBytes(hex, "bytes")] });
const runtimeState = (s: Kcc20State): Record<string, SilArtifactValue> => ({
  gen__kcc20_template: bytes(templateHex),
  amount: { kind: "int", value: s.amount },
  owner: bytes(s.owner),
  owner_scheme: { kind: "byte", value: s.ownerScheme },
  borrow_scheme: { kind: "byte", value: s.borrowScheme },
  borrow_guard: bytes(s.borrowGuard),
  extension_commitment: bytes(s.extensionCommitment)
});
const st = (amount: bigint, owner: string, ownerScheme = 0, borrowScheme = 0, borrowGuard = ZERO, extensionCommitment = ZERO): Kcc20State =>
  kcc20State({ amount, owner, ownerScheme, borrowScheme, borrowGuard, extensionCommitment });

function programOf(s: Kcc20State): Uint8Array {
  const bc = Uint8Array.from(compiled.artifact.contracts.KCC20!.compiled.bytecode);
  const full = { gen__kcc20_template: templateHex, amount: s.amount, owner: s.owner, owner_scheme: s.ownerScheme, borrow_scheme: s.borrowScheme, borrow_guard: s.borrowGuard, extension_commitment: s.extensionCommitment };
  return Uint8Array.from([...bc.slice(0, layout.stateStart), ...kcc1EncodeState(layout.fields, full, layout.records), ...bc.slice(layout.stateStart + layout.stateLen)]);
}
const lockOf = (s: Kcc20State) => silverP2shLock(kccHex(programOf(s)));
const addressOf = (s: Kcc20State) => silverP2shAddress(kccHex(programOf(s)), "simnet");

function keyOf(name: string, priv: string): Key {
  const k = loadManagedKaspaWasmSync();
  const p = new k.PrivateKey(priv);
  return { name, priv, xonly: String(p.toPublicKey().toXOnlyPublicKey().toString()).toLowerCase(), address: String(p.toPublicKey().toAddress("simnet").toString()) };
}

/** A token genesis through HardKAS's testbed (createFundedCovenant: HardKAS's own Silver state encoder). */
async function genesis(state: Kcc20State): Promise<TokenUtxo> {
  const g = await createFundedCovenant(session, { contract: compiled, funderFixture: "alice", valueSompi: TOKEN_KAS, initialState: runtimeState(state) });
  // the program the node indexes is the one the KCC-1 encoder writes, byte for byte
  const lock = lockOf(state);
  expect(g.scriptPublicKey).toBe(`${lock.version.toString(16).padStart(4, "0")}${lock.script}`);
  return { outpoint: g.outpoint, kas: g.amountSompi, covenantId: g.covenantId!, blockDaaScore: g.blockDaaScore, state };
}

/** A plain P2SH output (redeem script `<x-only key> OP_CHECKSIG`) paid by alice, to authorize a p2sh/v1 owner. */
async function fundP2sh(redeem: Uint8Array, kas: bigint): Promise<PlainUtxo> {
  const k = loadManagedKaspaWasmSync();
  const funding = await fundTestAccount(session, "alice", kas + 10_000_000n);
  const lock = silverP2shLock(kccHex(redeem));
  const change = funding.amountSompi - kas - 1_000_000n;
  const make = (sigScript = "") => {
    const tx = new k.Transaction({
      version: 0,
      inputs: [{ previousOutpoint: funding.outpoint, signatureScript: sigScript, sequence: 0n, sigOpCount: 1, utxo: { outpoint: funding.outpoint, amount: funding.amountSompi, scriptPublicKey: new k.ScriptPublicKey(funding.scriptPublicKey.version, funding.scriptPublicKey.script), blockDaaScore: funding.blockDaaScore, isCoinbase: funding.isCoinbase } }],
      outputs: [
        { value: kas, scriptPublicKey: new k.ScriptPublicKey(lock.version, lock.script) },
        { value: change, scriptPublicKey: k.payToAddressScript(new k.Address(keys.alice!.address)) }
      ],
      lockTime: 0n,
      subnetworkId: ZERO_SUBNET,
      gas: 0n,
      payload: ""
    });
    tx.storageMass = calculateUpstreamStorageMass([funding.amountSompi], [kas, change], "simnet");
    tx.finalize();
    return tx;
  };
  const sig = String(k.createInputSignature(make(), 0, new k.PrivateKey(keys.alice!.priv), k.SighashType.All));
  const signed = make(sig);
  const txId = String(signed.id).toLowerCase();
  const res = await session.rpc.submitTransaction(parseWasmTxToRpc(signed.serializeToObject()), { allowOrphan: false, expectedTxId: txId });
  expect(res.accepted, (res as any).error).toBe(true);
  await mineBlocks(session, 1);
  const u: SimnetOnChainUtxo = await waitForUtxo(session, silverP2shAddress(kccHex(redeem), "simnet"), { transactionId: txId, index: 0 });
  evidence.push({ label: "P2SH authority output", txId, accepted: true, p2shScript: lock.script });
  return { outpoint: u.outpoint, kas: u.amountSompi, spk: u.scriptPublicKey, blockDaaScore: u.blockDaaScore, isCoinbase: u.isCoinbase };
}

/** Builds, signs, submits (and on acceptance mines and observes) one KCC-20 transfer transaction. */
async function transfer(c: TransferCase): Promise<Outcome> {
  const k = loadManagedKaspaWasmSync();
  type In = { outpoint: any; amount: bigint; spk: { version: number; script: string }; covenantId?: string; blockDaaScore: bigint; isCoinbase: boolean; budget: number };
  const inputs: In[] = [];
  const leaderIndex: number[] = [];
  for (const f of c.families) {
    leaderIndex.push(inputs.length);
    for (const t of [f.leader, ...(f.delegates ?? [])]) {
      const lock = lockOf(t.utxo.state);
      inputs.push({ outpoint: t.utxo.outpoint, amount: t.utxo.kas, spk: { version: lock.version, script: lock.script }, covenantId: t.utxo.covenantId, blockDaaScore: t.utxo.blockDaaScore, isCoinbase: false, budget: BUDGET });
    }
  }
  for (const a of c.p2shAuthInputs ?? []) inputs.push({ outpoint: a.utxo.outpoint, amount: a.utxo.kas, spk: a.utxo.spk, blockDaaScore: a.utxo.blockDaaScore, isCoinbase: a.utxo.isCoinbase, budget: P2SH_AUTH_BUDGET });
  const totalIn = inputs.reduce((s, i) => s + i.amount, 0n);
  const nOut = c.families.reduce((s, f) => s + f.next.length, 0);
  const outputs: { value: bigint; spk: { version: number; script: string }; auth: number; cid: string; state: Kcc20State }[] = [];
  c.families.forEach((f, fi) => {
    f.next.forEach((s, i) => {
      const value = f.outputKas?.[i] ?? (totalIn - FEE) / BigInt(nOut);
      const lock = lockOf(f.outputProgramState?.[i] ?? s);
      outputs.push({ value, spk: { version: lock.version, script: lock.script }, auth: leaderIndex[fi]!, cid: f.covenantIdOverride ?? f.leader.utxo.covenantId, state: s });
    });
  });
  const make = (scripts?: readonly string[]) => {
    const tx = new k.Transaction({
      version: 1,
      inputs: inputs.map((inp, i) => ({
        previousOutpoint: inp.outpoint,
        signatureScript: scripts?.[i] ?? "",
        sequence: 0n,
        sigOpCount: 0,
        computeBudget: inp.budget,
        utxo: {
          outpoint: inp.outpoint,
          amount: inp.amount,
          scriptPublicKey: new k.ScriptPublicKey(inp.spk.version, inp.spk.script),
          blockDaaScore: inp.blockDaaScore,
          isCoinbase: inp.isCoinbase,
          ...(inp.covenantId ? { covenantId: inp.covenantId, covenant_id: inp.covenantId } : {})
        }
      })),
      outputs: outputs.map((o) => ({ value: o.value, scriptPublicKey: new k.ScriptPublicKey(o.spk.version, o.spk.script), covenant: { authorizingInput: o.auth, covenantId: o.cid } })),
      lockTime: 0n,
      subnetworkId: ZERO_SUBNET,
      gas: 0n,
      payload: ""
    });
    // L1-04: the node's storage mass (covenant cells have utxo_plurality 2), as a block would require it
    tx.storageMass = v1StorageMass(
      inputs.map((i) => ({ amountSompi: i.amount, scriptBytes: i.spk.script.length / 2, covenantId: Boolean(i.covenantId) })),
      outputs.map((o) => ({ amountSompi: o.value, scriptBytes: o.spk.script.length / 2, covenantId: true }))
    )!;
    tx.finalize();
    return tx;
  };
  const unsigned = make();
  const sign = (index: number, key: Key): string => {
    const sig = kccHex(silverSigFromInputSignature(String(k.createInputSignature(unsigned, index, new k.PrivateKey(key.priv), k.SighashType.All))));
    signerOf.set(sig, key.xonly);
    return sig;
  };
  const ownerAuth = (a: Auth, index: number): Kcc20OwnerAuth => {
    switch (a.kind) {
      case "schnorr":
        return { scheme: 0x00, signature: sign(index, a.key) };
      case "p2pkh":
        return { scheme: 0x01, publicKey: a.key.xonly, signature: sign(index, a.key) };
      case "p2sh":
        return { scheme: 0x03, inputIndex: a.inputIndex };
      case "covenant":
        return { scheme: 0x04 };
      default:
        throw new Error(`${a.kind} is not an owner authorization`);
    }
  };
  const leaderWitness = (a: Auth, index: number): Uint8Array => {
    if (a.kind === "borrow-threshold") return kcc20BorrowWitness({ scheme: 0x01 });
    if (a.kind === "borrow-schnorr") return kcc20BorrowWitness({ scheme: 0x02, signature: sign(index, a.key) });
    if (a.kind === "borrow-chain") return kcc20BorrowWitness({ scheme: 0x03, revealedGuard: a.revealedGuard, oneTimePublicKey: a.oneTime.xonly, signature: sign(index, a.oneTime) });
    return kcc20TransferWitness(ownerAuth(a, index));
  };
  const scripts: string[] = [];
  const witnesses: Uint8Array[][] = [];
  c.families.forEach((f, fi) => {
    const li = leaderIndex[fi]!;
    const lw = leaderWitness(f.leader.auth, li);
    const fam = [lw];
    scripts[li] = kccHex(kcc20TransferSignatureScript(f.nextStatesArg ?? f.next, lw, programOf(f.leader.utxo.state)));
    (f.delegates ?? []).forEach((d, di) => {
      const w = kcc20DelegatorWitness(ownerAuth(d.auth, li + 1 + di));
      fam.push(w);
      scripts[li + 1 + di] = kccHex(kcc20DelegatorSignatureScript(w, programOf(d.utxo.state)));
    });
    witnesses.push(fam);
  });
  const firstAuth = inputs.length - (c.p2shAuthInputs?.length ?? 0);
  (c.p2shAuthInputs ?? []).forEach((a, ai) => {
    const idx = firstAuth + ai;
    scripts[idx] = kccHex(Uint8Array.from([...kcc1PushMinimal(kccBytes(sign(idx, a.key), "sig")), ...kcc1PushMinimal(a.redeem)]));
  });
  const signed = make(scripts);
  const txId = String(signed.id).toLowerCase();
  const rpcTx = parseWasmTxToRpc(signed.serializeToObject());

  // the model's verdict per family (its scope: KCC-20 rules over states, witnesses and KAS values; not programs or bindings)
  const txInputs = { scriptPublicKeys: inputs.map((i) => ({ version: i.spk.version, script: i.spk.script })), covenantIds: inputs.map((i) => i.covenantId ?? null) };
  let outCursor = 0;
  const model = c.families.map((f, fi) => {
    const fam = [f.leader, ...(f.delegates ?? [])];
    const outs = f.next.map((s, i) => ({ state: s, kasValueSompi: outputs[outCursor + i]!.value }));
    outCursor += f.next.length;
    const v = kcc20CheckTransfer({
      inputs: fam.map((t, ti) => ({ state: t.utxo.state, kasValueSompi: t.utxo.kas, witness: kccHex(witnesses[fi]![ti]!) })),
      nextStates: f.nextStatesArg ?? f.next,
      outputs: outs,
      transactionInputs: txInputs,
      signatureValid: (chk) => signerOf.get(chk.signature.toLowerCase()) === chk.publicKey.toLowerCase()
    });
    return { accepted: v.accepted, ...(v.rule ? { rule: v.rule } : {}), ...(v.path ? { path: v.path } : {}), reason: v.reason };
  });

  let accepted = false;
  let rejectReason: string | undefined;
  try {
    const res = await session.rpc.submitTransaction(rpcTx, { allowOrphan: false, expectedTxId: txId });
    accepted = res.accepted === true;
    if (!accepted) rejectReason = (res as any).error ?? "rejected";
  } catch (e: any) {
    rejectReason = e?.message ?? String(e);
  }
  const successors: TokenUtxo[][] = c.families.map(() => []);
  if (accepted) {
    await mineBlocks(session, 1);
    let oi = 0;
    for (let fi = 0; fi < c.families.length; fi++) {
      for (const s of c.families[fi]!.next) {
        const u = await waitForUtxo(session, addressOf(s), { transactionId: txId, index: oi }, 20_000);
        expect(u.covenantId, `${c.label}: output ${oi} covenant id`).toBe(outputs[oi]!.cid);
        successors[fi]!.push({ outpoint: u.outpoint, kas: u.amountSompi, covenantId: u.covenantId!, blockDaaScore: u.blockDaaScore, state: s });
        oi++;
      }
    }
  }
  let inputsSpent = true;
  for (const f of c.families) {
    for (const t of [f.leader, ...(f.delegates ?? [])]) {
      const listed = (await session.rpc.getUtxosByAddress(addressOf(t.utxo.state))).some(
        (u: any) => String(u.outpoint.transactionId).toLowerCase() === t.utxo.outpoint.transactionId && Number(u.outpoint.index) === t.utxo.outpoint.index
      );
      if (listed) inputsSpent = false;
    }
  }
  const info = (await session.rpc.getBlockDagInfo()) as any;
  const outcome: Outcome = { label: c.label, txId, accepted, ...(rejectReason !== undefined ? { rejectReason } : {}), successors, inputsSpent, daaAfter: BigInt(info.virtualDaaScore ?? 0), model, storageMass: BigInt(signed.storageMass) };
  evidence.push({
    label: c.label,
    txId,
    accepted,
    rejectReason,
    nodeRejectionClass: rejectReason !== undefined ? classifyNodeRejection(rejectReason).code : undefined,
    inputsSpent,
    virtualDaaScoreAfter: outcome.daaAfter,
    model,
    computeBudgets: inputs.map((i) => i.budget),
    storageMass: outcome.storageMass,
    inputs: inputs.map((i) => ({ outpoint: `${i.outpoint.transactionId}:${i.outpoint.index}`, amountSompi: i.amount, covenantId: i.covenantId ?? null, script: i.spk.script.slice(0, 80) })),
    outputs: outputs.map((o, i) => ({ index: i, valueSompi: o.value, authorizingInput: o.auth, covenantId: o.cid, state: o.state })),
    successors: successors.flat().map((u) => `${u.outpoint.transactionId}:${u.outpoint.index}`)
  });
  return outcome;
}

const expectAccepted = (o: Outcome) => {
  expect(o.rejectReason, o.label).toBeUndefined();
  expect(o.accepted, o.label).toBe(true);
  expect(o.inputsSpent, `${o.label}: inputs spent on the node`).toBe(true);
};
// R-04 · a node rejection counts only with the reason the case expects, in the class product code gives it
// (@hardkas/artifacts classifyNodeRejection) and in the engine's own words: the program ran to its end and returned false
// (txscript EvalFalse), or the covenant binding rule. A rejection for a fee, a mass or a compute budget never stands for
// the rule under test. The rule itself (conservation, signer, scheme…) is still attributed by construction: the same
// assembly is accepted in the positive controls, and four cases (N6, N7, N8, N11) reuse the rejected txid, which does not
// cover signature scripts, for the accepted one.
interface NodeReason {
  readonly code: NodeRejectionCode;
  readonly text: RegExp;
}
const SCRIPT_RAN_FALSE: NodeReason = { code: "SCRIPT_POLICY_REJECTED", text: /failed to verify the signature script: script ran, but verification failed/ };
const COVENANT_BINDING: NodeReason = { code: "COVENANT_RULE_REJECTED", text: /covenants error: input #\d+ and outputs with covenant id [0-9a-f]{64} do not correspond to the expected genesis hashing/ };
const NOT_THE_RULE = /\bfees?\b|\bmass\b|script units exceeded|compute budget/i;
const expectRejected = (o: Outcome, modelRule?: string, node: NodeReason = SCRIPT_RAN_FALSE) => {
  expect(o.accepted, `${o.label}: ${o.rejectReason}`).toBe(false);
  expect(o.rejectReason, o.label).toBeTruthy();
  expect(classifyNodeRejection(o.rejectReason!).code, `${o.label}: ${o.rejectReason}`).toBe(node.code);
  expect(o.rejectReason, o.label).toMatch(node.text);
  expect(o.rejectReason, `${o.label}: a fee, mass or budget rejection is not the rule under test`).not.toMatch(NOT_THE_RULE);
  expect(o.inputsSpent, `${o.label}: the inputs stay unspent`).toBe(false);
  if (modelRule) expect([o.model[0]!.accepted, o.model[0]!.rule], `${o.label}: the model`).toEqual([false, modelRule]);
};

/** `hardkas kcc20 <args>` with --json; returns the exit code and the parsed output (exact integers stay digit strings). */
function cli(args: string[]): { status: number | null; json: any; raw: string } {
  const r = spawnSync(process.execPath, [CLI, "kcc20", ...args, "--json"], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  const raw = r.stdout.trim();
  let json: any = undefined;
  try {
    json = JSON.parse(raw.replace(/:\s*(-?\d{16,})/g, ': "$1"'));
  } catch {
    json = undefined;
  }
  return { status: r.status, json, raw };
}

describe.skipIf(SKIP_REF)("KCC-20 · the reference program on a real rusty-kaspad simnet node (CONSENSUS_SIMNET)", () => {
  const startedAt = new Date().toISOString();
  beforeAll(async () => {
    if (REF === "") {
      throw new Error(
        "KCC20_REFERENCE_MISSING: set HARDKAS_TEST_KCC20_REFERENCE to a checkout of argent-lang/kcc20-reference @ 27f8403f " +
          "(or HARDKAS_TEST_SKIP_KCC20_REFERENCE=1 to skip this suite explicitly)"
      );
    }
    const sil = fs.readFileSync(path.join(REF, "fixtures", "public-mint", "sil", "KCC20.sil"));
    // a checkout made with core.autocrlf=true converts the reference's line endings: it fails here, by name
    const crlf = sil.includes("\r\n") ? " (its line endings were converted to CRLF: check the reference out with core.autocrlf=false)" : "";
    expect(sha256(sil), `KCC20.sil is the pinned reference file${crlf}`).toBe(SIL_SHA256);
    for (const n of ["alice", "bob", "carol", "dave", "erin"] as HardkasFixtureName[]) keys[n] = keyOf(n, getHardkasFixtureKey(n));
    keys.onetime1 = keyOf("onetime1", sha256("hardkas-kcc20-simnet-one-time-1"));
    keys.onetime2 = keyOf("onetime2", sha256("hardkas-kcc20-simnet-one-time-2"));
    session = await startIsolatedSimnet({ minerFixture: "alice" });
    expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
    const zeroCtor: SilArtifactValue[] = [bytes(ZERO), { kind: "int", value: 0n }, bytes(ZERO), { kind: "byte", value: 0 }, { kind: "byte", value: 0 }, bytes(ZERO), bytes(ZERO)];
    compiled = await createCovenantTestbed().compileContract({ source: sil.toString("utf8"), sourceFile: "KCC20.sil", contractName: "KCC20", constructorArgs: zeroCtor });
    templateHex = kccHex(Uint8Array.from(compiled.artifact.contracts.KCC20!.compiled.template_hash));
    layout = kcc20SilverStateLayout(compiled.artifact, "KCC20");
    const info = (await session.rpc.getServerInfo()) as any;
    const bin = process.env.KASPAD_BIN;
    evidence.push({
      label: "session",
      containerName: session.containerName,
      rpcUrl: session.rpcUrl,
      serverVersion: info.serverVersion,
      networkId: info.networkId,
      // which node: the identity the harness proved for a container it started, or the digest of the binary it ran
      nodeIdentity: session.handle.identity ?? null,
      kaspadBinary: bin ? { file: path.basename(bin), sha256: sha256(fs.readFileSync(bin)) } : null,
      templateHash: templateHex,
      computeBudget: BUDGET,
      programBytes: programOf(st(0n, ZERO)).length
    });
  }, 300_000);

  afterAll(async () => {
    if (session) await stopIsolatedSimnet(session);
    const runId = process.env.HARDKAS_TEST_RUN_ID ?? `pid-${process.pid}`;
    const body = bigintJson({
      suite: "kcc20-reference.simnet",
      runId,
      treeId: process.env.HARDKAS_TEST_TREE_ID ?? null,
      testFileSha256: sha256(fs.readFileSync(__filename)),
      referenceSilSha256: SIL_SHA256,
      startedAt,
      finishedAt: new Date().toISOString(),
      records: evidence
    });
    const dir = process.env.HARDKAS_TEST_EVIDENCE_DIR;
    // one file per run, created exclusively (flag wx): never overwritten, never merged with another run's records
    if (dir && evidence.length > 0) fs.writeFileSync(path.join(dir, `kcc20-reference-simnet.${runId.replace(/[^A-Za-z0-9._-]/g, "_")}.json`), body, { flag: "wx" });
    console.log("[KCC20_SIMNET_EVIDENCE]", body.length > 4000 ? `${evidence.length} records (run ${runId})` : body);
  }, 60_000);

  // token family T: alice mints 10000 at genesis
  let t0: TokenUtxo;
  let bob6000: TokenUtxo, alice4000: TokenUtxo;
  it("N1 genesis: a KCC-20 token UTXO (alice, 10000) created with HardKAS's testbed; the node indexes the KCC-1 encoder's program and its covenant id", async () => {
    t0 = await genesis(st(10_000n, keys.alice!.xonly));
    expect(t0.covenantId).toMatch(/^[0-9a-f]{64}$/);
    evidence.push({ label: "N1 genesis", outpoint: `${t0.outpoint.transactionId}:${t0.outpoint.index}`, covenantId: t0.covenantId, state: t0.state });
  }, 240_000);

  it("N2 an owner-signed transfer 10000 -> bob 6000 + alice 4000: accepted, confirmed, successors bound to the covenant id; the model agrees", async () => {
    const o = await transfer({ label: "N2 transfer 10000 -> 6000 + 4000", families: [{ leader: { utxo: t0, auth: { kind: "schnorr", key: keys.alice! } }, next: [st(6_000n, keys.bob!.xonly), st(4_000n, keys.alice!.xonly)] }] });
    expectAccepted(o);
    expect(o.model[0]!.accepted, o.model[0]!.reason).toBe(true);
    bob6000 = o.successors[0]![0]!;
    alice4000 = o.successors[0]![1]!;
    expect(bob6000!.covenantId).toBe(t0.covenantId);
  }, 120_000);

  it("N3 invalid transitions on alice's 4000 are rejected by the node and leave the UTXO unspent (conservation, signer, owner scheme, negative amount, extension, output bound)", async () => {
    const a = alice4000;
    const base = { leader: { utxo: a, auth: { kind: "schnorr" as const, key: keys.alice! } } };
    expectRejected(await transfer({ label: "N3a conservation 4000 -> 3000 + 2000", families: [{ ...base, next: [st(3_000n, keys.bob!.xonly), st(2_000n, keys.alice!.xonly)] }] }), "conservation");
    expectRejected(await transfer({ label: "N3b signed by bob, not the owner", families: [{ leader: { utxo: a, auth: { kind: "schnorr", key: keys.bob! } }, next: [st(4_000n, keys.bob!.xonly)] }] }), "owner");
    expectRejected(await transfer({ label: "N3c successor owner scheme 0x7f", families: [{ ...base, next: [st(4_000n, keys.bob!.xonly, 0x7f)] }] }), "owner_scheme");
    expectRejected(await transfer({ label: "N3d negative successor amount -1000 + 5000", families: [{ ...base, next: [st(-1_000n, keys.bob!.xonly), st(5_000n, keys.alice!.xonly)] }] }), "amount");
    expectRejected(await transfer({ label: "N3e successor extension commitment changed", families: [{ ...base, next: [st(4_000n, keys.bob!.xonly, 0, 0, ZERO, "ee".repeat(32))] }] }), "extension_commitment");
    expectRejected(await transfer({ label: "N3f four token outputs (MAX_TOKEN_OUTPUTS = 3)", families: [{ ...base, next: [1n, 2n, 3n, 4n].map((x) => st(x * 400n, keys.alice!.xonly)) }] }));
  }, 240_000);

  it("N4 consensus-level tampering the model does not cover: an output locked to another state than next_states, a tampered covenant id; both rejected by the node", async () => {
    const a = alice4000;
    const leader = { utxo: a, auth: { kind: "schnorr" as const, key: keys.alice! } };
    const progMismatch = await transfer({ label: "N4a output program of state 4001, next_states says 4000", families: [{ leader, next: [st(4_000n, keys.bob!.xonly)], outputProgramState: [st(4_001n, keys.bob!.xonly)] }] });
    expectRejected(progMismatch);
    const cidTamper = await transfer({ label: "N4b successor bound to covenant id ff..ff", families: [{ leader, next: [st(4_000n, keys.bob!.xonly)], covenantIdOverride: "ff".repeat(32) }] });
    expectRejected(cidTamper, undefined, COVENANT_BINDING);
    // outside the model's scope (programs and bindings), it calls both structurally valid
    expect(progMismatch.model[0]!.accepted && cidTamper.model[0]!.accepted).toBe(true);
  }, 120_000);

  let bob1000: TokenUtxo, bob5000: TokenUtxo, carol6000: TokenUtxo;
  it("N5 chained spend: bob 6000 -> bob 1000 + bob 5000, signed by bob", async () => {
    const o = await transfer({ label: "N5 bob 6000 -> 1000 + 5000", families: [{ leader: { utxo: bob6000, auth: { kind: "schnorr", key: keys.bob! } }, next: [st(1_000n, keys.bob!.xonly), st(5_000n, keys.bob!.xonly)] }] });
    expectAccepted(o);
    bob1000 = o.successors[0]![0]!;
    bob5000 = o.successors[0]![1]!;
  }, 120_000);

  it("N6 a leader with a delegator (2:1 merge): a delegator signed by another key is rejected; signed by its owner, bob 5000 + 1000 -> carol 6000 is accepted", async () => {
    const bad = await transfer({ label: "N6a delegator signed by erin", families: [{ leader: { utxo: bob5000, auth: { kind: "schnorr", key: keys.bob! } }, delegates: [{ utxo: bob1000, auth: { kind: "schnorr", key: keys.erin! } }], next: [st(6_000n, keys.carol!.xonly)] }] });
    expectRejected(bad, "owner");
    const ok = await transfer({ label: "N6b bob 5000 + 1000 -> carol 6000", families: [{ leader: { utxo: bob5000, auth: { kind: "schnorr", key: keys.bob! } }, delegates: [{ utxo: bob1000, auth: { kind: "schnorr", key: keys.bob! } }], next: [st(6_000n, keys.carol!.xonly)] }] });
    expectAccepted(ok);
    expect(ok.model[0]!.accepted, ok.model[0]!.reason).toBe(true);
    carol6000 = ok.successors[0]![0]!;
  }, 180_000);

  let dave4000: TokenUtxo;
  it("N7 KCC-2 p2pkh-schnorr/v1 owner (0x01, Hash(pubkey)): a key whose hash is not the owner is rejected; dave's key and signature are accepted", async () => {
    const daveHash = kccHex(kcc1Hash(kccBytes(keys.dave!.xonly, "pk")));
    const toDave = await transfer({ label: "N7a alice 4000 -> p2pkh(dave) 4000", families: [{ leader: { utxo: alice4000, auth: { kind: "schnorr", key: keys.alice! } }, next: [st(4_000n, daveHash, 0x01)] }] });
    expectAccepted(toDave);
    const held = toDave.successors[0]![0]!;
    expectRejected(await transfer({ label: "N7b p2pkh owner, erin's key and signature", families: [{ leader: { utxo: held, auth: { kind: "p2pkh", key: keys.erin! } }, next: [st(4_000n, keys.dave!.xonly)] }] }), "owner");
    const ok = await transfer({ label: "N7c p2pkh owner, dave's key and signature", families: [{ leader: { utxo: held, auth: { kind: "p2pkh", key: keys.dave! } }, next: [st(4_000n, keys.dave!.xonly)] }] });
    expectAccepted(ok);
    dave4000 = ok.successors[0]![0]!;
  }, 240_000);

  let erinUtxo: TokenUtxo;
  it("N8 KCC-2 p2sh/v1 owner (0x03): the authority index pointing at a non-matching input is rejected; with the P2SH input spent in the same transaction, accepted", async () => {
    const redeem = Uint8Array.from([0x20, ...kccBytes(keys.erin!.xonly, "pk"), 0xac]);
    const owner = kccHex(kcc1P2shCommitment(redeem));
    const toP2sh = await transfer({ label: "N8a carol 6000 -> p2sh(erin script) 6000", families: [{ leader: { utxo: carol6000, auth: { kind: "schnorr", key: keys.carol! } }, next: [st(6_000n, owner, 0x03)] }] });
    expectAccepted(toP2sh);
    const held = toP2sh.successors[0]![0]!;
    const auth = await fundP2sh(redeem, 500_000_000n);
    const authInput = { utxo: auth, redeem, key: keys.erin! };
    expectRejected(await transfer({ label: "N8b p2sh owner, witness index 0 (the token input itself)", families: [{ leader: { utxo: held, auth: { kind: "p2sh", inputIndex: 0 } }, next: [st(6_000n, keys.erin!.xonly)] }], p2shAuthInputs: [authInput] }), "owner");
    const ok = await transfer({ label: "N8c p2sh owner, witness index 1 = the P2SH input", families: [{ leader: { utxo: held, auth: { kind: "p2sh", inputIndex: 1 } }, next: [st(6_000n, keys.erin!.xonly)], outputKas: [held.kas + auth.kas - FEE] }], p2shAuthInputs: [authInput] });
    expectAccepted(ok);
    expect(ok.model[0]!.accepted, ok.model[0]!.reason).toBe(true);
    erinUtxo = ok.successors[0]![0]!;
  }, 240_000);

  it("N9 KCC-2 covenant-id/v1 owner (0x04): without an input of the owning covenant it is rejected; spent together with that covenant's own transfer, accepted", async () => {
    const u = await genesis(st(777n, keys.alice!.xonly));
    const toCov = await transfer({ label: "N9a dave 4000 -> covenant(U) 4000", families: [{ leader: { utxo: dave4000, auth: { kind: "schnorr", key: keys.dave! } }, next: [st(4_000n, u.covenantId, 0x04)] }] });
    expectAccepted(toCov);
    const held = toCov.successors[0]![0]!;
    expectRejected(await transfer({ label: "N9b covenant owner, no input of covenant U", families: [{ leader: { utxo: held, auth: { kind: "covenant" } }, next: [st(4_000n, keys.dave!.xonly)] }] }), "owner");
    const ok = await transfer({
      label: "N9c covenant owner + U's own transfer (two covenant families in one transaction)",
      families: [
        { leader: { utxo: held, auth: { kind: "covenant" } }, next: [st(4_000n, keys.dave!.xonly)] },
        { leader: { utxo: u, auth: { kind: "schnorr", key: keys.alice! } }, next: [st(777n, keys.alice!.xonly)] }
      ]
    });
    expectAccepted(ok);
    expect(ok.model.every((m) => m.accepted)).toBe(true);
  }, 300_000);

  it("N10 borrowed receive, amount-threshold/v1 (0x01, threshold 500): receiving exactly 500 is rejected; 501 is accepted with no signature from the recipient", async () => {
    const GUARD_500 = `f401000000000000${"00".repeat(24)}`;
    const split = await transfer({ label: "N10a erin 6000 -> carol(borrow 0x01, 500) 1000 + erin 5000", families: [{ leader: { utxo: erinUtxo, auth: { kind: "schnorr", key: keys.erin! } }, next: [st(1_000n, keys.carol!.xonly, 0, 0x01, GUARD_500), st(5_000n, keys.erin!.xonly)] }] });
    expectAccepted(split);
    const [recipient, sender] = split.successors[0]!;
    const borrowed = (received: bigint) => ({
      leader: { utxo: recipient!, auth: { kind: "borrow-threshold" as const } },
      delegates: [{ utxo: sender!, auth: { kind: "schnorr" as const, key: keys.erin! } }],
      next: [st(1_000n + received, keys.carol!.xonly, 0, 0x01, GUARD_500), st(5_000n - received, keys.erin!.xonly)],
      outputKas: [recipient!.kas, sender!.kas - FEE]
    });
    expectRejected(await transfer({ label: "N10b borrowed receive of exactly the threshold (500)", families: [borrowed(500n)] }), "amount");
    const ok = await transfer({ label: "N10c borrowed receive of 501", families: [borrowed(501n)] });
    expectAccepted(ok);
    expect([ok.model[0]!.accepted, ok.model[0]!.path]).toEqual([true, "borrowed"]);
    erinUtxo = ok.successors[0]![1]!;
  }, 300_000);

  it("N11 borrowed receive, schnorr-signature/v1 (0x02): a guard signature by another key is rejected; by the guard key, accepted", async () => {
    const split = await transfer({ label: "N11a erin 4499 -> bob(borrow 0x02, guard dave) 100 + erin 4399", families: [{ leader: { utxo: erinUtxo, auth: { kind: "schnorr", key: keys.erin! } }, next: [st(100n, keys.bob!.xonly, 0, 0x02, keys.dave!.xonly), st(4_399n, keys.erin!.xonly)] }] });
    expectAccepted(split);
    const [recipient, sender] = split.successors[0]!;
    const borrowed = (guardKey: Key) => ({
      leader: { utxo: recipient!, auth: { kind: "borrow-schnorr" as const, key: guardKey } },
      delegates: [{ utxo: sender!, auth: { kind: "schnorr" as const, key: keys.erin! } }],
      next: [st(101n, keys.bob!.xonly, 0, 0x02, keys.dave!.xonly), st(4_398n, keys.erin!.xonly)],
      outputKas: [recipient!.kas, sender!.kas - FEE]
    });
    expectRejected(await transfer({ label: "N11b guard signature by erin", families: [borrowed(keys.erin!)] }), "borrow");
    const ok = await transfer({ label: "N11c guard signature by dave", families: [borrowed(keys.dave!)] });
    expectAccepted(ok);
    erinUtxo = ok.successors[0]![1]!;
  }, 300_000);

  it("N12 borrowed receive, hash-chain/v1 (0x03): a reveal that does not hash to the guard is rejected; the right link (x1, pk2, sig) is accepted and moves the guard to x1", async () => {
    const x0 = sha256("hardkas-kcc20-simnet-x0");
    const [x1, x2] = kcc20HashChain(x0, [keys.onetime1!.xonly, keys.onetime2!.xonly]);
    const split = await transfer({ label: "N12a erin 4398 -> alice(borrow 0x03, guard x2) 50 + erin 4348", families: [{ leader: { utxo: erinUtxo, auth: { kind: "schnorr", key: keys.erin! } }, next: [st(50n, keys.alice!.xonly, 0, 0x03, x2!), st(4_348n, keys.erin!.xonly)] }] });
    expectAccepted(split);
    const [recipient, sender] = split.successors[0]!;
    const borrowed = (revealed: string, oneTime: Key, nextGuard: string) => ({
      leader: { utxo: recipient!, auth: { kind: "borrow-chain" as const, revealedGuard: revealed, oneTime } },
      delegates: [{ utxo: sender!, auth: { kind: "schnorr" as const, key: keys.erin! } }],
      next: [st(51n, keys.alice!.xonly, 0, 0x03, nextGuard), st(4_347n, keys.erin!.xonly)],
      outputKas: [recipient!.kas, sender!.kas - FEE]
    });
    expectRejected(await transfer({ label: "N12b reveal (x0, pk1) against guard x2", families: [borrowed(x0, keys.onetime1!, x0)] }), "borrow_guard");
    const ok = await transfer({ label: "N12c reveal (x1, pk2) against guard x2", families: [borrowed(x1!, keys.onetime2!, x1!)] });
    expectAccepted(ok);
    expect(ok.successors[0]![0]!.state.borrowGuard).toBe(x1);
  }, 300_000);

  it("N13 exact integers (F1) end to end: `hardkas kcc20 encode-state` refuses 2^53+1 as a JSON number and encodes it exactly from its decimal string; on the node 2^53 + 2 is rejected, 2^53 + 1 accepted; int64 max splits exactly", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-kcc20-sim-"));
    try {
      const stateText = (amount: string) => `{"amount": ${amount}, "owner": "${keys.alice!.xonly}", "ownerScheme": 0, "borrowScheme": 0, "borrowGuard": "${ZERO}", "extensionCommitment": "${ZERO}"}`;
      const asNumber = path.join(dir, "state-number.json");
      fs.writeFileSync(asNumber, stateText("9007199254740993"));
      const refused = cli(["encode-state", asNumber]);
      expect([refused.status, refused.json?.code], refused.raw).toEqual([2, "KCC_JSON_NUMBER_UNSAFE"]);
      const file = path.join(dir, "state.json");
      fs.writeFileSync(file, stateText('"9007199254740993"'));
      const enc = cli(["encode-state", file]);
      expect(enc.status, enc.raw).toBe(0);
      const decoded = kcc20DecodeState(enc.json.encodedState);
      expect(decoded.amount).toBe(TWO_53 + 1n);
      const big = await genesis(decoded);
      const leader = { utxo: big, auth: { kind: "schnorr" as const, key: keys.alice! } };
      expectRejected(await transfer({ label: "N13a 2^53+1 -> 2^53 + 2", families: [{ leader, next: [st(TWO_53, keys.bob!.xonly), st(2n, keys.alice!.xonly)] }] }), "conservation");
      expectAccepted(await transfer({ label: "N13b 2^53+1 -> 2^53 + 1", families: [{ leader, next: [st(TWO_53, keys.bob!.xonly), st(1n, keys.alice!.xonly)] }] }));
      const max = await genesis(st(INT64_MAX, keys.alice!.xonly));
      const o = await transfer({ label: "N13c int64 max -> (max-1) + 1", families: [{ leader: { utxo: max, auth: { kind: "schnorr", key: keys.alice! } }, next: [st(INT64_MAX - 1n, keys.bob!.xonly), st(1n, keys.alice!.xonly)] }] });
      expectAccepted(o);
      expect(o.successors[0]![0]!.state.amount).toBe(INT64_MAX - 1n);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 360_000);

  it("N14 the CLI's off-chain check (`hardkas kcc20 check`) on transfers the node judged: same verdict where its scope reaches; a signature it cannot verify it lists, never accepts silently", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-kcc20-check-"));
    try {
      const sig = "44".repeat(65);
      const write = (name: string, body: unknown) => {
        const f = path.join(dir, `${name}.json`);
        fs.writeFileSync(f, bigintJson(body));
        return f;
      };
      const stJson = (s: Kcc20State) => ({ amount: s.amount, owner: s.owner, ownerScheme: s.ownerScheme, borrowScheme: s.borrowScheme, borrowGuard: s.borrowGuard, extensionCommitment: s.extensionCommitment });
      const leaderState = st(4_000n, keys.alice!.xonly);
      const one = (next: Kcc20State[]) => ({ inputs: [{ state: stJson(leaderState), kasValueSompi: TOKEN_KAS, witness: `00${sig}` }], nextStates: next.map(stJson), outputs: next.map((s) => ({ state: stJson(s), kasValueSompi: 900_000_000n })) });
      const valid = cli(["check", write("valid", one([st(6_000n - 2_000n, keys.bob!.xonly)]))]);
      expect([valid.status, valid.json?.verdict]).toEqual([0, "STRUCTURALLY_VALID"]);
      expect(valid.json.signaturesNotVerified.length).toBe(1);
      const conservation = cli(["check", write("conservation", one([st(3_000n, keys.bob!.xonly), st(2_000n, keys.alice!.xonly)]))]);
      expect([conservation.status, conservation.json?.verdict, conservation.json?.rule]).toEqual([1, "REJECTED", "conservation"]);
      const scheme = cli(["check", write("scheme", one([st(4_000n, keys.bob!.xonly, 0x7f)]))]);
      expect([scheme.status, scheme.json?.rule]).toEqual([1, "owner_scheme"]);
      evidence.push({ label: "N14 CLI kcc20 check", valid: valid.json?.verdict, conservation: conservation.json?.rule, ownerScheme: scheme.json?.rule, node: "N3a conservation and N3c owner_scheme rejected by the node; N2 accepted" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
