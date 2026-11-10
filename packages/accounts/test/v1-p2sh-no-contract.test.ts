import { describe, it, expect, beforeAll, vi } from "vitest";
import { loadManagedKaspaWasmSync, systemRuntimeContext } from "@hardkas/core";
import { createV1TxPlanArtifact } from "@hardkas/artifacts";
import { assertV1PlanShape, v1StorageMass, type V1PlanBody } from "@hardkas/tx-builder";
import { buildV1Transaction, checkV1Plan, prepareV1Draft, validateV1Transition } from "../src/index.js";
import { KaspaWasmPrivateKeySigner } from "../src/kaspa-wasm-signer.js";
import { PrivateKeyAuthorizer, StaticSignatureScriptAuthorizer } from "../src/authorizers.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// develop relaxed assertV1PlanShape: a `p2sh` input may omit `contract` (a ZK lock's plan, buildR0Groth16Plan, whose
// unlock is the proof the ZK builder supplies). No v1 signing path may then guess an unlock: the v1 engine, its drafts
// and the send check (all through validateV1Transition) crashed with a TypeError on the missing contract; the internal
// signer (KaspaWasmPrivateKeySigner) would put a P2PK signature on a P2SH input. Each now refuses with a typed error,
// V1_P2SH_UNLOCK_UNAVAILABLE, unless the caller supplies the unlocking script itself (a signature-script authorization).
// kaspa-wasm (pinned) only; no network.
// -----------------------------------------------------------------------------

const KEY = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
const XONLY = "dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659";
const FUNDER = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const OUTPOINT = { transactionId: "d".repeat(64), index: 0 };
const ctx = { ...systemRuntimeContext, clock: { ...systemRuntimeContext.clock, now: () => Date.parse("2026-11-07T00:00:00.000Z") } } as any;

let k: any;
let lockAddr = "";
let lockSpk = "";

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
  const spk = k.payToScriptHashScript("51"); // a P2SH lock HardKAS has no contract for (OP_TRUE redeem)
  const o = typeof spk.serializeToObject === "function" ? spk.serializeToObject() : spk;
  lockSpk = Number(o.version).toString(16).padStart(4, "0") + String(o.script);
  lockAddr = k.addressFromScriptPublicKey(new k.ScriptPublicKey(Number(o.version), String(o.script)), "simnet").toString();
});

const body = (): V1PlanBody => ({
  txVersion: 1,
  inputs: [{ outpoint: OUTPOINT, amountSompi: "200000000", address: lockAddr, scriptPublicKey: lockSpk, kind: "p2sh", computeBudget: 10 }],
  outputs: [{ address: FUNDER, amountSompi: "199000000", role: "payment" }],
  estimatedFeeSompi: "1000000",
  estimatedMass: "0",
  storageMass: String(v1StorageMass([{ amountSompi: 200_000_000n, scriptBytes: 35, covenantId: false }], [{ amountSompi: 199_000_000n, scriptBytes: 34, covenantId: false }])),
  maxFeeSompi: "2000000"
});
const seal = () => createV1TxPlanArtifact({ networkId: "simnet" as any, mode: "localnet" as any, from: { input: lockAddr, address: lockAddr }, to: { input: FUNDER, address: FUNDER }, amountSompi: 199_000_000n, body: body(), ctx }) as any;
const node = () => ({ networkId: "simnet", utxosByAddresses: async () => new Map([[`${OUTPOINT.transactionId}:0`, { amountSompi: 200_000_000n, scriptPublicKey: lockSpk }]]) });
const facts = { contract: async () => { throw new Error("no contract is named"); }, successor: async () => { throw new Error("no successor"); } } as any;
const codeOf = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === "function" ? p() : p);
    return "NO_ERROR";
  } catch (e: any) {
    return e?.code ?? `UNCODED: ${String(e?.message ?? e).slice(0, 120)}`;
  }
};

describe("a p2sh input without a contract (develop's relaxation) on every v1 signing path", () => {
  it("the shape allows it (the ZK lock plan)", () => {
    expect(() => assertV1PlanShape(seal())).not.toThrow();
  });

  it("the v1 engine (buildV1Transaction, checkV1Plan) refuses it with V1_P2SH_UNLOCK_UNAVAILABLE before any key", async () => {
    const resolved: string[] = [];
    const keys = { publicKeyOf: () => XONLY, privateKeyOf: async (a: string) => (resolved.push(a), KEY) };
    expect(await codeOf(buildV1Transaction({ plan: seal(), node: node(), facts, keys }))).toBe("V1_P2SH_UNLOCK_UNAVAILABLE");
    expect(await codeOf(checkV1Plan({ plan: seal(), node: node(), facts }))).toBe("V1_P2SH_UNLOCK_UNAVAILABLE");
    expect(resolved).toEqual([]);
  });

  it("a draft (prepareV1Draft) and the validator itself refuse it the same way", async () => {
    expect(await codeOf(prepareV1Draft({ plan: seal(), node: node(), facts, publicKeyOf: () => XONLY }))).toBe("V1_P2SH_UNLOCK_UNAVAILABLE");
    const utxos = new Map([[`${OUTPOINT.transactionId}:0`, { amountSompi: 200_000_000n, scriptPublicKey: lockSpk }]]);
    expect(await codeOf(() => validateV1Transition({ plan: seal(), node: { networkId: "simnet", utxos }, facts: () => undefined, successor: () => undefined }))).toBe("V1_P2SH_UNLOCK_UNAVAILABLE");
  });

  it("the internal signer: no authorizer, or a key authorizer (a P2PK signature), is V1_P2SH_UNLOCK_UNAVAILABLE", async () => {
    const signer = new KaspaWasmPrivateKeySigner({ account: { kind: "kaspa", name: "funder", network: "simnet", address: FUNDER, privateKey: KEY } as any });
    expect(await codeOf(signer.signTxPlan({ planArtifact: seal() } as any))).toBe("V1_P2SH_UNLOCK_UNAVAILABLE");
    expect(await codeOf(signer.signTxPlan({ planArtifact: seal(), authorizers: { 0: new PrivateKeyAuthorizer("funder", KEY) } } as any))).toBe("V1_P2SH_UNLOCK_UNAVAILABLE");
  });

  it("the internal signer: an unlocking script the caller supplies is used as given", async () => {
    const signer = new KaspaWasmPrivateKeySigner({});
    const unlock = "51" + "01" + "51"; // anything the caller owns; the node judges it
    const r = await signer.signTxPlan({ planArtifact: seal(), authorizers: { 0: new StaticSignatureScriptAuthorizer(unlock) } } as any);
    const payload = JSON.parse(r.signedTransaction.payload);
    expect(String(payload.inputs[0].signatureScript)).toBe(unlock);
    expect(Number(payload.version)).toBe(1);
  });
});
