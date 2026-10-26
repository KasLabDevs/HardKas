import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadManagedKaspaWasmSync, systemRuntimeContext } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION, createV1TxPlanArtifact } from "@hardkas/artifacts";
import { v1StorageMass, type V1PlanBody } from "@hardkas/tx-builder";
import {
  buildV1Transaction,
  checkSignedV1AgainstPlan,
  combineV1Drafts,
  finalizeV1Draft,
  preflightV1Send,
  prepareV1Draft,
  signV1Draft,
  v1ContractFactsFromArtifact,
  type V1ContractFacts,
  type V1NodeUtxo,
  type V1TxDraft
} from "../src/index.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// F1.9 · a v1 transaction signed in turns: prepared once (F1.4, keys from the store, never a private key), each party
// signing its own slots, combined, finalized into the same signed artifact the engine makes with every key at hand, then
// checked as a send would check it. TwoOfTwo (silverc 1.0.0) needs alice's and bob's signatures; a P2PK input gets the
// fixture's. Negatives: a missing signature, a changed draft or plan, a key that is not the slot's, a party with no slot,
// two different signatures for one slot.
// -----------------------------------------------------------------------------

const P2 = path.join(__dirname, "fixtures", "v1-engine", "phase2");
const FIXTURE = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const FIXTURE_KEY = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
const KEYS: Record<string, string> = { alice: "11".repeat(32), bob: "22".repeat(32), carol: "33".repeat(32), fixture: FIXTURE_KEY };
const ctx = { ...systemRuntimeContext, clock: { ...systemRuntimeContext.clock, now: () => Date.parse("2026-10-26T00:00:00.000Z") } } as any;
const settle = <T>(p: Promise<T>) => p.then((value) => ({ value, error: undefined as any }), (error) => ({ value: undefined as T | undefined, error }));
const sync = (f: () => unknown) => {
  try {
    f();
    return undefined;
  } catch (e: any) {
    return e?.code ?? `UNCODED ${e?.message}`;
  }
};

let k: any;
let two: V1ContractFacts;
let twoSpk = "";
let twoAddr = "";
let fixtureSpk = "";
const xonly = (key: string) => String(new k.PrivateKey(key).toPublicKey().toXOnlyPublicKey().toString()).toLowerCase();
const RECORD = { contentHash: crypto.createHash("sha256").update("record:twooftwo").digest("hex"), artifactSha256: "" };

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
  const bytes = fs.readFileSync(path.join(P2, "twooftwo.artifact.json"));
  RECORD.artifactSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const ctor = ["alice", "bob"].map((a) => ({ kind: "bytes" as const, value: Array.from(Buffer.from(xonly(KEYS[a]!), "hex")) }));
  two = v1ContractFactsFromArtifact({ compileRecordHash: RECORD.contentHash, artifactSha256: RECORD.artifactSha256, artifact: JSON.parse(bytes.toString("utf8")), contractName: "TwoOfTwo", constructorArgs: ctor, ast: JSON.parse(fs.readFileSync(path.join(P2, "twooftwo.ast.json"), "utf8")) });
  twoSpk = two.lock.version.toString(16).padStart(4, "0") + two.lock.script;
  twoAddr = String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(two.lock.version, two.lock.script), "simnet"));
  fixtureSpk = `000020${xonly(FIXTURE_KEY)}ac`;
});

const TWO_TX = "aa".repeat(32);
const FUND_TX = "bb".repeat(32);
/** Spends the TwoOfTwo output (alice and bob sign) and, with `withP2pk`, a fixture coin too; all to the fixture. */
function plan(withP2pk = false) {
  const inputs: any[] = [
    {
      outpoint: { transactionId: TWO_TX, index: 0 },
      amountSompi: "500000000",
      address: twoAddr,
      scriptPublicKey: twoSpk,
      kind: "p2sh",
      computeBudget: 50,
      contract: { compileRecord: RECORD, contract: "TwoOfTwo", constructorArgs: two.constructorArgs.map((a: any) => ({ kind: "bytes", value: Array.from(a.value) })), entry: "spend", args: [{ kind: "signer", signer: "alice" }, { kind: "signer", signer: "bob" }] }
    }
  ];
  if (withP2pk) inputs.push({ outpoint: { transactionId: FUND_TX, index: 1 }, amountSompi: "100000000", address: FIXTURE, scriptPublicKey: fixtureSpk, kind: "p2pk", computeBudget: 10, signer: "fixture" });
  const total = withP2pk ? 600_000_000n : 500_000_000n;
  const out = total - 10_000_000n;
  const storage = v1StorageMass(
    inputs.map((i) => ({ amountSompi: BigInt(i.amountSompi), scriptBytes: i.scriptPublicKey.length / 2 - 2, covenantId: false })),
    [{ amountSompi: out, scriptBytes: 34, covenantId: false }]
  )!;
  const body: V1PlanBody = { txVersion: 1, inputs, outputs: [{ address: FIXTURE, amountSompi: String(out), role: "payment" }], estimatedFeeSompi: "10000000", estimatedMass: "0", storageMass: String(storage), maxFeeSompi: "20000000" };
  return createV1TxPlanArtifact({ networkId: "simnet" as any, mode: "localnet" as any, from: { input: "fixture", address: FIXTURE }, to: { input: "fixture", address: FIXTURE }, amountSompi: out, body, ctx });
}
const node = {
  networkId: "simnet",
  utxosByAddresses: async () =>
    new Map<string, V1NodeUtxo>([
      [`${TWO_TX}:0`, { amountSompi: 500_000_000n, scriptPublicKey: twoSpk }],
      [`${FUND_TX}:1`, { amountSompi: 100_000_000n, scriptPublicKey: fixtureSpk }]
    ])
};
const facts = { contract: async () => two, successor: async (): Promise<never> => { throw new Error("no successor"); } };
const publicKeyOf = (a: string) => (KEYS[a] ? xonly(KEYS[a]!) : undefined);
const reseal = (d: any): V1TxDraft => {
  const { contentHash: _c, ...body } = d;
  return { ...body, contentHash: calculateContentHash(body, CURRENT_HASH_VERSION) };
};

