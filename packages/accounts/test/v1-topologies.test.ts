import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadManagedKaspaWasmSync, systemRuntimeContext, type SilArtifactValue } from "@hardkas/core";
import { createV1TxPlanArtifact, expectedScriptPublicKeyHex } from "@hardkas/artifacts";
import { v1StorageMass, type V1PlanBody } from "@hardkas/tx-builder";
import {
  buildV1Transaction,
  checkSignedV1AgainstPlan,
  preflightV1Send,
  v1ContractFactsAtState,
  v1ContractFactsFromArtifact,
  type V1ContractFacts,
  type V1NodeUtxo
} from "../src/index.js";

const expectedScriptHex = (address: string) => expectedScriptPublicKeyHex(address)!;

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// F1 phase 2 · the covenant topologies silverc 1.0.0 compiles, offline, with real silverc artifacts (fixtures/v1-engine/
// phase2, from the upstream covenant fixtures and kcc20.sil): auth 1:N fanout, cov N:M with leader and delegate (and N:1
// as M = 1), a singleton that declares termination, and KCC-20's signed N:M verification (State[] arguments, signature
// slots resolved through a helper and the spent UTXO's own state). Each built by the v1 engine and checked again by the
// send-time F1.4; each negative with its code. Inputs past their genesis hold their state encoded in the template
// (silverscript-abi). What the policy computes (amount conservation, minter rules…) only the node decides.
// -----------------------------------------------------------------------------

const P2 = path.join(__dirname, "fixtures", "v1-engine", "phase2");
const json = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const ctx = { ...systemRuntimeContext, clock: { ...systemRuntimeContext.clock, now: () => Date.parse("2026-10-26T00:00:00.000Z") } } as any;
const FIXTURE = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const int = (v: number | bigint): SilArtifactValue => ({ kind: "int", value: BigInt(v) });
const b32 = (n: number): SilArtifactValue => ({ kind: "bytes", value: new Array(32).fill(n) });
const sha = (s: string | Buffer) => crypto.createHash("sha256").update(s).digest("hex");
const settle = <T>(p: Promise<T>) => p.then((value) => ({ value, error: undefined as any }), (error) => ({ value: undefined as T | undefined, error }));

let k: any;
const facts: Record<string, V1ContractFacts> = {};
const RECORD: Record<string, { contentHash: string; artifactSha256: string }> = {};

function load(name: string, contract: string, ctor: SilArtifactValue[]) {
  const bytes = fs.readFileSync(path.join(P2, `${name}.artifact.json`));
  RECORD[name] = { contentHash: sha(`record:${name}`), artifactSha256: sha(bytes) };
  facts[name] = v1ContractFactsFromArtifact({ compileRecordHash: RECORD[name]!.contentHash, artifactSha256: RECORD[name]!.artifactSha256, artifact: JSON.parse(bytes.toString("utf8")), contractName: contract, constructorArgs: ctor, ast: json(path.join(P2, `${name}.ast.json`)) });
}

const CTOR: Record<string, any[]> = {
  fanout: [{ kind: "int", value: "3" }, { kind: "int", value: "10" }],
  matrix: [{ kind: "int", value: "2" }, { kind: "int", value: "2" }, { kind: "int", value: "100" }, { kind: "bytes", value: new Array(32).fill(7) }],
  terminable: [{ kind: "int", value: "100" }, { kind: "bytes", value: new Array(32).fill(7) }],
  kcc20: [{ kind: "bytes", value: new Array(32).fill(9) }, { kind: "int", value: "1000" }, { kind: "byte", value: 0 }, { kind: "bool", value: false }, { kind: "int", value: "2" }, { kind: "int", value: "2" }],
  implicitto: [{ kind: "int", value: "100" }, { kind: "bytes", value: new Array(32).fill(7) }]
};
const CONTRACT: Record<string, string> = { fanout: "Decls", matrix: "Matrix", terminable: "Matrix", kcc20: "KCC20", implicitto: "Matrix" };

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
  load("fanout", "Decls", [int(3), int(10)]);
  load("matrix", "Matrix", [int(2), int(2), int(100), b32(7)]);
  load("terminable", "Matrix", [int(100), b32(7)]);
  load("kcc20", "KCC20", [b32(9), int(1000), { kind: "byte", value: 0 }, { kind: "bool", value: false }, int(2), int(2)]);
  load("implicitto", "Matrix", [int(100), b32(7)]);
});

