import { describe, it, expect } from "vitest";
import { createFundingStateReader, fundingStateJson, type FundingStateRpc } from "../src/runners/localnet-funding-state.js";

// LOCALNET-FUND-BOUNDED-READ-1 · the funding-state reader against the classification it replaces: list every UTXO of
// the address, a UTXO is mature unless it is a coinbase output with virtualDaaScore − blockDaaScore < maturity. The
// chains here have merges (the DAA score jumps by the mergeset size), several payees, non-coinbase outputs, a young
// chain that ends at the genesis, and a UTXO index that lags the chain.

const A = "kaspasim:qqaaaa";
const B = "kaspasim:qqbbbb";
const hashOf = (i: number) => "b" + i.toString(16).padStart(63, "0");

interface Utxo { amount: bigint; blockDaaScore: bigint; isCoinbase: boolean; address: string }

/** A deterministic chain: block i (i ≥ 1) has DAA daa[i]; its coinbase pays `outs[i]`; block 0 is the genesis. */
function chain(seed: number, length: number) {
  let x = seed;
  const rnd = (n: number) => ((x = (x * 1103515245 + 12345) % 2147483648), x % n);
  const daa: bigint[] = [0n];
  const outs: Array<Array<{ address: string; value: bigint }>> = [[]];
  for (let i = 1; i <= length; i++) {
    daa.push(daa[i - 1]! + BigInt(1 + rnd(3)));
    const o: Array<{ address: string; value: bigint }> = [];
    for (let k = rnd(3); k > 0; k--) o.push({ address: rnd(2) ? A : B, value: BigInt(1 + rnd(5_000_000_000)) });
    outs.push(o);
  }
  return { daa, outs };
}

/** The node: the chain up to `tip`, the virtual `gap` DAA above the sink, an index that may hold an older tip. */
function node(c: ReturnType<typeof chain>, tip: number, gap: bigint, extra: Utxo[] = [], indexTip = tip) {
  const V = c.daa[tip]! + gap;
  const utxos = (upTo: number): Utxo[] => {
    const vDaa = upTo === tip ? V : c.daa[upTo + 1]!;
    const out: Utxo[] = [...extra];
    for (let i = 0; i <= upTo; i++) {
      const acceptedAt = i === upTo ? vDaa : c.daa[i + 1]!;
      for (const o of c.outs[i]!) out.push({ amount: o.value, blockDaaScore: acceptedAt, isCoinbase: true, address: o.address });
    }
    return out;
  };
  const calls: string[] = [];
  const rpc: FundingStateRpc = {
    async getBlockDagInfo() {
      calls.push("getBlockDagInfo");
      return { virtualDaaScore: V, sink: hashOf(tip) };
    },
    async getBalanceByAddress(address) {
      calls.push("getBalanceByAddress");
      return { balanceSompi: utxos(indexTip).filter((u) => u.address === address).reduce((s, u) => s + u.amount, 0n) };
    },
    async call(method: string, params: any): Promise<any> {
      calls.push(method);
      if (method !== "getBlock") throw new Error(`unexpected ${method}`);
      const i = parseInt(String(params.hash).slice(1), 16);
      return {
        block: {
          header: { daaScore: Number(c.daa[i]!), parentsByLevel: i > 0 ? [[hashOf(i - 1)]] : [] },
          transactions: [{ outputs: c.outs[i]!.map((o) => ({ value: Number(o.value), verboseData: { scriptPublicKeyAddress: o.address } })) }],
          verboseData: { selectedParentHash: i > 0 ? hashOf(i - 1) : "fe".repeat(32) }
        }
      };
    }
  };
  /** The replaced classification, over every UTXO the chain holds at `tip`. */
  const brute = (address: string, maturity: bigint) => {
    const mine = utxos(tip).filter((u) => u.address === address);
    const mature = mine.filter((u) => !u.isCoinbase || V - u.blockDaaScore >= maturity);
    return {
      balanceSompi: mine.reduce((s, u) => s + u.amount, 0n),
      matureBalanceSompi: mature.reduce((s, u) => s + u.amount, 0n),
      immatureCount: mine.length - mature.length
    };
  };
  return { rpc, brute, calls, V };
}

