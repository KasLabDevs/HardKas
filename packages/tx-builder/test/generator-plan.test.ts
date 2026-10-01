import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { TxPlanService, type PlanTransactionRequest } from "../src/service.js";
import { verifyTxPlanSemantics } from "../src/verify.js";
import type { Utxo, TxPlan } from "../src/index.js";

/*
 * The planner is the official kaspa-wasm Generator behind HardKAS's adapter. These are
 * the differential classes that proved the substitution (multiple UTXOs, dust/change,
 * fee rates, insufficient funds, compounding, sizes), now run against the adapter:
 *
 * - wherever the Generator builds ONE transaction, the HardKAS plan is that transaction
 *   (same inputs in the same order, fee, change and mass), and it is valid by the node's
 *   rules as measured with the SDK: value conserved, recipients exact, overall mass within
 *   the standard limit, fee at least max(feeRate, 100) sompi per gram of compute mass
 *   (rusty-kaspad 2.1.0 relays at 100 sompi per gram of compute mass: verified by
 *   submission on 2026-09-29);
 * - wherever it refuses, HardKAS refuses with its own error, and a spend it can only
 *   build as several transactions fails closed (MULTI_TRANSACTION_PLAN_REQUIRED);
 * - a remainder too small for a standard change output is refused
 *   (CHANGE_BELOW_STANDARD_OUTPUT), never turned into fee.
 */

const k: any = loadManagedKaspaWasmSync();
const NET = "simnet";
const KAS = 100_000_000n;
const MAX_MASS = BigInt(k.maximumStandardTransactionMass());
const NODE_MIN_RATE = 100n;
const SHAPE_AMOUNT = 100_000_000_000_000n;

const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const addrOf = (name: string): string => new k.PrivateKey(hex(`hk-generator-plan-${name}`)).toPublicKey().toAddress(NET).toString();
const scriptOf = (address: string): string => String(k.payToAddressScript(address).script);
const A = addrOf("alice");
const B = addrOf("bob");
const C = addrOf("carol");

let serial = 0;
function utxosOf(owner: string, amounts: readonly bigint[]): Utxo[] {
  return amounts.map((amountSompi) => ({
    outpoint: { transactionId: hex(`utxo-${owner}-${serial++}`), index: 0 },
    address: owner,
    amountSompi,
    scriptPublicKey: scriptOf(owner),
    blockDaaScore: 0n,
    isCoinbase: false
  }));
}

type Out = { address: string; amountSompi: bigint };
const pay = (amountSompi: bigint, to = B): Out[] => [{ address: to, amountSompi }];
const key = (u: { outpoint: { transactionId: string; index: number } }) => `${u.outpoint.transactionId}:${u.outpoint.index}`;

/** The transaction a plan describes, measured by the SDK, with the node's acceptance rule. */
function measure(inputs: readonly Utxo[], outputs: readonly Out[]) {
  const txOf = (ins: readonly Utxo[], outs: readonly Out[]) =>
    new k.Transaction({
      version: 0,
      inputs: ins.map((u) => ({
        previousOutpoint: { transactionId: u.outpoint.transactionId, index: u.outpoint.index },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1,
        utxo: {
          outpoint: { transactionId: u.outpoint.transactionId, index: u.outpoint.index },
          amount: u.amountSompi,
          scriptPublicKey: new k.ScriptPublicKey(0, u.scriptPublicKey),
          blockDaaScore: 0n,
          isCoinbase: false
        }
      })),
      outputs: outs.map((o) => ({ value: o.amountSompi, scriptPublicKey: k.payToAddressScript(o.address) })),
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    });
  const mass = BigInt(k.calculateTransactionMass(NET, txOf(inputs, outputs), 1));
  // Compute mass: the same shape with amounts so large that storage mass vanishes.
  const computeMass = BigInt(
    k.calculateTransactionMass(
      NET,
      txOf(inputs.map((u) => ({ ...u, amountSompi: SHAPE_AMOUNT })), outputs.map((o) => ({ ...o, amountSompi: SHAPE_AMOUNT }))),
      1
    )
  );
  const sdkFee = k.calculateTransactionFee(NET, txOf(inputs, outputs), 1);
  return { mass, computeMass, sdkFee: sdkFee === undefined ? undefined : BigInt(sdkFee) };
}