/** A plan State value as silverscript-abi values (for v1ContractFactsAtState). */
const sil = (state: Record<string, any>): Record<string, SilArtifactValue> =>
  Object.fromEntries(
    Object.entries(state).map(([f, v]: [string, any]) => [f, v.kind === "int" ? int(BigInt(v.value)) : v.kind === "bytes" ? { kind: "bytes", value: v.value } : v])
  );
/** The P2SH of a contract at a state (or its record's own): "<ver><script>" and its simnet address. */
function lockOf(name: string, state?: Record<string, any>) {
  const f = state ? v1ContractFactsAtState(facts[name]!, sil(state)) : facts[name]!;
  const spk = f.lock.version.toString(16).padStart(4, "0") + f.lock.script;
  return { spk, address: String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(f.lock.version, f.lock.script), "simnet")) };
}
const ref = (name: string, entry: string, policy: string, args: any[], state?: Record<string, any>) => ({
  compileRecord: RECORD[name]!,
  contract: CONTRACT[name]!,
  constructorArgs: CTOR[name]!,
  ...(state ? { state } : {}),
  entry,
  policy,
  args
});
const arr = (states: Record<string, any>[]) => ({ kind: "array", value: states.map((s) => ({ kind: "object", value: s })) });

interface In {
  txid: string;
  amount: bigint;
  name: string;
  covenantId: string;
  entry: string;
  policy: string;
  args: any[];
  state?: Record<string, any>;
}
interface Out {
  amount: bigint;
  address?: string;
  /** the contract and state of a continuation (its address is that P2SH) */
  name?: string;
  state?: Record<string, any>;
  covenant?: { authorizingInput: number; covenantId: string };
  role?: "change" | "payment";
}

/** A sealed v1 plan of covenant inputs and outputs; storage mass and fee from its own amounts and scripts. */
function plan(ins: In[], outs: Out[], nextState: any[], maxFee = 1_000_000_000n) {
  const inputs = ins.map((i) => {
    const l = lockOf(i.name, i.state);
    return {
      outpoint: { transactionId: i.txid, index: 0 },
      amountSompi: String(i.amount),
      address: l.address,
      scriptPublicKey: l.spk,
      covenantId: i.covenantId,
      kind: "covenant" as const,
      computeBudget: 300,
      contract: ref(i.name, i.entry, i.policy, i.args, i.state) as any
    };
  });
  const outputs = outs.map((o) => ({
    address: o.address ?? lockOf(o.name!, o.state).address,
    amountSompi: String(o.amount),
    ...(o.covenant ? { covenant: o.covenant } : {}),
    ...(o.role ? { role: o.role } : {})
  }));
  const fee = ins.reduce((s, i) => s + i.amount, 0n) - outs.reduce((s, o) => s + o.amount, 0n);
  const storage = v1StorageMass(
    inputs.map((i) => ({ amountSompi: BigInt(i.amountSompi), scriptBytes: i.scriptPublicKey.length / 2 - 2, covenantId: true })),
    outputs.map((o) => ({ amountSompi: BigInt(o.amountSompi), scriptBytes: expectedScriptHex(o.address).length / 2, covenantId: Boolean((o as any).covenant) }))
  )!;
  const body: V1PlanBody = {
    txVersion: 1,
    inputs,
    outputs,
    covenantOutpoints: inputs.map((i) => `${i.outpoint.transactionId}:0`),
    nextState,
    estimatedFeeSompi: String(fee),
    estimatedMass: "0",
    storageMass: String(storage),
    maxFeeSompi: String(maxFee)
  } as any;
  return createV1TxPlanArtifact({ networkId: "simnet" as any, mode: "localnet" as any, from: { input: "fixture", address: FIXTURE }, to: { input: "to", address: outputs[0]!.address }, amountSompi: BigInt(outputs[0]!.amountSompi), body, ctx });
}