describe("LOCALNET-FUND-BOUNDED-READ-1 · funding state from the balance and the maturity window", () => {
  it("equals the full-UTXO classification on chains with merges, several payees and non-coinbase outputs", async () => {
    const payments: Utxo[] = [
      { amount: 123_456n, blockDaaScore: 5n, isCoinbase: false, address: A },
      { amount: 999n, blockDaaScore: 10_000n, isCoinbase: false, address: A }
    ];
    for (const seed of [1, 7, 42, 2026]) {
      const c = chain(seed, 400);
      for (const [tip, gap, maturity, margin] of [[400, 1n, 100n, 0n], [400, 3n, 100n, 10n], [250, 2n, 37n, 0n], [399, 1n, 1n, 0n], [400, 1n, 5000n, 0n]] as const) {
        const n = node(c, tip, gap, payments);
        for (const address of [A, B]) {
          const expected = n.brute(address, maturity + margin);
          for (const order of ["balance-then-dag", "dag-then-balance"] as const) {
            const s = await createFundingStateReader(address, maturity).read(n.rpc, { order, marginDaa: margin });
            const where = `seed ${seed} tip ${tip} gap ${gap} maturity ${maturity}+${margin} ${address} ${order}`;
            expect(s.balanceSompi, where).toBe(expected.balanceSompi);
            expect(s.matureBalanceSompi, where).toBe(expected.matureBalanceSompi);
            expect(s.immatureCoinbaseCount, where).toBe(expected.immatureCount);
            expect(s.virtualDaaScore, where).toBe(n.V);
          }
        }
      }
    }
  });

  it("reads only the window: at most maturity + margin + 1 blocks, and a reader reads each block once", async () => {
    const c = chain(3, 3000);
    const n = node(c, 3000, 1n);
    const reader = createFundingStateReader(A, 100n);
    await reader.read(n.rpc, { order: "balance-then-dag", marginDaa: 10n });
    const first = n.calls.filter((m) => m === "getBlock").length;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(111);
    await reader.read(n.rpc, { order: "balance-then-dag", marginDaa: 10n });
    expect(n.calls.filter((m) => m === "getBlock").length, "the second read finds every block it needs in the reader").toBe(first);
  });

  it("a young chain (virtual DAA below the maturity): every coinbase is immature, the walk ends at the genesis", async () => {
    const c = chain(9, 30);
    // as on rusty-kaspa simnet: the genesis's child has the genesis's own DAA score (the genesis is no DAA block)
    c.daa[1] = c.daa[0]!;
    const n = node(c, 30, 1n);
    const s = await createFundingStateReader(A, 1000n).read(n.rpc, { order: "dag-then-balance" });
    expect(s.matureBalanceSompi).toBe(0n);
    expect(s.immatureCoinbaseSompi).toBe(n.brute(A, 1000n).balanceSompi);
    expect(n.calls.filter((m) => m === "getBlock").length).toBe(31);
  });

  it("past the maturity on a chain whose first step keeps the genesis's DAA score: still the full-UTXO classification", async () => {
    const c = chain(13, 300);
    c.daa[1] = c.daa[0]!;
    const n = node(c, 300, 1n);
    for (const maturity of [50n, 2000n]) {
      const s = await createFundingStateReader(A, maturity).read(n.rpc, { order: "balance-then-dag" });
      expect(s.matureBalanceSompi, `maturity ${maturity}`).toBe(n.brute(A, maturity).matureBalanceSompi);
    }
  });

  it("a node whose DAA score grows down the chain answers no chain: refused, never a guess", async () => {
    const c = chain(17, 50);
    c.daa[10] = c.daa[49]! + 100n;
    const n = node(c, 50, 1n);
    await expect(createFundingStateReader(A, 1000n).read(n.rpc, { order: "balance-then-dag" })).rejects.toMatchObject({ code: "LOCALNET_FUNDING_STATE_UNREADABLE" });
  });

  it("balance-then-dag never reports more mature funds than the node holds when the UTXO index lags the chain", async () => {
    const c = chain(11, 600);
    for (const lag of [1, 2, 5]) {
      const n = node(c, 600, 1n, [], 600 - lag);
      const s = await createFundingStateReader(A, 100n).read(n.rpc, { order: "balance-then-dag" });
      expect(s.matureBalanceSompi).toBeLessThanOrEqual(n.brute(A, 100n).matureBalanceSompi);
    }
  });

  it("the JSON record keeps the LocalnetFundingV1 fields; the counts it cannot know without listing every UTXO are null", async () => {
    const c = chain(5, 200);
    const n = node(c, 200, 1n);
    const json = fundingStateJson(await createFundingStateReader(A, 50n).read(n.rpc, { order: "balance-then-dag" }));
    expect(Object.keys(json)).toEqual(["balanceSompi", "matureBalanceSompi", "utxoCount", "matureUtxoCount", "virtualDaaScore"]);
    expect(json.utxoCount).toBeNull();
    expect(json.matureUtxoCount).toBeNull();
    expect(json.virtualDaaScore).toBe(n.V.toString());
  });

  it("a block the node returns without transactions is an error, never a silent zero", async () => {
    const rpc: FundingStateRpc = {
      getBlockDagInfo: async () => ({ virtualDaaScore: 50n, sink: hashOf(49) }),
      getBalanceByAddress: async () => ({ balanceSompi: 10n }),
      call: async () => ({ block: { header: { daaScore: 49, parentsByLevel: [[hashOf(48)]] }, transactions: [], verboseData: { selectedParentHash: hashOf(48) } } }) as any
    };
    await expect(createFundingStateReader(A, 10n).read(rpc, { order: "balance-then-dag" })).rejects.toMatchObject({ code: "LOCALNET_FUNDING_STATE_UNREADABLE" });
  });
});
