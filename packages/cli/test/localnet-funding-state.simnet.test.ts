import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { getCoinbaseMaturity, loadManagedKaspaWasmSync } from "@hardkas/core";
import { getHardkasFixtureKey, mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, type IsolatedSimnetSession } from "../../testing/src/index.js";
import { createFundingStateReader, type FundingReadOrder } from "../src/runners/localnet-funding-state.js";

vi.setConfig({ testTimeout: 600_000, hookTimeout: 300_000 });

// LOCALNET-FUND-BOUNDED-READ-1 against a real rusty-kaspad v2.1.0 (simnet level, the harness's own node, never the
// canonical localnet): the funding state `localnet fund` now reads — the node's balance of the address minus the
// outputs to it of the coinbases accepted within the maturity window, found by walking the selected chain with
// getBlock — equals, to the sompi, the classification it replaces: every UTXO of the address from getUtxosByAddresses,
// mature unless it is a coinbase output with virtualDaaScore − blockDaaScore < maturity. This pins what the fake nodes
// cannot: which coinbase a chain block accepts and at which DAA score, the sink's coinbase in the virtual, the shape of
// getBlock's coinbase outputs and verbose data, and the walk ending at the genesis on a young chain.

let session: IsolatedSimnetSession;
let ALICE = "";
let BOB = "";
const MATURITY = getCoinbaseMaturity("simnet");

/** The node's UTXO index has caught up: two balance reads, 400 ms apart, agree with the sum of the listed UTXOs. */
async function settledUtxos(address: string) {
  for (let i = 0; i < 50; i++) {
    const a = (await session.rpc.getBalanceByAddress(address)).balanceSompi;
    await new Promise((r) => setTimeout(r, 400));
    const utxos = await session.rpc.getUtxosByAddress(address);
    const b = (await session.rpc.getBalanceByAddress(address)).balanceSompi;
    const listed = utxos.reduce((s, u) => s + BigInt(u.amountSompi), 0n);
    if (a === b && b === listed) return utxos;
  }
  throw new Error(`the UTXO index of ${address} did not settle`);
}

/** The replaced classification: every UTXO of the address, at the node's virtual DAA score. */
async function brute(address: string, margin: bigint) {
  const utxos = await settledUtxos(address);
  const V = BigInt((await session.rpc.getBlockDagInfo()).virtualDaaScore ?? 0n);
  const mature = utxos.filter((u) => !u.isCoinbase || (u.blockDaaScore !== undefined && V - BigInt(u.blockDaaScore) >= MATURITY + margin));
  return {
    V,
    count: utxos.length,
    balanceSompi: utxos.reduce((s, u) => s + BigInt(u.amountSompi), 0n),
    matureBalanceSompi: mature.reduce((s, u) => s + BigInt(u.amountSompi), 0n),
    immatureCount: utxos.length - mature.length
  };
}

async function compare(address: string, margin: bigint, order: FundingReadOrder) {
  const expected = await brute(address, margin);
  let blocks = 0;
  const counting = {
    getBlockDagInfo: () => session.rpc.getBlockDagInfo(),
    getBalanceByAddress: (a: string) => session.rpc.getBalanceByAddress(a),
    call: <T>(method: string, params?: unknown) => {
      if (method === "getBlock") blocks++;
      return session.rpc.call<T>(method, params);
    }
  };
  const got = await createFundingStateReader(address, MATURITY).read(counting, { order, marginDaa: margin });
  const where = `${address} margin ${margin} ${order} V ${expected.V} (${expected.count} UTXOs)`;
  expect(got.virtualDaaScore, where).toBe(expected.V);
  expect(got.balanceSompi, where).toBe(expected.balanceSompi);
  expect(got.matureBalanceSompi, where).toBe(expected.matureBalanceSompi);
  expect(got.immatureCoinbaseCount, where).toBe(expected.immatureCount);
  expect(blocks, where).toBeLessThanOrEqual(Number(MATURITY + margin) + 1);
  return { expected, got, blocks };
}

beforeAll(async () => {
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  ALICE = session.minerAddress;
  const k: any = loadManagedKaspaWasmSync();
  BOB = String(new k.PrivateKey(getHardkasFixtureKey("bob")).toPublicKey().toAddress("simnet").toString());
});

afterAll(async () => {
  if (session) await stopIsolatedSimnet(session);
});

describe("LOCALNET-FUND-BOUNDED-READ-1 · funding state on a real rusty-kaspad v2.1.0 (simnet)", () => {
  it("a young chain (below the coinbase maturity): every coinbase is immature, the walk ends at the genesis", async () => {
    await mineBlocks(session, 40, ALICE);
    const r = await compare(ALICE, 0n, "balance-then-dag");
    expect(r.expected.count).toBeGreaterThan(30);
    expect(r.got.matureBalanceSompi).toBe(0n);
  });

  it("past the maturity, with two payees: equal to the full-UTXO classification for each address, margin 0 and 10, both read orders", async () => {
    await mineBlocks(session, Number(MATURITY) + 80, ALICE);
    await mineBlocks(session, 30, BOB);
    await mineBlocks(session, 25, ALICE);
    const rows: unknown[] = [];
    for (const address of [ALICE, BOB]) {
      for (const margin of [0n, 10n]) {
        for (const order of ["balance-then-dag", "dag-then-balance"] as const) {
          const r = await compare(address, margin, order);
          rows.push({ address, margin: String(margin), order, V: String(r.expected.V), utxos: r.expected.count, immature: r.got.immatureCoinbaseCount, mature: String(r.got.matureBalanceSompi), blocks: r.blocks });
        }
      }
    }
    const alice = await brute(ALICE, 0n);
    expect(alice.matureBalanceSompi, "some of alice's coinbases are mature").toBeGreaterThan(0n);
    expect(alice.immatureCount, "and some are not").toBeGreaterThan(0);
    console.log("[localnet-funding-state.simnet]", JSON.stringify(rows));
  });
});