const nodeFor = (p: any) =>
  new Map<string, V1NodeUtxo>(p.inputs.map((i: any) => [`${i.outpoint.transactionId}:${i.outpoint.index}`, { amountSompi: BigInt(i.amountSompi), scriptPublicKey: i.scriptPublicKey, covenantId: i.covenantId }]));
const engineFacts = {
  contract: async (r: any) => facts[Object.keys(RECORD).find((n) => RECORD[n]!.contentHash === r.compileRecord.contentHash) ?? ""] as V1ContractFacts,
  successor: async (): Promise<never> => {
    throw new Error("no recompiled successor in phase 2 plans");
  }
};

const KEYS: Record<string, string> = { alice: "11".repeat(32), bob: "22".repeat(32), carol: "33".repeat(32) };
const xonly = (key: string) => String(new k.PrivateKey(key).toPublicKey().toXOnlyPublicKey().toString()).toLowerCase();
const keys = () => {
  const resolved: string[] = [];
  return { resolved, publicKeyOf: (a: string) => (KEYS[a] ? xonly(KEYS[a]!) : undefined), privateKeyOf: async (a: string) => (resolved.push(a), KEYS[a] ?? "") };
};

async function build(p: any) {
  return buildV1Transaction({ plan: p, node: { networkId: "simnet", utxosByAddresses: async () => nodeFor(p) }, facts: engineFacts, keys: keys() });
}
/** F1.4 alone (no signing), to read a refusal's code. */
async function validate(p: any): Promise<string> {
  const r = await settle(build(p));
  return r.error ? (r.error.code ?? `UNCODED: ${r.error.message}`) : "VALID";
}
/** The engine's output passes the send-time checks: the signed transaction is the plan's, and F1.4 again with its scripts. */
async function sendChecks(p: any, r: any) {
  const check = checkSignedV1AgainstPlan(r.signed.signedTransaction.payload, p, r.txId);
  expect(check.ok, (check as any).reason).toBe(true);
  const node = { networkId: "simnet", utxosByAddresses: async () => nodeFor(p), pendingSpentOutpoints: async () => new Set<string>() };
  await preflightV1Send({ plan: p, signatureScripts: (check as any).signatureScripts, node, facts: engineFacts });
}

const X = "1a".repeat(32);
const Y = "2b".repeat(32);
const TX = (n: number) => n.toString(16).padStart(2, "0").repeat(32);

describe("1:N · auth fanout (Decls, to = max_outs = 3)", () => {
  const v = (n: number) => ({ value: { kind: "int", value: String(n) } });
  const fan = (states: number[], over: { args?: any; outs?: Out[]; next?: any[] } = {}) =>
    plan(
      [{ txid: TX(1), amount: 1_000_000_000n, name: "fanout", covenantId: X, entry: "__covenant_entrypoint_auth_fanout", policy: "fanout", args: [over.args ?? arr(states.map(v))], state: v(10) }],
      over.outs ?? states.map((s) => ({ amount: 990_000_000n / BigInt(states.length), name: "fanout", state: v(s), covenant: { authorizingInput: 0, covenantId: X } })),
      over.next ?? [{ covenantId: X, input: 0, outputs: states.map((_, i) => i), states: states.map(v) }]
    );

  it("TOP-1 one input, three continuations with their states: built, each output the template with its state, bound to the input", async () => {
    const p = fan([3, 3, 4]);
    const r = await build(p);
    expect(r.txId).toMatch(/^[0-9a-f]{64}$/);
    expect(r.rpcTransaction.outputs.map((o: any) => o.covenant)).toEqual([0, 1, 2].map(() => ({ authorizingInput: 0, covenantId: X })));
    expect(r.validation.warnings).toEqual([]);
    await sendChecks(p, r);
  });

  it("TOP-2 negatives: four continuations (max 3), states argument other than declared, an output not holding its state, outputs out of order", async () => {
    expect(await validate(fan([1, 1, 1, 1]))).toBe("COVENANT_LINEAGE_INVALID");
    expect(await validate(fan([3, 7], { args: arr([v(7), v(3)]) }))).toBe("COVENANT_UNLOCK_MISMATCH");
    expect(await validate(fan([3, 7], { outs: [3, 8].map((s) => ({ amount: 495_000_000n, name: "fanout", state: v(s), covenant: { authorizingInput: 0, covenantId: X } })) }))).toBe("COVENANT_SUCCESSOR_SCRIPT_MISMATCH");
    expect(await validate(fan([3, 7], { next: [{ covenantId: X, input: 0, outputs: [1, 0], states: [v(3), v(7)] }] }))).toBe("V1_PLAN_INVALID");
  });

  it("TOP-3 zero continuations: only when the plan declares them (states []), with a warning that the policy decides", async () => {
    const end = fan([], { args: arr([]), outs: [{ amount: 990_000_000n, address: FIXTURE, role: "payment" }], next: [{ covenantId: X, input: 0, outputs: [], states: [] }] });
    const r = await build(end);
    expect(r.validation.warnings.join(" ")).toMatch(/policy 'fanout' decides/);
    expect(await validate(fan([], { args: arr([]), outs: [{ amount: 990_000_000n, address: FIXTURE, role: "payment" }], next: [] }))).toBe("V1_PLAN_INVALID");
  });
});

