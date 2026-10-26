import { describe, it, expect } from "vitest";
import { systemRuntimeContext } from "@hardkas/core";
import { assertV1PlanShape, type V1PlanBody } from "@hardkas/tx-builder";
import { createV1TxPlanArtifact } from "../src/tx-plan-v1.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../src/canonical.js";
import { TxPlanSchema } from "../src/schemas.js";
import { verifyArtifactIntegritySync } from "../src/index.js";

// -----------------------------------------------------------------------------
// F1.1 · the v1 plan artifact. Positives: v1 plans of the corpus Counter genesis and transition are written and read
// back with the same content hash, and pass the TxPlan schema; a v0 plan body is untouched by the v1 fields. Negatives:
// the list of the spec, each refused with its code and reason. Offline, no kaspa-wasm.
// -----------------------------------------------------------------------------

const ctx = { ...systemRuntimeContext, clock: { ...systemRuntimeContext.clock, now: () => Date.parse("2026-10-26T00:00:00.000Z") } } as any;
const H = (c: string) => c.repeat(64).slice(0, 64);
const COMPILE = { contentHash: H("a"), artifactSha256: "e72250b3be50bb0f7f54b1a51e1ff6ba2aa6f5be6de6a91d584c519df930aef3" };
const COVENANT_ID = "c6ba323da0a2c82abe3a4a61155e4daebdec0a1b681311a0ba21029ddc3b19fd";
const FUNDER = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const FUNDER_SPK = "0000" + "20" + "dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659" + "ac";
const COUNTER_ADDR = "kaspasim:pqt8xhg7hqt0a6qa4ke6f599dtdse8g02jaca3syhncp0m2akhu8737p5jrg8";
const COUNTER_SPK = "0000aa2016735d1eb816fee81dadb3a4d0a56adb0c9d0f54bb8ec604bcf017ed5db5f87f87";
const SUCCESSOR_ADDR = "kaspasim:pzdzrdpjj4yt94nlv22z6e0txt0ay5386l0h4lxt8f0fhwfzugdvg7qze9dl5";

/** The corpus genesis as a v1 plan: one P2PK funding input (budget 10), the covenant output (group) and the change. */
const genesisBody = (): V1PlanBody => ({
  txVersion: 1,
  inputs: [{ outpoint: { transactionId: "7294c339a1b6c5a0e0e9e2a31cbeae4bbeeeca0520f100f9029b75d8d5de4d09", index: 1 }, amountSompi: "4000000000", address: FUNDER, scriptPublicKey: FUNDER_SPK, kind: "p2pk", computeBudget: 10, signer: "fixture" }],
  outputs: [{ address: COUNTER_ADDR, amountSompi: "1000000000" }, { address: FUNDER, amountSompi: "2999591700", role: "change" }],
  genesisCovenantGroups: [{ authorizingInput: 0, outputs: [0], contract: { compileRecord: COMPILE, contract: "Counter", constructorArgs: [{ kind: "int", value: "7" }] } }],
  estimatedFeeSompi: "408300",
  estimatedMass: "2083",
  storageMass: "4083",
  maxFeeSompi: "1000000"
});

/** The corpus transition: the covenant input (budget 0) and its continuation bound to the same covenant id. */
const transitionBody = (): V1PlanBody => ({
  txVersion: 1,
  inputs: [{
    outpoint: { transactionId: "3b93691ca6ea47a6601e12559b6195a8c38bb1821b596cc6cd2ad4d3e2f6b917", index: 0 },
    amountSompi: "1000000000", address: COUNTER_ADDR, scriptPublicKey: COUNTER_SPK, covenantId: COVENANT_ID, kind: "covenant", computeBudget: 0,
    contract: { compileRecord: COMPILE, contract: "Counter", constructorArgs: [{ kind: "int", value: "7" }], entry: "__covenant_entrypoint_auth_bump", policy: "bump", args: [{ kind: "int", value: "5" }] }
  }],
  outputs: [{ address: SUCCESSOR_ADDR, amountSompi: "999699900", covenant: { authorizingInput: 0, covenantId: COVENANT_ID } }],
  covenantOutpoints: ["3b93691ca6ea47a6601e12559b6195a8c38bb1821b596cc6cd2ad4d3e2f6b917:0"],
  nextState: [{ covenantId: COVENANT_ID, input: 0, outputs: [0], successor: { artifactSha256: "fb9b122142c1f6244360df72ee687820d52b4c894b1938e8ac379d8a11a206c7", constructorArgs: [{ kind: "int", value: "12" }], stateToConstructorArg: { value: 0 }, state: { value: { kind: "int", value: "12" } } } }],
  estimatedFeeSompi: "300100",
  estimatedMass: "719",
  storageMass: "1",
  maxFeeSompi: "1000000"
});

