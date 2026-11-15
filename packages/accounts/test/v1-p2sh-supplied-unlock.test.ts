import { describe, it, expect, beforeAll, vi } from "vitest";
import { loadManagedKaspaWasmSync, systemRuntimeContext } from "@hardkas/core";
import { createV1TxPlanArtifact } from "@hardkas/artifacts";
import { v1StorageMass, type V1PlanBody } from "@hardkas/tx-builder";
import { checkV1Plan, preflightV1Send, validateV1Transition } from "../src/index.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// ZK-SEND-1 · the EXPERIMENTAL supplied unlock of a p2sh input without a contract (V1P2shUnlockSource), set only by the
// SDK's ZK spend. The validator does not take it on trust: the unlock must be push-only and its redeem script must hash
// to the input's P2SH script, and a send's signed script must be exactly it. Without the hook nothing changes
// (v1-p2sh-no-contract.test.ts). kaspa-wasm (pinned) only; no network.
// -----------------------------------------------------------------------------

const FUNDER = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const OUTPOINT = { transactionId: "d".repeat(64), index: 0 };
const ctx = { ...systemRuntimeContext, clock: { ...systemRuntimeContext.clock, now: () => Date.parse("2026-11-15T00:00:00.000Z") } } as any;
const REDEEM = "51"; // OP_TRUE: a P2SH lock HardKAS has no contract for
const UNLOCK = "0151"; // one push: the redeem script

let k: any;
let lockAddr = "";
let lockSpk = "";

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
  const spk = k.payToScriptHashScript(REDEEM);
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
const utxos = () => new Map([[`${OUTPOINT.transactionId}:0`, { amountSompi: 200_000_000n, scriptPublicKey: lockSpk }]]);
const supply = (unlockScript: string) => () => ({ unlockScript });
const validate = (extra: Record<string, unknown>) =>
  validateV1Transition({ plan: seal(), node: { networkId: "simnet", utxos: utxos() }, facts: () => undefined, successor: () => undefined, ...extra } as any);
const codeOf = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === "function" ? p() : p);
    return "NO_ERROR";
  } catch (e: any) {
    return e?.code ?? `UNCODED: ${String(e?.message ?? e).slice(0, 120)}`;
  }
};
const facts = (p2shUnlock?: unknown) =>
  ({ contract: async () => { throw new Error("no contract is named"); }, successor: async () => { throw new Error("no successor"); }, ...(p2shUnlock ? { p2shUnlock } : {}) }) as any;
const node = () => ({ networkId: "simnet", utxosByAddresses: async () => utxos(), pendingSpentOutpoints: async () => new Set<string>(), virtualDaaScore: async () => 5000n });

describe("ZK-SEND-1 · a supplied unlock of a p2sh input without a contract (EXPERIMENTAL, the SDK's ZK path)", () => {
  it("without the hook nothing changes: V1_P2SH_UNLOCK_UNAVAILABLE", async () => {
    expect(await codeOf(() => validate({}))).toBe("V1_P2SH_UNLOCK_UNAVAILABLE");
  });

  it("an unlock whose redeem script hashes to the input's P2SH script is validated, sized by the unlock", () => {
    const r = validate({ p2shUnlock: supply(UNLOCK) });
    expect(r.inputs).toEqual([{ index: 0, kind: "p2sh", signatureScriptBytes: 2 }]);
    expect(r.feeSompi).toBe(1_000_000n);
  });

  it("a hook vouching for a script whose redeem script does NOT hash to the input is refused (V1_P2SH_UNLOCK_MISMATCH)", async () => {
    expect(await codeOf(() => validate({ p2shUnlock: supply("0152") }))).toBe("V1_P2SH_UNLOCK_MISMATCH"); // OP_2: another redeem script
    expect(await codeOf(() => validate({ p2shUnlock: supply("01510151ac") }))).toBe("V1_P2SH_UNLOCK_MISMATCH"); // not push-only
    expect(await codeOf(() => validate({ p2shUnlock: supply("4c") }))).toBe("V1_P2SH_UNLOCK_MISMATCH"); // a truncated push
    expect(await codeOf(() => validate({ p2shUnlock: supply("") }))).toBe("V1_P2SH_UNLOCK_MISMATCH");
  });

  it("at a send the signed script must be exactly the supplied unlock (SIGNED_PLAN_MISMATCH otherwise)", async () => {
    expect(validate({ p2shUnlock: supply(UNLOCK), signatureScripts: [UNLOCK] }).inputs[0]!.kind).toBe("p2sh");
    expect(await codeOf(() => validate({ p2shUnlock: supply(UNLOCK), signatureScripts: ["0151" + "00"] }))).toBe("SIGNED_PLAN_MISMATCH");
  });

  it("a hook that refuses the input keeps its own code", async () => {
    const refusing = () => {
      throw Object.assign(new Error("ZK_SPEND_UNLOCK_UNAVAILABLE: not this lock"), { code: "ZK_SPEND_UNLOCK_UNAVAILABLE" });
    };
    expect(await codeOf(() => validate({ p2shUnlock: refusing }))).toBe("ZK_SPEND_UNLOCK_UNAVAILABLE");
  });

  it("the send check (preflightV1Send) threads facts.p2shUnlock; the engine's plan check (checkV1Plan) never does", async () => {
    const ok = await preflightV1Send({ plan: seal(), signatureScripts: [UNLOCK], node: node(), facts: facts(supply(UNLOCK)) });
    expect(ok.validation.inputs[0]).toEqual({ index: 0, kind: "p2sh", signatureScriptBytes: 2 });
    expect(await codeOf(preflightV1Send({ plan: seal(), signatureScripts: [UNLOCK], node: node(), facts: facts(supply("0152")) }))).toBe("V1_P2SH_UNLOCK_MISMATCH");
    expect(await codeOf(preflightV1Send({ plan: seal(), signatureScripts: [UNLOCK], node: node(), facts: facts() }))).toBe("V1_P2SH_UNLOCK_UNAVAILABLE");
    expect(await codeOf(checkV1Plan({ plan: seal(), node: node(), facts: facts(supply(UNLOCK)) }))).toBe("V1_P2SH_UNLOCK_UNAVAILABLE");
  });
});