describe("N:M · cov leader and delegate (Matrix, max_ins = max_outs = 2)", () => {
  const st = (amount: number, owner: number) => ({ amount: { kind: "int", value: String(amount) }, owner: { kind: "bytes", value: new Array(32).fill(owner) } });
  const leaderIn = (over: Partial<In> = {}): In => ({ txid: TX(2), amount: 1_000_000_000n, name: "matrix", covenantId: Y, entry: "__leader_step", policy: "step", args: [{ kind: "int", value: "0" }], ...over });
  const delegateIn = (over: Partial<In> = {}): In => ({ txid: TX(3), amount: 500_000_000n, name: "matrix", covenantId: Y, entry: "__delegate", policy: "step", args: [], state: st(50, 8), ...over });
  const cont = (amount: bigint, s: any, by = 0): Out => ({ amount, name: "matrix", state: s, covenant: { authorizingInput: by, covenantId: Y } });
  const next = (outputs: number[], states: any[]) => [{ covenantId: Y, input: 0, outputs, states }];

  it("TOP-4 2:2: the leader first (leader entry), the delegate after it (delegate entry), two continuations: built; the delegate's UTXO holds its own state", async () => {
    const p = plan([leaderIn(), delegateIn()], [cont(990_000_000n, st(100, 7)), cont(490_000_000n, st(50, 8))], next([0, 1], [st(100, 7), st(50, 8)]));
    const r = await build(p);
    expect(r.signatureScripts).toHaveLength(2);
    expect(r.rpcTransaction.outputs.map((o: any) => o.covenant.covenantId)).toEqual([Y, Y]);
    await sendChecks(p, r);
  });

  it("TOP-5 N:1 is N:M with M = 1: two inputs, one continuation (the policy decides whether it accepts that)", async () => {
    const p = plan([leaderIn(), delegateIn()], [cont(1_480_000_000n, st(150, 7))], next([0], [st(150, 7)]));
    const r = await build(p);
    expect(r.rpcTransaction.outputs).toHaveLength(1);
    await sendChecks(p, r);
  });

  it("TOP-6 negatives: leader out of place, a delegate calling the leader entry, three inputs, three continuations, a continuation authorized outside the family, another template, a state the UTXO does not hold", async () => {
    // the delegate first: its entry at the leader's place
    expect(await validate(plan([delegateIn(), leaderIn()], [cont(990_000_000n, st(100, 7)), cont(490_000_000n, st(50, 8))], [{ covenantId: Y, input: 0, outputs: [0, 1], states: [st(100, 7), st(50, 8)] }]))).toBe("COVENANT_LEADER_POSITION_INVALID");
    expect(await validate(plan([leaderIn(), delegateIn({ entry: "__leader_step", args: [{ kind: "int", value: "0" }] })], [cont(990_000_000n, st(100, 7)), cont(490_000_000n, st(50, 8))], next([0, 1], [st(100, 7), st(50, 8)])))).toBe("COVENANT_LEADER_POSITION_INVALID");
    expect(await validate(plan([leaderIn(), delegateIn(), delegateIn({ txid: TX(4), state: st(10, 9) })], [cont(990_000_000n, st(100, 7)), cont(490_000_000n, st(50, 8))], next([0, 1], [st(100, 7), st(50, 8)])))).toBe("COVENANT_LINEAGE_INVALID");
    expect(await validate(plan([leaderIn(), delegateIn()], [cont(490_000_000n, st(1, 7)), cont(490_000_000n, st(2, 7)), cont(490_000_000n, st(3, 7))], next([0, 1, 2], [st(1, 7), st(2, 7), st(3, 7)])))).toBe("COVENANT_LINEAGE_INVALID");
    // a third, non-family input authorizing a continuation
    expect(
      await validate(
        plan(
          [leaderIn(), delegateIn(), { txid: TX(5), amount: 1_000_000_000n, name: "fanout", covenantId: X, entry: "__covenant_entrypoint_auth_fanout", policy: "fanout", args: [arr([{ value: { kind: "int", value: "1" } }])], state: { value: { kind: "int", value: "10" } } }],
          [cont(990_000_000n, st(100, 7)), cont(490_000_000n, st(50, 8), 2), { amount: 990_000_000n, name: "fanout", state: { value: { kind: "int", value: "1" } }, covenant: { authorizingInput: 2, covenantId: X } }],
          [...next([0, 1], [st(100, 7), st(50, 8)]), { covenantId: X, input: 2, outputs: [2], states: [{ value: { kind: "int", value: "1" } }] }]
        )
      )
    ).toBe("COVENANT_LINEAGE_INVALID");
    // the same covenant id through another contract's template
    expect(await validate(plan([leaderIn(), { txid: TX(6), amount: 500_000_000n, name: "terminable", covenantId: Y, entry: "__covenant_entrypoint_auth_step", policy: "step", args: [arr([])] }], [cont(990_000_000n, st(100, 7)), cont(490_000_000n, st(50, 8))], next([0, 1], [st(100, 7), st(50, 8)])))).toBe("COVENANT_FAMILY_TEMPLATE_MISMATCH");
    // the plan says the delegate's UTXO holds amount 51, the node lists the template holding 50
    const p = plan([leaderIn(), delegateIn({ state: st(51, 8) })], [cont(990_000_000n, st(100, 7)), cont(490_000_000n, st(50, 8))], next([0, 1], [st(100, 7), st(50, 8)]));
    const lied = nodeFor(p);
    lied.set(`${TX(3)}:0`, { ...lied.get(`${TX(3)}:0`)!, scriptPublicKey: lockOf("matrix", st(50, 8)).spk });
    const r = await settle(buildV1Transaction({ plan: p, node: { networkId: "simnet", utxosByAddresses: async () => lied }, facts: engineFacts, keys: keys() }));
    expect(r.error?.code).toBe("INPUT_DIFFERS_FROM_NODE");
  });
});

