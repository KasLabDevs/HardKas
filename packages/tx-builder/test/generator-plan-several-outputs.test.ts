import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { TxPlanService, type PlanTransactionRequest } from "../src/service.js";
import { planWithGenerator, TooManyOutputsError } from "../src/generator-plan.js";
import { measureRelayFee } from "../src/mass.js";
import type { Utxo } from "../src/index.js";

/*
 * R4-T · a payment to several recipients in ONE transaction, planned by the pinned kaspa-wasm Generator:
 * - the plan pays every recipient exactly, in the order given, with one change output and one fee, and conserves value;
 * - a covenant's UTXO is never a candidate (COVENANT-UTXO-PAYMENT-FILTER-1), several recipients or one;
 * - the standard-mass refusals keep their codes (CHANGE_BELOW_STANDARD_OUTPUT, OUTPUT_BELOW_STANDARD_AMOUNT,
 *   MULTI_TRANSACTION_PLAN_REQUIRED) and say what applies to several recipients; one recipient's messages are unchanged;
 * - more recipient outputs than the Generator puts in one standard transaction: TOO_MANY_OUTPUTS, with how many fit,
 *   counted by the Generator itself (the count fits, one more is refused, for P2PK and for P2SH recipients).
 */

const k: any = loadManagedKaspaWasmSync();
const NET = "simnet";
const KAS = 100_000_000n;

const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const addrOf = (name: string): string => new k.PrivateKey(hex(`hk-r4t-${name}`)).toPublicKey().toAddress(NET).toString();
const p2shOf = (name: string): string => k.addressFromScriptPublicKey(k.payToScriptHashScript(hex(`hk-r4t-p2sh-${name}`)), NET).toString();
const scriptOf = (address: string): string => String(k.payToAddressScript(address).script);
const A = addrOf("alice");

let serial = 0;
function utxosOf(owner: string, amounts: readonly bigint[]): Utxo[] {
  return amounts.map((amountSompi) => ({
    outpoint: { transactionId: hex(`r4t-utxo-${owner}-${serial++}`), index: 0 },
    address: owner,
    amountSompi,
    scriptPublicKey: scriptOf(owner),
    blockDaaScore: 0n,
    isCoinbase: false
  }));
}

type Out = { address: string; amountSompi: bigint };
const recipients = (n: number, amountSompi: bigint, kind: "p2pk" | "p2sh" = "p2pk"): Out[] =>
  Array.from({ length: n }, (_, i) => ({ address: kind === "p2pk" ? addrOf(`r${i}`) : p2shOf(`r${i}`), amountSompi }));

function request(outputs: readonly Out[]): PlanTransactionRequest {
  return {
    fromAddress: A,
    toAddress: outputs[0]!.address,
    amountSompi: outputs[0]!.amountSompi,
    networkId: NET,
    ...(outputs.length > 1 ? { outputs: outputs.map((o) => ({ ...o })) } : {})
  };
}
const service = (utxos: readonly Utxo[]) => new TxPlanService({ getUtxos: async () => [...utxos] });

async function refusalOf(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (e: any) {
    return e;
  }
  throw new Error("expected the planner to refuse");
}