function expectValid(plan: TxPlan, outputs: readonly Out[], feeRate?: bigint) {
  const change = plan.change ? [plan.change] : [];
  const inSum = plan.inputs.reduce((s, u) => s + u.amountSompi, 0n);
  const outSum = [...plan.outputs, ...change].reduce((s, o) => s + o.amountSompi, 0n);
  expect(inSum).toBe(outSum + plan.estimatedFeeSompi);
  expect(plan.outputs.map((o) => [o.address, o.amountSompi])).toEqual(outputs.map((o) => [o.address, o.amountSompi]));
  const m = measure(plan.inputs, [...plan.outputs, ...change]);
  expect(m.mass).toBeLessThanOrEqual(MAX_MASS);
  const rate = feeRate !== undefined && feeRate > NODE_MIN_RATE ? feeRate : NODE_MIN_RATE;
  expect(plan.estimatedFeeSompi).toBeGreaterThanOrEqual(rate * m.computeMass);
}

type RawTx = { inputs: string[]; fee: bigint; change: bigint; mass: bigint };
/** The Generator as upstream documents it: every transaction, `feeRate` as given, priority fee 0. */
async function rawGenerator(utxos: readonly Utxo[], outputs: readonly Out[], feeRate?: bigint): Promise<{ txs: RawTx[] } | { error: string }> {
  try {
    const gen = new k.Generator({
      entries: utxos.map((u) => ({
        address: u.address,
        outpoint: { transactionId: u.outpoint.transactionId, index: u.outpoint.index },
        amount: u.amountSompi,
        scriptPublicKey: "0000" + u.scriptPublicKey,
        blockDaaScore: 0n,
        isCoinbase: false
      })),
      outputs: outputs.map((o) => ({ address: o.address, amount: o.amountSompi })),
      changeAddress: A,
      priorityFee: 0n,
      ...(feeRate !== undefined ? { feeRate: Number(feeRate) } : {}),
      networkId: NET
    });
    const txs: RawTx[] = [];
    let p: any;
    while ((p = await gen.next())) {
      txs.push({
        inputs: p.transaction.inputs.map((i: any) => `${i.previousOutpoint.transactionId}:${i.previousOutpoint.index}`),
        fee: BigInt(p.feeAmount),
        change: BigInt(p.changeAmount ?? 0n),
        mass: BigInt(p.mass)
      });
    }
    return { txs };
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}

function service(utxos: readonly Utxo[], virtualDaaScore?: bigint) {
  return new TxPlanService({
    getUtxos: async () => [...utxos],
    ...(virtualDaaScore !== undefined ? { getVirtualDaaScore: async () => virtualDaaScore } : {})
  });
}

function request(outputs: readonly Out[], feeRate?: bigint): PlanTransactionRequest {
  return {
    fromAddress: A,
    toAddress: outputs[0]!.address,
    amountSompi: outputs[0]!.amountSompi,
    networkId: NET,
    ...(outputs.length > 1 ? { outputs: outputs.map((o) => ({ ...o })) } : {}),
    ...(feeRate !== undefined ? { feeRate } : {})
  };
}

async function planUpstream(utxos: readonly Utxo[], outputs: readonly Out[], feeRate?: bigint) {
  return service(utxos).planTransactionUpstream(request(outputs, feeRate));
}

/** Where the Generator builds one transaction, the HardKAS plan is exactly that transaction. */
async function expectSameAsGenerator(utxos: readonly Utxo[], outputs: readonly Out[], feeRate?: bigint) {
  const raw = await rawGenerator(utxos, outputs, feeRate);
  if (!("txs" in raw)) throw new Error(`the Generator refused: ${raw.error}`);
  expect(raw.txs).toHaveLength(1);
  const g = raw.txs[0]!;
  const result = await planUpstream(utxos, outputs, feeRate);
  expect(result.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
  expect(result.plan.inputs.map(key)).toEqual(g.inputs);
  expect(result.plan.estimatedFeeSompi).toBe(g.fee);
  expect(result.plan.change?.amountSompi ?? 0n).toBe(g.change);
  expect(result.plan.estimatedMass).toBe(g.mass);
  expectValid(result.plan, outputs, feeRate);
  return result;
}

async function refusalOf(promise: Promise<unknown>): Promise<{ code: string | undefined; message: string }> {
  try {
    await promise;
  } catch (e: any) {
    return { code: e?.code, message: String(e?.message ?? e) };
  }
  throw new Error("expected the planner to refuse");
}

const ladder = [1n, 2n, 5n, 10n, 20n, 50n, 100n, 200n, 500n, 1000n].map((x) => x * KAS);

describe("Generator plan · multiple UTXOs", () => {
  for (const target of [3n, 75n, 900n, 1500n, 1880n]) {
    it(`ladder 1..1000 KAS, pay ${target} KAS`, async () => {
      await expectSameAsGenerator(utxosOf(A, ladder), pay(target * KAS));
    });
  }
  it("20 equal UTXOs of 5 KAS, pay 42 KAS", async () => {
    const result = await expectSameAsGenerator(utxosOf(A, Array(20).fill(5n * KAS)), pay(42n * KAS));
    expect(result.plan.inputs.length).toBeGreaterThan(1);
  });
});

describe("Generator plan · dust / change", () => {
  // One UTXO of 10 KAS: walk the payment across the edge where the remainder goes from a
  // small change output to nothing, around the SDK's fee for a 1-in/2-out payment.
  const one = utxosOf(A, [10n * KAS]);
  const probe = measure(one, [{ address: B, amountSompi: 5n * KAS }, { address: A, amountSompi: 5n * KAS }]);
  const edge = 10n * KAS - probe.sdkFee!;
  for (const delta of [100_000n, 10_000n, 1000n, 600n, 599n, 300n, 1n, 0n, -1n, -50_000n]) {
    it(`10 KAS UTXO, pay (10 KAS - fee_2out) - ${delta}: refused, the remainder is never fee`, async () => {
      const outputs = pay(edge - delta);
      const raw = await rawGenerator(one, outputs);
      expect("error" in raw && raw.error).toMatch(/storage mass exceeds maximum/i);
      const refused = await refusalOf(planUpstream(one, outputs));
      expect(refused.code).toBe("CHANGE_BELOW_STANDARD_OUTPUT");
      expect(refused.message).toMatch(/Adjust the amount, or send the whole balance/);
    });
  }
  it("pay exactly the UTXO (nothing left for the fee): insufficient funds", async () => {
    const refused = await refusalOf(planUpstream(one, pay(10n * KAS)));
    expect(refused.code).toBe("INSUFFICIENT_FUNDS_UPSTREAM");
  });
  it("the Generator's other standard-mass refusal (Mass calculation error) is classified too", async () => {
    const utxos = utxosOf(A, [30_000_000n]);
    const raw = await rawGenerator(utxos, pay(15_000_000n));
    expect("error" in raw && raw.error).toMatch(/mass calculation error/i);
    const refused = await refusalOf(planUpstream(utxos, pay(15_000_000n)));
    expect(refused.code).toBe("CHANGE_BELOW_STANDARD_OUTPUT");
  });
  it("a change output the Generator accepts is kept, whatever its size", async () => {
    // Ten UTXOs of 0.1 KAS, pay 0.1 KAS: the Generator's change is below 0.1 KAS and standard.
    const result = await expectSameAsGenerator(utxosOf(A, Array(10).fill(10_000_000n)), pay(10_000_000n));
    expect(result.plan.change!.amountSompi).toBeLessThan(10_000_000n);
  });
});

describe("Generator plan · fee rates", () => {
  it("the requested rate is honoured on compute mass, never below the network minimum", async () => {
    const utxos = utxosOf(A, ladder);
    const fees: Record<string, bigint> = {};
    for (const rate of [undefined, 1n, 100n, 150n, 1000n]) {
      const result = await expectSameAsGenerator(utxos, pay(75n * KAS), rate);
      fees[String(rate)] = result.plan.estimatedFeeSompi;
    }
    expect(fees["1"]).toBe(fees["undefined"]);
    expect(fees["100"]).toBe(fees["undefined"]);
    expect(fees["150"]!).toBeGreaterThan(fees["100"]!);
    expect(fees["1000"]!).toBeGreaterThan(fees["150"]!);
  });
});

describe("Generator plan · insufficient funds", () => {
  it("funds < target", async () => {
    const refused = await refusalOf(planUpstream(utxosOf(A, [1n * KAS, 2n * KAS]), pay(5n * KAS)));
    expect(refused.code).toBe("INSUFFICIENT_FUNDS_UPSTREAM");
  });
  it("funds = target (no room for the fee)", async () => {
    const refused = await refusalOf(planUpstream(utxosOf(A, [2n * KAS, 3n * KAS]), pay(5n * KAS)));
    expect(refused.code).toBe("INSUFFICIENT_FUNDS_UPSTREAM");
  });
  it("no UTXOs", async () => {
    const refused = await refusalOf(planUpstream([], pay(1n * KAS)));
    expect(refused.message).toMatch(/Insufficient funds: no spendable UTXOs/);
  });
});

describe("Generator plan · compounding fails closed", () => {
  for (const [count, target, txs] of [
    [400, 350n, 5],
    [1500, 1200n, 15]
  ] as const) {
    it(`${count} UTXOs of 1 KAS, pay ${target} KAS: the Generator needs ${txs} transactions`, async () => {
      const utxos = utxosOf(A, Array(count).fill(1n * KAS));
      const raw = await rawGenerator(utxos, pay(target * KAS));
      expect("txs" in raw && raw.txs.length).toBe(txs);
      const refused = await refusalOf(planUpstream(utxos, pay(target * KAS)));
      expect(refused.code).toBe("MULTI_TRANSACTION_PLAN_REQUIRED");
      expect(refused.message).toMatch(new RegExp(`needs ${txs} transactions`));
      expect(refused.message).toMatch(/hardkas accounts consolidate/);
    }, 60_000);
  }
});

describe("Generator plan · sizes", () => {
  for (const [label, amount] of [
    ["0.0001 KAS", 10_000n],
    ["0.001 KAS", 100_000n],
    ["0.1 KAS", 10_000_000n]
  ] as const) {
    it(`payment of ${label} from 1 KAS: the payment output is below standard`, async () => {
      const utxos = utxosOf(A, [1n * KAS]);
      const raw = await rawGenerator(utxos, pay(amount));
      expect("error" in raw && raw.error).toMatch(/storage mass exceeds maximum/i);
      const refused = await refusalOf(planUpstream(utxos, pay(amount)));
      expect(refused.code).toBe("OUTPUT_BELOW_STANDARD_AMOUNT");
      expect(refused.message).toMatch(new RegExp(`the amount ${amount} sompi is too small`));
    });
  }
  it("large: 10M KAS UTXO, pay 9M KAS", async () => {
    await expectSameAsGenerator(utxosOf(A, [10_000_000n * KAS]), pay(9_000_000n * KAS));
  });
  it("above 2^53 sompi: 1B KAS UTXO, pay 500M KAS", async () => {
    const result = await expectSameAsGenerator(utxosOf(A, [1_000_000_000n * KAS]), pay(500_000_000n * KAS));
    expect(result.plan.change!.amountSompi > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });
  it("two recipients", async () => {
    await expectSameAsGenerator(utxosOf(A, ladder), [
      { address: B, amountSompi: 40n * KAS },
      { address: C, amountSompi: 30n * KAS }
    ]);
  });
});

describe("Generator plan · determinism and candidates", () => {
  it("the same UTXOs and request give the same plan", async () => {
    const utxos = utxosOf(A, ladder);
    const json = (p: unknown) => JSON.stringify(p, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    const first = await planUpstream(utxos, pay(75n * KAS));
    const second = await planUpstream(utxos, pay(75n * KAS));
    expect(json(second)).toBe(json(first));
  });

  it("excluded outpoints are removed before the Generator, never re-selected", async () => {
    const utxos = utxosOf(A, [5n * KAS, 5n * KAS, 5n * KAS]);
    const excluded = key(utxos[0]!);
    const result = await service(utxos).planTransactionUpstream({ ...request(pay(1n * KAS)), excludeOutpoints: new Set([excluded]) });
    expect(result.plan.inputs.map(key)).not.toContain(excluded);
    expect(result.utxoSelection.warnings?.[0]).toMatch(/excluded from candidate set/);
  });

  it("immature coinbase UTXOs are not candidates (maturity from the network parameters)", async () => {
    const [immature, mature, normal] = utxosOf(A, [500n * KAS, 500n * KAS, 500n * KAS]);
    const utxos: Utxo[] = [
      { ...immature!, isCoinbase: true, blockDaaScore: 10_000n },
      { ...mature!, isCoinbase: true, blockDaaScore: 5_000n },
      { ...normal!, isCoinbase: false, blockDaaScore: 10_500n }
    ];
    const result = await service(utxos, 10_500n).planTransactionUpstream(request(pay(600n * KAS)));
    expect(result.plan.inputs.map(key).sort()).toEqual([key(mature!), key(normal!)].sort());
    expect(result.utxoSelection.totalUtxosSeen).toBe(3);
  });

  it("a real UTXO is spent under its own script, even when its source gives no address", async () => {
    const { address: _address, ...rest } = utxosOf(A, [10n * KAS])[0]!;
    const noAddress = rest as Utxo;
    const result = await planUpstream([noAddress], pay(1n * KAS));
    expect(result.plan.inputs[0]).toBe(noAddress);
    expectValid(result.plan, pay(1n * KAS));
  });

  it("an address of another network is refused on a real network", async () => {
    const mainnet = new k.PrivateKey(hex("hk-generator-plan-mainnet")).toPublicKey().toAddress("mainnet").toString();
    await expect(planUpstream(utxosOf(A, [10n * KAS]), pay(1n * KAS, mainnet))).rejects.toThrow(/network type/i);
  });
});

describe("Generator plan · verification follows the node's fee rule", () => {
  it("accepts the Generator's fee when storage mass binds, and flags one sompi less", async () => {
    // 1 KAS from 1000 KAS: storage mass 10000 > compute mass 2036. The Generator pays the
    // node's rule (100 per gram of compute mass); the SDK's calculateTransactionFee asks 1000000.
    const result = await planUpstream(utxosOf(A, [1000n * KAS]), pay(1n * KAS));
    const plan = { ...result.plan, networkId: NET } as any;
    expect(plan.estimatedMass).toBe(10_000n);
    expect(plan.estimatedFeeSompi).toBe(203_600n);
    expect(verifyTxPlanSemantics(plan).issues.map((i) => i.code)).toEqual([]);

    const underpaid = {
      ...plan,
      estimatedFeeSompi: plan.estimatedFeeSompi - 1n,
      change: { ...plan.change, amountSompi: plan.change.amountSompi + 1n }
    };
    expect(verifyTxPlanSemantics(underpaid).issues.map((i) => i.code)).toContain("FEE_BELOW_NETWORK_MINIMUM");
  });
});

describe("Generator plan · simulator (synthetic identities)", () => {
  const SIM_ALICE = "kaspa:sim_alice";
  const SIM_BOB = "kaspa:sim_bob";
  const simUtxos = (amounts: readonly bigint[]): Utxo[] =>
    amounts.map((amountSompi, i) => ({
      outpoint: { transactionId: i === 0 ? "genesis-alice" : `synthetic-${hex(`sim-${i}`)}`, index: i },
      address: SIM_ALICE,
      amountSompi,
      scriptPublicKey: "mock-script"
    }));

  it("plans exactly what the Generator plans for real identities with the same amounts", async () => {
    const sim = simUtxos(ladder);
    const synthetic = await service(sim).planTransactionSynthetic({
      fromAddress: SIM_ALICE,
      toAddress: SIM_BOB,
      amountSompi: 75n * KAS,
      networkId: "simulated"
    });
    const real = await planUpstream(utxosOf(A, ladder), pay(75n * KAS));
    expect(synthetic.plannerAuthority).toBe("SYNTHETIC_SIMULATOR");
    expect(synthetic.plannerAuthorityDetail).toMatch(/^hardkas\.simulator\/kaspa-wasm@/);
    // Mapped back to the simulator's own identities.
    for (const input of synthetic.plan.inputs) expect(sim).toContain(input);
    expect(synthetic.plan.outputs).toEqual([{ address: SIM_BOB, amountSompi: 75n * KAS }]);
    expect(synthetic.plan.change?.address).toBe(SIM_ALICE);
    // Same selection, fee, change and mass as the real-identity plan.
    expect(synthetic.plan.inputs.map((u) => u.amountSompi)).toEqual(real.plan.inputs.map((u) => u.amountSompi));
    expect(synthetic.plan.estimatedFeeSompi).toBe(real.plan.estimatedFeeSompi);
    expect(synthetic.plan.change?.amountSompi).toBe(real.plan.change?.amountSompi);
    expect(synthetic.plan.estimatedMass).toBe(real.plan.estimatedMass);
  });

  it("refuses a small payment instead of charging the remainder as fee", async () => {
    // The previous synthetic planner charged 0.9 KAS of fee to send 0.1 KAS from a 1 KAS UTXO.
    const refused = await refusalOf(
      service(simUtxos([1n * KAS])).planTransactionSynthetic({
        fromAddress: SIM_ALICE,
        toAddress: SIM_BOB,
        amountSompi: 10_000_000n,
        networkId: "simulated"
      })
    );
    expect(refused.code).toBe("OUTPUT_BELOW_STANDARD_AMOUNT");
  });

  it("plans addresses of any network, and keeps them in the plan", async () => {
    const mainnet = new k.PrivateKey(hex("hk-generator-plan-mainnet")).toPublicKey().toAddress("mainnet").toString();
    const result = await service(simUtxos([10n * KAS])).planTransactionSynthetic({
      fromAddress: SIM_ALICE,
      toAddress: mainnet,
      amountSompi: 1n * KAS,
      networkId: "simulated"
    });
    expect(result.plan.outputs[0]!.address).toBe(mainnet);
  });
});

describe("Generator plan · consolidation", () => {
  it("spends every selected UTXO into one output, as the Generator's compound does", async () => {
    const utxos = utxosOf(A, Array(20).fill(5n * KAS));
    const result = await service([]).planConsolidation({ fromAddress: A, selectedUtxos: utxos, toAddress: A, networkId: NET });
    expect(result.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    expect(result.plan.inputs.map(key)).toEqual(utxos.map(key));
    expect(result.plan.change).toBeUndefined();
    expect(result.plan.outputs).toHaveLength(1);
    expect(result.plan.outputs[0]!.amountSompi).toBe(100n * KAS - result.plan.estimatedFeeSompi);
    expectValid(result.plan, result.plan.outputs);
  });

  it("refuses UTXOs that do not fit in one transaction: smaller batches", async () => {
    const utxos = utxosOf(A, Array(400).fill(1n * KAS));
    const refused = await refusalOf(service([]).planConsolidation({ fromAddress: A, selectedUtxos: utxos, toAddress: A, networkId: NET }));
    expect(refused.code).toBe("MULTI_TRANSACTION_PLAN_REQUIRED");
    expect(refused.message).toMatch(/smaller batches/);
  }, 60_000);

  it("plans the simulator's UTXOs as SYNTHETIC_SIMULATOR", async () => {
    const utxos: Utxo[] = [0, 1, 2].map((i) => ({
      outpoint: { transactionId: `synthetic-${hex(`c-${i}`)}`, index: 0 },
      address: "kaspa:sim_alice",
      amountSompi: 5n * KAS,
      scriptPublicKey: "mock-script"
    }));
    const result = await service([]).planConsolidation({
      fromAddress: "kaspa:sim_alice",
      selectedUtxos: utxos,
      toAddress: "kaspa:sim_alice",
      networkId: "simulated",
      simulated: true
    });
    expect(result.plannerAuthority).toBe("SYNTHETIC_SIMULATOR");
    expect(result.plan.outputs[0]!.address).toBe("kaspa:sim_alice");
    expect(result.plan.inputs).toHaveLength(3);
  });
});
