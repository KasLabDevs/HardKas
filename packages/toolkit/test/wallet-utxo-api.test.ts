import { describe, it, expect } from "vitest";
import { WalletUtxoApi } from "../src/utxos.js";

// COVERAGE 1.0 · WalletUtxoApi: listing with frozen UTXOs, statistics, dust analysis, the recommendations, the four plans
// (consolidation, split, merge, sweep) and the coin-control pass-through. The store and the fee estimator are fakes; the
// arithmetic and the refusals are the module's own.

const KAS = 100_000_000n;
const ADDRESS = "kaspatest:myaddress";
const tx = (n: number) => n.toString(16).padStart(64, "0");
const utxo = (n: number, kas: bigint, index = 0) => ({ transactionId: tx(n), outputIndex: index, amountSompi: kas * KAS } as any);

function fakeStore(frozen: Record<string, unknown> = {}) {
  const state: any = { frozen: { ...frozen }, labels: {}, notes: {} };
  return {
    state,
    getState: () => state,
    freeze: (id: string, reason?: string) => void (state.frozen[id] = reason ?? true),
    unfreeze: (id: string) => void delete state.frozen[id],
    setLabel: (id: string, v: string) => void (state.labels[id] = v),
    getLabel: (id: string) => state.labels[id] as string | undefined,
    setNote: (id: string, v: string) => void (state.notes[id] = v),
    getNote: (id: string) => state.notes[id] as string | undefined
  };
}

// a fee that grows with the shape: 1000 sompi per input, 500 per output
const fee = async (inputs: number, outputs: number) => BigInt(inputs * 1000 + outputs * 500);

function api(utxos: any[], store = fakeStore()) {
  return { api: new WalletUtxoApi(async () => utxos, async () => ADDRESS, fee, store as any), store };
}

describe("list and statistics", () => {
  it("WU-1 frozen UTXOs are left out unless includeFrozen; frozen by transaction id or by id:index", async () => {
    const u = [utxo(1, 5n), utxo(2, 7n, 1), utxo(3, 9n)];
    const { api: a } = api(u, fakeStore({ [tx(1)]: true, [`${tx(2)}:1`]: true }));
    expect((await a.list()).map((x) => x.transactionId)).toEqual([tx(3)]);
    expect(await a.list({ includeFrozen: true })).toHaveLength(3);
  });

  it("WU-2 statistics count, sum and bound what is available, and what is frozen apart", async () => {
    const u = [utxo(1, 1n), utxo(2, 4n), utxo(3, 10n)];
    const { api: a } = api(u, fakeStore({ [tx(3)]: true }));
    const s = await a.statistics();
    expect(s).toMatchObject({ totalUtxos: 3, availableUtxos: 2, frozenUtxos: 1, includeFrozen: false });
    expect([s.totalValue, s.availableValue, s.frozenValue]).toEqual([15n * KAS, 5n * KAS, 10n * KAS]);
    expect([s.largest, s.smallest, s.averageValue]).toEqual([4n * KAS, 1n * KAS, (5n * KAS) / 2n]);
    const all = await a.statistics({ includeFrozen: true });
    expect([all.largest, all.smallest, all.averageValue]).toEqual([10n * KAS, 1n * KAS, 5n * KAS]);
  });

  it("WU-3 an empty wallet has zeros, never a NaN or a negative sentinel", async () => {
    const s = await api([]).api.statistics();
    expect(s).toMatchObject({ totalUtxos: 0, largest: 0n, smallest: 0n, averageValue: 0n });
  });
});

describe("dust and recommendations", () => {
  it("WU-4 dust is what is below the threshold (default 10 KAS), with its value and share", async () => {
    const u = [utxo(1, 1n), utxo(2, 2n), utxo(3, 20n), utxo(4, 30n)];
    const d = await api(u).api.analyzeDust();
    expect(d.dustUtxos).toHaveLength(2);
    expect(d.normalUtxos).toHaveLength(2);
    expect(d.totalDustValue).toBe(3n * KAS);
    expect(d.dustPercentage).toBe(0.5);
    const custom = await api(u).api.analyzeDust({ thresholdSompi: 25n * KAS });
    expect(custom.dustUtxos).toHaveLength(3);
    expect((await api([]).api.analyzeDust()).dustPercentage).toBe(0);
  });

  it("WU-5 many small UTXOs → consolidate; some dust → mergeDust; few and large → splitLarge; healthy → none", async () => {
    const small = Array.from({ length: 12 }, (_, i) => utxo(i + 1, 1n));
    expect((await api(small).api.analyze()).recommendedActions).toEqual(["consolidate"]);

    const someDust = [...Array.from({ length: 6 }, (_, i) => utxo(i + 1, 1n)), ...Array.from({ length: 8 }, (_, i) => utxo(i + 50, 50n))];
    expect((await api(someDust).api.analyze()).recommendedActions).toEqual(["mergeDust"]);

    const few = [utxo(1, 200n)];
    expect((await api(few).api.analyze()).recommendedActions).toEqual(["splitLarge"]);

    const healthy = [utxo(1, 50n), utxo(2, 50n), utxo(3, 50n), utxo(4, 50n)];
    const h = await api(healthy).api.analyze();
    expect(h.recommendedActions).toEqual(["none"]);
    expect(h).toMatchObject({ utxoCount: 4, dustCount: 0, totalValue: 200n * KAS, fragmentationScore: 0 });
  });
});