const make = (body: V1PlanBody, purpose: string) =>
  createV1TxPlanArtifact({ networkId: "simnet" as any, mode: "localnet" as any, from: { input: "fixture", address: FUNDER }, to: { input: "counter", address: body.outputs[0]!.address }, amountSompi: BigInt(body.outputs[0]!.amountSompi), body, ctx, purpose });

const code = (fn: () => unknown) => {
  try { fn(); } catch (e: any) { return { code: e.code, reason: e.reason as string | undefined }; }
  return { code: "NO_ERROR" };
};

describe("F1.1 · v1 plans are written and read back with the same hash", () => {
  for (const [name, body] of [["genesis", genesisBody], ["transition", transitionBody]] as const) {
    it(`P-${name}: sealed, schema-valid, and the JSON round trip keeps contentHash and planId`, () => {
      const plan = make(body(), `covenant ${name}`);
      expect(plan.txVersion).toBe(1);
      expect(TxPlanSchema.safeParse(plan).success).toBe(true);
      const back = JSON.parse(JSON.stringify(plan));
      expect(calculateContentHash(back, CURRENT_HASH_VERSION)).toBe(plan.contentHash);
      expect(back.planId).toBe(plan.planId);
      const verified = verifyArtifactIntegritySync(back);
      expect(verified.errors, JSON.stringify(verified.errors)).toEqual([]);
      expect(verified.ok).toBe(true);
      expect(assertV1PlanShape(back).feeSompi).toBe(BigInt(body().estimatedFeeSompi));
    });
  }

  it("P-3 the schema keeps every v1 field (nothing stripped): parse(plan) equals the plan", () => {
    const plan = make(transitionBody(), "covenant transition");
    const parsed = TxPlanSchema.parse(plan);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(JSON.parse(JSON.stringify(plan)));
  });

  it("P-4 a v0 plan shape passes the v0 check unchanged (no v1 field is added to it)", () => {
    const v0 = { txVersion: 0, inputs: [{ outpoint: { transactionId: H("1"), index: 0 }, amountSompi: "10" }], outputs: [{ address: FUNDER, amountSompi: "9" }], estimatedFeeSompi: "1" };
    expect(assertV1PlanShape(v0).feeSompi).toBe(1n);
    expect(Object.keys(v0)).toEqual(["txVersion", "inputs", "outputs", "estimatedFeeSompi"]);
  });
});