describe("F1.9 · v1 drafts signed in turns", () => {
  it("DR-1 alice and bob sign apart; combined and finalized, the result is the engine's transaction and passes the send checks", async () => {
    const p = plan(true);
    const draft = await prepareV1Draft({ plan: p, node, facts, publicKeyOf });
    expect(draft.slots.map((s) => [s.input, s.kind, s.param ?? null, s.signer])).toEqual([
      [0, "contract", "sa", "alice"],
      [0, "contract", "sb", "bob"],
      [1, "p2pk", null, "fixture"]
    ]);
    const byAlice = signV1Draft({ draft, plan: p, account: "alice", privateKey: KEYS.alice! });
    const byBob = signV1Draft({ draft, plan: p, account: "bob", privateKey: KEYS.bob! });
    const byFixture = signV1Draft({ draft, plan: p, account: "fixture", privateKey: KEYS.fixture! });
    const full = combineV1Drafts([byAlice, byBob, byFixture], p);
    expect(full.slots.every((s) => typeof s.signature === "string")).toBe(true);
    const done = await finalizeV1Draft({ draft: full, plan: p, node, facts });
    expect(done.txId).toBe(draft.txId);
    const engine = await buildV1Transaction({ plan: p, node, facts, keys: { publicKeyOf, privateKeyOf: async (a) => KEYS[a]! } });
    expect(engine.txId).toBe(done.txId);
    expect(done.signatureScripts.map((s) => s.length)).toEqual(engine.signatureScripts.map((s) => s.length));
    const check = checkSignedV1AgainstPlan(done.signed.signedTransaction.payload, p, done.txId);
    expect(check.ok).toBe(true);
    await preflightV1Send({ plan: p, signatureScripts: (check as any).signatureScripts, node: { ...node, pendingSpentOutpoints: async () => new Set<string>() }, facts });
  });

  it("DR-2 a slot without its signature: SILVER_SPEND_SIGNATURE_MISSING, naming it", async () => {
    const p = plan();
    const draft = await prepareV1Draft({ plan: p, node, facts, publicKeyOf });
    const onlyAlice = signV1Draft({ draft, plan: p, account: "alice", privateKey: KEYS.alice! });
    const r = await settle(finalizeV1Draft({ draft: onlyAlice, plan: p, node, facts }));
    expect(r.error?.code).toBe("SILVER_SPEND_SIGNATURE_MISSING");
    expect(r.error?.message).toMatch(/'sb' \(bob\)/);
  });

  it("DR-3 a changed draft or another plan: SILVER_SPEND_DRAFT_INVALID", async () => {
    const p = plan();
    const draft = await prepareV1Draft({ plan: p, node, facts, publicKeyOf });
    expect(sync(() => signV1Draft({ draft: { ...draft, txId: "c".repeat(64) }, plan: p, account: "alice", privateKey: KEYS.alice! }))).toBe("SILVER_SPEND_DRAFT_INVALID");
    expect(sync(() => signV1Draft({ draft: reseal({ ...draft, txId: "c".repeat(64) }), plan: p, account: "alice", privateKey: KEYS.alice! }))).toBe("SILVER_SPEND_DRAFT_INVALID");
    expect(sync(() => signV1Draft({ draft, plan: plan(true), account: "alice", privateKey: KEYS.alice! }))).toBe("SILVER_SPEND_DRAFT_INVALID");
    const shortSig = reseal({ ...draft, slots: draft.slots.map((s) => ({ ...s, signature: "ab".repeat(64) })) });
    expect((await settle(finalizeV1Draft({ draft: shortSig, plan: p, node, facts }))).error?.code).toBe("SILVER_SPEND_DRAFT_INVALID");
  });

  it("DR-4 a key that is not the slot's (carol signing as alice): SIGNER_SLOT_KEY_MISMATCH; a party with no slot: SILVER_SPEND_SIGNER_NOT_IN_DRAFT", async () => {
    const p = plan();
    const draft = await prepareV1Draft({ plan: p, node, facts, publicKeyOf });
    expect(sync(() => signV1Draft({ draft, plan: p, account: "alice", privateKey: KEYS.carol! }))).toBe("SIGNER_SLOT_KEY_MISMATCH");
    expect(sync(() => signV1Draft({ draft, plan: p, account: "carol", privateKey: KEYS.carol! }))).toBe("SILVER_SPEND_SIGNER_NOT_IN_DRAFT");
  });

  it("DR-5 two different signatures for one slot cannot be combined", async () => {
    const p = plan();
    const draft = await prepareV1Draft({ plan: p, node, facts, publicKeyOf });
    const a = signV1Draft({ draft, plan: p, account: "alice", privateKey: KEYS.alice! });
    const other = reseal({ ...a, slots: a.slots.map((s) => (s.signer === "alice" ? { ...s, signature: "cd".repeat(64) + "01" } : s)) });
    expect(sync(() => combineV1Drafts([a, other], p))).toBe("SILVER_SPEND_DRAFT_INVALID");
  });
});