describe("plans", () => {
  it("WU-6 consolidation takes the smallest first, at most 84 inputs, and reports its saving", async () => {
    const u = Array.from({ length: 100 }, (_, i) => utxo(i + 1, BigInt(i + 1)));
    const p = await api(u).api.consolidate();
    expect(p.strategy).toBe("consolidation");
    expect(p.inputs).toHaveLength(84);
    expect(p.inputs[0]!.transactionId).toBe(tx(1));
    expect(p.estimatedFee).toBe(BigInt(84 * 1000 + 500));
    const total = p.inputs.reduce((s: bigint, x: any) => s + BigInt(x.amountSompi), 0n);
    expect(p.outputs).toEqual([{ address: ADDRESS, amount: total - p.estimatedFee }]);
    // 84 individual spends (1 in, 2 out = 2000) against one transaction
    expect(p.estimatedSavings).toBe(84n * 2000n - p.estimatedFee);
    expect(p.warnings).toEqual([]);
  });

  it("WU-7 consolidation warns on a single UTXO and when the fee eats the value", async () => {
    const one = await api([{ transactionId: tx(1), outputIndex: 0, amountSompi: 100n }]).api.consolidate();
    expect(one.warnings).toEqual(["Not enough UTXOs to consolidate.", "Consolidation fee exceeds the value of the selected UTXOs."]);
    // one input spent alone (1 in, 2 out = 2000) against the consolidation of that one input (1500)
    expect(one.estimatedSavings).toBe(500n);
  });

  it("WU-8 an unknown strategy is refused", async () => {
    await expect(api([utxo(1, 1n)]).api.plan({ strategy: "split" } as any)).rejects.toThrow(/not fully implemented/);
  });

  it("WU-9 splitPlan into N equal parts: the fee is paid out of the UTXO, nothing is created out of thin air", async () => {
    const u = [utxo(1, 10n)];
    const p = await api(u).api.splitPlan({ utxoId: tx(1), intoCount: 4 });
    expect(p.strategy).toBe("split");
    expect(p.inputs).toHaveLength(1);
    expect(p.outputs).toHaveLength(4);
    const sum = p.outputs.reduce((s: bigint, o: any) => s + o.amount, 0n);
    expect(sum + p.estimatedFee <= 10n * KAS).toBe(true);
    expect(new Set(p.outputs.map((o: any) => o.amount)).size).toBe(1);
  });

  it("WU-10 splitPlan with explicit outputs adds the change, and refuses an overspend", async () => {
    const u = [utxo(1, 10n)];
    const p = await api(u).api.splitPlan({ utxoId: `${tx(1)}:0`, outputs: [{ amountSompi: 3n * KAS }, { amountSompi: 2n * KAS }] });
    expect(p.outputs.map((o: any) => o.amount)).toEqual([3n * KAS, 2n * KAS, 5n * KAS - 2500n]);
    await expect(api(u).api.splitPlan({ utxoId: tx(1), outputs: [{ amountSompi: 9n * KAS }, { amountSompi: 9n * KAS }] })).rejects.toThrow(/not have enough funds to cover the requested outputs/);
  });

  it("WU-11 splitPlan refuses bad shapes: too few parts, both or neither mode, an unknown or a frozen UTXO, no funds for the fee", async () => {
    const u = [utxo(1, 10n)];
    const { api: a } = api(u);
    await expect(a.splitPlan({ utxoId: tx(1), intoCount: 1 })).rejects.toThrow(/intoCount >= 2/);
    await expect(a.splitPlan({ utxoId: tx(1), outputs: [{ amountSompi: 1n }] })).rejects.toThrow(/outputs.length >= 2/);
    await expect(a.splitPlan({ utxoId: tx(1) })).rejects.toThrow(/exactly one of/);
    await expect(a.splitPlan({ utxoId: tx(1), intoCount: 2, outputs: [{ amountSompi: 1n }, { amountSompi: 1n }] })).rejects.toThrow(/exactly one of/);
    await expect(a.splitPlan({ utxoId: tx(9), intoCount: 2 })).rejects.toThrow(/not found in wallet/);
    const frozen = api(u, fakeStore({ [tx(1)]: true })).api;
    await expect(frozen.splitPlan({ utxoId: tx(1), intoCount: 2 })).rejects.toThrow(/is frozen and cannot be planned/);
    const poor = api([{ transactionId: tx(2), outputIndex: 0, amountSompi: 1500n }]).api;
    await expect(poor.splitPlan({ utxoId: tx(2), intoCount: 2 })).rejects.toThrow(/not have enough funds to cover the split and fees/);
  });

  it("WU-12 mergePlan joins the named UTXOs into one output to the wallet; it refuses fewer than two, an unknown and a frozen one", async () => {
    const u = [utxo(1, 3n), utxo(2, 4n), utxo(3, 5n)];
    const { api: a } = api(u);
    const p = await a.mergePlan({ utxoIds: [tx(1), `${tx(2)}:0`] });
    expect(p.strategy).toBe("merge");
    expect(p.inputs).toHaveLength(2);
    expect(p.outputs).toEqual([{ address: ADDRESS, amount: 7n * KAS - p.estimatedFee }]);
    expect(p.estimatedSavings).toBe(2n * 2000n - p.estimatedFee > 0n ? 2n * 2000n - p.estimatedFee : 0n);
    await expect(a.mergePlan({ utxoIds: [tx(1)] })).rejects.toThrow(/at least 2/);
    await expect(a.mergePlan({ utxoIds: [tx(1), tx(9)] })).rejects.toThrow(/not found in wallet/);
    await expect(api(u, fakeStore({ [tx(2)]: true })).api.mergePlan({ utxoIds: [tx(1), tx(2)] })).rejects.toThrow(/frozen/);
    const dustMerge = await api([{ transactionId: tx(1), outputIndex: 0, amountSompi: 500n }, { transactionId: tx(2), outputIndex: 0, amountSompi: 600n }]).api.mergePlan({ utxoIds: [tx(1), tx(2)] });
    expect(dustMerge.warnings).toEqual(["Merge fee exceeds the value of the selected UTXOs."]);
    expect(dustMerge.outputs[0].amount).toBe(0n);
  });

  it("WU-13 sweepPlan sends everything (frozen excluded) to the destination, and refuses an empty wallet", async () => {
    const u = [utxo(1, 3n), utxo(2, 4n), utxo(3, 5n)];
    const p = await api(u, fakeStore({ [tx(3)]: true })).api.sweepPlan({ destinationAddress: "kaspatest:dest" });
    expect(p.strategy).toBe("sweep");
    expect(p.inputs).toHaveLength(2);
    expect(p.outputs).toEqual([{ address: "kaspatest:dest", amount: 7n * KAS - p.estimatedFee }]);
    await expect(api([]).api.sweepPlan({ destinationAddress: "kaspatest:dest" })).rejects.toThrow(/empty wallet/);
    const tiny = await api([{ transactionId: tx(1), outputIndex: 0, amountSompi: 10n }]).api.sweepPlan({ destinationAddress: "kaspatest:dest" });
    expect(tiny.warnings).toEqual(["Sweep fee exceeds the entire wallet balance."]);
  });
});

describe("coin control", () => {
  it("WU-14 freeze, unfreeze, labels and notes go through the store and show in the state and the listing", async () => {
    const u = [utxo(1, 5n), utxo(2, 6n)];
    const { api: a } = api(u);
    await a.freeze(tx(1), "keep");
    expect((await a.list()).map((x) => x.transactionId)).toEqual([tx(2)]);
    expect((await a.controlState()).frozen[tx(1)]).toBe("keep");
    await a.unfreeze(tx(1));
    expect(await a.list()).toHaveLength(2);
    await a.labels.set(tx(2), "rent");
    await a.notes.set(tx(2), "monthly");
    expect(await a.labels.get(tx(2))).toBe("rent");
    expect(await a.notes.get(tx(2))).toBe("monthly");
    expect(await a.labels.get(tx(1))).toBeUndefined();
  });
});