describe("F1.1 · the negative list (V1_PLAN_INVALID with its reason, or its own code)", () => {
  const t = transitionBody;
  const cases: Array<[string, () => Record<string, any>, string, RegExp?]> = [
    ["binding in a v0 plan", () => ({ ...t(), txVersion: 0 }), "V1_PLAN_INVALID", /only in a v1 plan/],
    ["budget in a v0 plan", () => ({ txVersion: 0, inputs: [{ outpoint: { transactionId: H("1"), index: 0 }, amountSompi: "10", computeBudget: 1 }], outputs: [{ address: FUNDER, amountSompi: "9" }], estimatedFeeSompi: "1" }), "V1_PLAN_INVALID", /only in a v1 plan/],
    ["plan budget and per-input budget at once", () => ({ ...t(), computeBudget: "0" }), "V1_PLAN_INVALID", /per input/],
    ["budget outside u16", () => ({ ...t(), inputs: [{ ...t().inputs[0]!, computeBudget: 70_000 }] }), "V1_PLAN_INVALID", /u16/],
    ["authorizingInput out of range", () => ({ ...t(), outputs: [{ ...t().outputs[0]!, covenant: { authorizingInput: 1, covenantId: COVENANT_ID } }] }), "V1_PLAN_INVALID", /not an input/],
    ["repeated outpoint", () => ({ ...genesisBody(), inputs: [genesisBody().inputs[0]!, genesisBody().inputs[0]!], estimatedFeeSompi: "4000408300" }), "V1_PLAN_INVALID", /spent twice/],
    ["output with a binding and in a genesis group", () => ({ ...t(), genesisCovenantGroups: [{ authorizingInput: 0, outputs: [0] }] }), "V1_PLAN_INVALID", /both a continuation/],
    ["group naming a nonexistent output", () => ({ ...genesisBody(), genesisCovenantGroups: [{ authorizingInput: 0, outputs: [5] }] }), "V1_PLAN_INVALID", /does not exist/],
    ["v1 plan without a fee limit", () => { const b: any = t(); delete b.maxFeeSompi; return b; }, "V1_FEE_LIMIT_REQUIRED"],
    ["fee above the limit", () => ({ ...t(), maxFeeSompi: "300099" }), "FEE_EXCEEDS_MAX"],
    ["a resolved signature in the arguments", () => ({ ...t(), inputs: [{ ...t().inputs[0]!, contract: { ...t().inputs[0]!.contract!, args: [{ kind: "signature", account: "alice" }] } }] }), "V1_PLAN_INVALID", /signer slot/],
    ["a private key beside a signer slot", () => ({ ...t(), inputs: [{ ...t().inputs[0]!, contract: { ...t().inputs[0]!.contract!, args: [{ kind: "signer", signer: "alice", privateKey: H("3") }] } }] }), "V1_PLAN_INVALID", /signer slot is exactly/],
    ["a private key anywhere in the plan", () => ({ ...t(), metadata: { privateKey: H("3") } }), "V1_PLAN_INVALID", /never carries a key/],
    ["a covenant UTXO declared as p2pk", () => ({ ...t(), inputs: [{ ...t().inputs[0]!, kind: "p2pk", signer: "x", contract: undefined }] }), "COVENANT_P2PK_INPUT_NOT_SUPPORTED"],
    ["a covenant UTXO declared as a p2sh contract", () => ({ ...t(), inputs: [{ ...t().inputs[0]!, kind: "p2sh" }] }), "V1_PLAN_INVALID", /declared as a covenant input/],
    ["a covenant input without its policy", () => ({ ...t(), inputs: [{ ...t().inputs[0]!, contract: { ...t().inputs[0]!.contract!, policy: undefined } }] }), "V1_PLAN_INVALID", /policy/],
    ["covenant outpoints not listed", () => { const b: any = t(); delete b.covenantOutpoints; return b; }, "V1_PLAN_INVALID", /covenantOutpoints/],
    ["fee that is not inputs − outputs", () => ({ ...t(), estimatedFeeSompi: "1" }), "V1_PLAN_INVALID", /inputs − outputs/],
    ["v1 change in the legacy change field", () => ({ ...t(), change: { address: FUNDER, amountSompi: "1" } }), "V1_PLAN_INVALID", /role "change"/],
    ["a contract reference without its constructor arguments", () => ({ ...t(), inputs: [{ ...t().inputs[0]!, contract: { ...t().inputs[0]!.contract!, constructorArgs: undefined } }] }), "V1_PLAN_INVALID", /constructor arguments/],
    ["a signer slot as a constructor argument", () => ({ ...t(), inputs: [{ ...t().inputs[0]!, contract: { ...t().inputs[0]!.contract!, constructorArgs: [{ kind: "signer", signer: "a" }] } }] }), "V1_PLAN_INVALID", /cannot be a signer slot/]
  ];
  for (const [name, body, expected, reason] of cases) {
    it(`N: ${name} → ${expected}`, () => {
      const r = code(() => assertV1PlanShape(body()));
      expect(r.code).toBe(expected);
      if (reason) expect(r.reason ?? "").toMatch(reason);
    });
  }

  it("N: createV1TxPlanArtifact refuses an invalid body before sealing anything", () => {
    const r = code(() => make({ ...transitionBody(), maxFeeSompi: undefined }, "x"));
    expect(r.code).toBe("V1_FEE_LIMIT_REQUIRED");
  });
});