describe("termination · a singleton that declares termination = allowed (Matrix, transition)", () => {
  const st = (amount: number) => ({ amount: { kind: "int", value: String(amount) }, owner: { kind: "bytes", value: new Array(32).fill(7) } });
  const T = "3c".repeat(32);
  const term = (outs: Out[], states: any[], args = arr(states)) =>
    plan([{ txid: TX(7), amount: 1_000_000_000n, name: "terminable", covenantId: T, entry: "__covenant_entrypoint_auth_step", policy: "step", args: [args] }], outs, [{ covenantId: T, input: 0, outputs: outs.map((o, i) => (o.covenant ? i : -1)).filter((i) => i >= 0), states }]);

  it("TOP-7 zero continuations (states []): the covenant ends, its value to a declared payment; one continuation: continues", async () => {
    const end = term([{ amount: 990_000_000n, address: FIXTURE, role: "payment" }], []);
    const r = await build(end);
    expect(r.rpcTransaction.outputs[0].covenant).toBeUndefined();
    await sendChecks(end, r);
    const on = term([{ amount: 990_000_000n, name: "terminable", state: st(99), covenant: { authorizingInput: 0, covenantId: T } }], [st(99)]);
    await sendChecks(on, await build(on));
  });

  it("TOP-8 negatives: two continuations of a singleton; zero continuations not declared in the plan", async () => {
    expect(await validate(term([1, 2].map((n) => ({ amount: 490_000_000n, name: "terminable", state: st(n), covenant: { authorizingInput: 0, covenantId: T } })), [st(1), st(2)]))).toBe("COVENANT_LINEAGE_INVALID");
    const p: any = term([{ amount: 990_000_000n, address: FIXTURE, role: "payment" }], []);
    expect(await validate(plan([{ txid: TX(7), amount: 1_000_000_000n, name: "terminable", covenantId: T, entry: "__covenant_entrypoint_auth_step", policy: "step", args: [arr([])] }], [{ amount: 990_000_000n, address: FIXTURE, role: "payment" }], []))).toBe("V1_PLAN_INVALID");
    void p;
  });
});