describe("R4-T · several recipients in one transaction (Generator)", () => {
  it("3 recipients: one transaction, every recipient paid exactly and in order, one change output, value conserved", async () => {
    const outputs = [
      { address: addrOf("bob"), amountSompi: 10n * KAS },
      { address: addrOf("carol"), amountSompi: 25n * KAS },
      { address: addrOf("dave"), amountSompi: 7n * KAS }
    ];
    const { plan, plannerAuthority } = await service(utxosOf(A, [20n * KAS, 30n * KAS, 50n * KAS])).planTransactionUpstream(request(outputs));
    expect(plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    expect(plan.outputs.map((o) => [o.address, o.amountSompi])).toEqual(outputs.map((o) => [o.address, o.amountSompi]));
    expect(plan.change?.address).toBe(A);
    const inSum = plan.inputs.reduce((s, u) => s + u.amountSompi, 0n);
    const outSum = plan.outputs.reduce((s, o) => s + o.amountSompi, 0n) + (plan.change?.amountSompi ?? 0n);
    expect(inSum).toBe(outSum + plan.estimatedFeeSompi);
    // the fee is the node's relay floor over the compute mass of THIS shape (the existing helper, no formula of its own)
    const relay = measureRelayFee({
      networkId: NET,
      inputs: plan.inputs.map((u) => ({ amountSompi: u.amountSompi, scriptPublicKey: u.scriptPublicKey })),
      outputs: [...plan.outputs, plan.change!].map((o) => ({ address: o.address, amountSompi: o.amountSompi }))
    });
    expect(plan.estimatedFeeSompi).toBe(relay.relayFeeSompi);
  });

  it("the same recipient twice is two outputs (two payments), never merged", async () => {
    const bob = addrOf("bob");
    const { plan } = await service(utxosOf(A, [100n * KAS])).planTransactionUpstream(
      request([
        { address: bob, amountSompi: 2n * KAS },
        { address: bob, amountSompi: 3n * KAS }
      ])
    );
    expect(plan.outputs.map((o) => [o.address, o.amountSompi])).toEqual([
      [bob, 2n * KAS],
      [bob, 3n * KAS]
    ]);
  });

  it("COVENANT-UTXO-PAYMENT-FILTER-1: a covenant's UTXO is never selected for several recipients either", async () => {
    const [covenantUtxo, ordinary] = utxosOf(A, [1000n * KAS, 100n * KAS]);
    const utxos = [{ ...covenantUtxo!, covenantId: "c".repeat(64) } as Utxo, ordinary!];
    const result = await service(utxos).planTransactionUpstream(request(recipients(3, 10n * KAS)));
    expect(result.plan.inputs.map((u) => u.outpoint.transactionId)).toEqual([ordinary!.outpoint.transactionId]);
    expect(result.utxoSelection.warnings?.join(" ")).toMatch(/1 covenant UTXO\(s\) excluded/);
    // handed to the Generator directly, it is refused
    const refused = await refusalOf(planWithGenerator({ networkId: NET, utxos, outputs: recipients(3, 10n * KAS), changeAddress: A }));
    expect(refused.code).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
  });

  it("CHANGE_BELOW_STANDARD_OUTPUT: a remainder too small for a standard change output is refused, never turned into fee", async () => {
    const one = utxosOf(A, [10n * KAS]);
    const outs = recipients(3, 3n * KAS);
    // what is left after three payments of 3 KAS and the fee of a 1-in/4-out transaction, minus a few sompi
    const probe = measureRelayFee({ networkId: NET, inputs: [{ amountSompi: 10n * KAS, scriptPublicKey: scriptOf(A) }], outputs: [...outs, { address: A, amountSompi: 1n }] });
    outs[2] = { ...outs[2]!, amountSompi: 10n * KAS - 6n * KAS - probe.relayFeeSompi - 1000n };
    const refused = await refusalOf(service(one).planTransactionUpstream(request(outs)));
    expect(refused.code).toBe("CHANGE_BELOW_STANDARD_OUTPUT");
    expect(refused.message).toMatch(/Adjust the amount, or send the whole balance/);
  });

  it("OUTPUT_BELOW_STANDARD_AMOUNT: small outputs whose storage mass adds up are refused with a message about several recipients", async () => {
    // 20 payments of 1 KAS: 10,000 g of storage mass each (KIP-9), 200,000 g together
    const refused = await refusalOf(service(utxosOf(A, [10_000n * KAS])).planTransactionUpstream(request(recipients(20, 1n * KAS))));
    expect(refused.code).toBe("OUTPUT_BELOW_STANDARD_AMOUNT");
    expect(refused.message).toMatch(/the 20 payment outputs \(the smallest 100000000 sompi\) are too small together/);
    expect(refused.message).toMatch(/fewer recipients in one transaction/);
    // the same 20 recipients at 10 KAS each fit
    const { plan } = await service(utxosOf(A, [10_000n * KAS])).planTransactionUpstream(request(recipients(20, 10n * KAS)));
    expect(plan.outputs).toHaveLength(20);
    // one recipient: the message is the one it always was
    const single = await refusalOf(service(utxosOf(A, [1n * KAS])).planTransactionUpstream(request(recipients(1, 10_000_000n))));
    expect(single.code).toBe("OUTPUT_BELOW_STANDARD_AMOUNT");
    expect(single.message).toMatch(/the amount 10000000 sompi is too small for a standard output from these UTXOs .*Send a larger amount\./);
  });

  it("MULTI_TRANSACTION_PLAN_REQUIRED: inputs that do not fit beside the recipients' outputs say to consolidate or pay fewer recipients", async () => {
    // 120 recipients of 1000 KAS each from UTXOs of 2100 KAS: ~58 inputs do not fit beside 120 outputs
    const refused = await refusalOf(
      service(utxosOf(A, Array(70).fill(2_100n * KAS))).planTransactionUpstream(request(recipients(120, 1_000n * KAS)))
    );
    expect(refused.code).toBe("MULTI_TRANSACTION_PLAN_REQUIRED");
    expect(refused.message).toMatch(/consolidate the UTXOs first \(hardkas accounts consolidate\), or pay fewer of these 120 recipients in one transaction/);
  }, 120_000);

  for (const kind of ["p2pk", "p2sh"] as const) {
    it(`TOO_MANY_OUTPUTS (${kind} recipients): refused with how many fit; that many plan, one more is refused`, async () => {
      const big = utxosOf(A, [10_000_000n * KAS]);
      const all = recipients(250, 1_000n * KAS, kind);
      const refused = await refusalOf(service(big).planTransactionUpstream(request(all)));
      expect(refused).toBeInstanceOf(TooManyOutputsError);
      expect(refused.code).toBe("TOO_MANY_OUTPUTS");
      expect(refused.requestedOutputs).toBe(250);
      const fit: number = refused.outputsThatFit;
      expect(refused.metadata).toEqual({ requestedOutputs: 250, outputsThatFit: fit });
      expect(refused.message).toMatch(new RegExp(`has 250 recipient outputs, and at most ${fit} of them`));
      expect(refused.message).toMatch(/Transaction outputs exceed the maximum allowed mass/);
      // the count is the Generator's own: `fit` recipients plan (one standard transaction), fit + 1 are refused
      const atLimit = await service(big).planTransactionUpstream(request(all.slice(0, fit)));
      expect(atLimit.plan.outputs).toHaveLength(fit);
      expect(atLimit.plan.estimatedMass).toBeLessThanOrEqual(BigInt(k.maximumStandardTransactionMass()));
      const past = await refusalOf(service(big).planTransactionUpstream(request(all.slice(0, fit + 1))));
      expect(past.code).toBe("TOO_MANY_OUTPUTS");
      expect(past.outputsThatFit).toBe(fit);
      // probed on kaspa-wasm 2.1.0 (R4-T): 193 P2PK or 188 P2SH recipients beside one P2PK change output
      expect(fit).toBe(kind === "p2pk" ? 193 : 188);
    }, 120_000);
  }

  it("TOO_MANY_OUTPUTS counts the same from many small UTXOs (the Generator decides it before compounding any input)", async () => {
    const small = utxosOf(A, Array(300).fill(50n * KAS));
    // 25 KAS each: 193 of them stay under the storage-mass limit (77,200 g), so only the inputs are left to decide
    const refused = await refusalOf(service(small).planTransactionUpstream(request(recipients(250, 25n * KAS))));
    expect(refused.code).toBe("TOO_MANY_OUTPUTS");
    expect(refused.outputsThatFit).toBe(193);
    // 193 of them fit the output rule; from these UTXOs the inputs (~97 of 50 KAS) then need more than one transaction
    const atLimit = await refusalOf(service(small).planTransactionUpstream(request(recipients(193, 25n * KAS))));
    expect(atLimit.code).toBe("MULTI_TRANSACTION_PLAN_REQUIRED");
  }, 120_000);

  it("TOO_MANY_OUTPUTS on the simulator's synthetic identities too", async () => {
    const sim: Utxo[] = [{ outpoint: { transactionId: "genesis-alice", index: 0 }, address: "kaspa:sim_alice", amountSompi: 10_000_000n * KAS, scriptPublicKey: "mock-script" }];
    const outs = Array.from({ length: 200 }, (_, i) => ({ address: `kaspa:sim_r${i}`, amountSompi: 1_000n * KAS }));
    const refused = await refusalOf(
      service(sim).planTransactionSynthetic({ fromAddress: "kaspa:sim_alice", toAddress: outs[0]!.address, amountSompi: outs[0]!.amountSompi, outputs: outs, networkId: "simulated" })
    );
    expect(refused.code).toBe("TOO_MANY_OUTPUTS");
    expect(refused.outputsThatFit).toBe(193);
  }, 120_000);
});