describe("implicit `to` · #[covenant(binding = auth, from = 1, mode = transition)] returning one State (upstream fixture)", () => {
  const st = (amount: number) => ({ amount: { kind: "int", value: String(amount) }, owner: { kind: "bytes", value: new Array(32).fill(7) } });
  const I = "4d".repeat(32);
  const step = (states: number[]) =>
    plan(
      [{ txid: TX(12), amount: 1_000_000_000n, name: "implicitto", covenantId: I, entry: "__covenant_entrypoint_auth_step", policy: "step", args: [{ kind: "int", value: "10" }] }],
      states.map((s) => ({ amount: 990_000_000n / BigInt(states.length), name: "implicitto", state: st(s), covenant: { authorizingInput: 0, covenantId: I } })),
      [{ covenantId: I, input: 0, outputs: states.map((_, i) => i), states: states.map(st) }]
    );

  it("TOP-12 the declaration is read as silverc lowers it (to = 1: require(auth_out_count == 1)); one continuation is built and passes the send checks; two are refused", async () => {
    expect(facts.implicitto!.declarations).toEqual([{ policy: "step", form: "covenant", binding: "auth", from: 1, to: 1, mode: "transition" }]);
    const one = step([90]);
    await sendChecks(one, await build(one));
    expect(await validate(step([45, 45]))).toBe("COVENANT_LINEAGE_INVALID");
  });
});

describe("KCC-20 · signed cov N:M verification (newStates, sig s, byte witness; delegate body)", () => {
  const st = (owner: string, amount: number) => ({
    ownerIdentifier: { kind: "bytes", value: Array.from(Buffer.from(xonly(KEYS[owner]!), "hex")) },
    identifierType: { kind: "byte", value: 0 },
    amount: { kind: "int", value: String(amount) },
    isMinter: { kind: "bool", value: false }
  });
  const Z = "4d".repeat(32);
  const transfer = (leaderSigner = "alice", delegateSigner = "bob", newStatesArg?: any) => {
    const outs = [st("carol", 700), st("alice", 300)];
    return plan(
      [
        { txid: TX(8), amount: 1_000_000_000n, name: "kcc20", covenantId: Z, entry: "__leader_transfer", policy: "transfer", args: [newStatesArg ?? arr(outs), { kind: "signer", signer: leaderSigner }, { kind: "byte", value: 0 }], state: st("alice", 600) },
        { txid: TX(9), amount: 1_000_000_000n, name: "kcc20", covenantId: Z, entry: "__delegate", policy: "transfer", args: [{ kind: "signer", signer: delegateSigner }, { kind: "byte", value: 0 }], state: st("bob", 400) }
      ],
      outs.map((s) => ({ amount: 990_000_000n, name: "kcc20", state: s, covenant: { authorizingInput: 0, covenantId: Z } })),
      [{ covenantId: Z, input: 0, outputs: [0, 1], states: outs }]
    );
  };

  it("TOP-9 the leader's slot is signed by the owner its UTXO's state names (alice), the delegate's by its own (bob), found through the helper checkInputSig and pubkey(ownerIdentifier)", async () => {
    const p = transfer();
    const ks = keys();
    const r = await buildV1Transaction({ plan: p, node: { networkId: "simnet", utxosByAddresses: async () => nodeFor(p) }, facts: engineFacts, keys: ks });
    expect(ks.resolved.sort()).toEqual(["alice", "bob"]);
    expect(r.validation.inputs.map((i) => i.contract?.slots.map((s) => s.signer))).toEqual([["alice"], ["bob"]]);
    expect(r.validation.inputs[1]!.contract!.slots[0]!.publicKey).toBe(xonly(KEYS.bob!));
    await sendChecks(p, r);
  });

  it("TOP-11 a genesis whose output starts in its own state (alice, 1000): built with the covenant id kaspa-wasm computes; an output not holding the declared state is refused", async () => {
    const FUND = { transactionId: TX(10), index: 0 };
    const FIXTURE_KEY = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
    const FIXTURE_SPK = `000020${xonly(FIXTURE_KEY)}ac`;
    const gen = (outState: any, declared: any) => {
      const out = { address: lockOf("kcc20", outState).address, amountSompi: "1000000000" };
      const change = { address: FIXTURE, amountSompi: "2980000000", role: "change" as const };
      const storage = v1StorageMass([{ amountSompi: 4_000_000_000n, scriptBytes: 34, covenantId: false }], [{ amountSompi: 1_000_000_000n, scriptBytes: 35, covenantId: true }, { amountSompi: 2_980_000_000n, scriptBytes: 34, covenantId: false }])!;
      const body: any = {
        txVersion: 1,
        inputs: [{ outpoint: FUND, amountSompi: "4000000000", address: FIXTURE, scriptPublicKey: FIXTURE_SPK, kind: "p2pk", computeBudget: 10, signer: "fixture" }],
        outputs: [out, change],
        genesisCovenantGroups: [{ authorizingInput: 0, outputs: [0], contract: { compileRecord: RECORD.kcc20, contract: "KCC20", constructorArgs: CTOR.kcc20 }, states: [declared] }],
        estimatedFeeSompi: "20000000", estimatedMass: "0", storageMass: String(storage), maxFeeSompi: "100000000"
      };
      return createV1TxPlanArtifact({ networkId: "simnet" as any, mode: "localnet" as any, from: { input: "fixture", address: FIXTURE }, to: { input: "to", address: out.address }, amountSompi: 1_000_000_000n, body, ctx });
    };
    const fundNode = () => ({ networkId: "simnet", utxosByAddresses: async () => new Map([[`${TX(10)}:0`, { amountSompi: 4_000_000_000n, scriptPublicKey: FIXTURE_SPK }]]) });
    const fixtureKeys = { publicKeyOf: (a: string) => (a === "fixture" ? xonly(FIXTURE_KEY) : undefined), privateKeyOf: async () => FIXTURE_KEY };
    const ok = await buildV1Transaction({ plan: gen(st("alice", 1000), st("alice", 1000)), node: fundNode(), facts: engineFacts, keys: fixtureKeys });
    expect(ok.rpcTransaction.outputs[0].covenant.authorizingInput).toBe(0);
    expect(ok.rpcTransaction.outputs[0].covenant.covenantId).toMatch(/^[0-9a-f]{64}$/);
    const bad = await settle(buildV1Transaction({ plan: gen(st("bob", 1000), st("alice", 1000)), node: fundNode(), facts: engineFacts, keys: fixtureKeys }));
    expect(bad.error?.code).toBe("COVENANT_GENESIS_SCRIPT_MISMATCH");
  });

  it("TOP-10 negatives: a slot signer whose key is not the UTXO's owner (SIGNER_SLOT_KEY_MISMATCH, before any key is read); newStates other than the declared next states", async () => {
    const ks = keys();
    const p = transfer("alice", "alice");
    const r = await settle(buildV1Transaction({ plan: p, node: { networkId: "simnet", utxosByAddresses: async () => nodeFor(p) }, facts: engineFacts, keys: ks }));
    expect(r.error?.code).toBe("SIGNER_SLOT_KEY_MISMATCH");
    expect(ks.resolved).toEqual([]);
    expect(await validate(transfer("alice", "bob", arr([st("carol", 701), st("alice", 299)])))).toBe("COVENANT_UNLOCK_MISMATCH");
  });
});
