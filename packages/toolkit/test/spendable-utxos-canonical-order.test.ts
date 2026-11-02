import { describe, it, expect } from "vitest";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { planWithGenerator } from "@hardkas/tx-builder";
import { QueryToolkit } from "../src/query-api.js";

// -----------------------------------------------------------------------------
// LOCALNET-W2 · a node lists an address's UTXOs in hash-map order, which changes between two calls on the same state. The
// planner hands the snapshot to the Generator in the order given (HardKAS adds no selection policy, and keeps exact parity
// with the Generator for a given order), so the same state planned twice gave different plans — found when the localnet
// level, which never collected a test before, ran W2 and W3. The spendable snapshot is now in one canonical order (by
// outpoint): any listing order of the same state gives the same snapshot and the same plan, and two plans of different
// amounts over one state share their first input (they genuinely conflict). Canonical level: a stand-in node, no network.
// -----------------------------------------------------------------------------

const RECIPIENT = "kaspasim:qryj23rch0n5rc7klfug58zcrnuc966qljwgzpu3mflqgxu6w2pjg6n575980";
const OWNER = "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn";
const KAS = 100_000_000n;

function stateUtxos() {
  const k: any = loadManagedKaspaWasmSync();
  const script = String(k.payToAddressScript(OWNER).script);
  return [
    { txid: "f1".repeat(32), index: 0, kas: 1n },
    { txid: "0a".repeat(32), index: 10, kas: 5n },
    { txid: "77".repeat(32), index: 0, kas: 1n },
    { txid: "0a".repeat(32), index: 2, kas: 3n }
  ].map((u) => ({ outpoint: { transactionId: u.txid, index: u.index }, address: OWNER, amountSompi: u.kas * KAS, scriptPublicKey: script }));
}
/** A stand-in node answering the same state in the listing order given, with an empty mempool. */
const nodeListing = (order: number[]) => {
  const all = stateUtxos();
  return new QueryToolkit({
    getUtxosByAddress: async () => order.map((i) => all[i]!),
    getMempoolEntriesByAddresses: async () => ({ entries: [] })
  } as any);
};
const keyOf = (u: any) => `${u.outpoint.transactionId}:${u.outpoint.index}`;
const plan = (utxos: any[], kas: bigint) =>
  planWithGenerator({ networkId: "simnet", utxos, outputs: [{ address: RECIPIENT, amountSompi: kas * KAS }], changeAddress: OWNER });

describe("LOCALNET-W2 · the same network state gives the same spendable snapshot, hence the same plan", () => {
  it("every listing order of one state gives the same snapshot, in outpoint order (index as a number)", async () => {
    const orders = [[0, 1, 2, 3], [3, 2, 1, 0], [2, 0, 3, 1], [1, 3, 0, 2]];
    const snapshots: string[][] = [];
    for (const o of orders) snapshots.push((await nodeListing(o).spendableUtxos({ address: OWNER, excludePending: true })).data.map(keyOf));
    for (const s of snapshots) expect(s).toEqual(snapshots[0]);
    expect(snapshots[0]).toEqual([`${"0a".repeat(32)}:2`, `${"0a".repeat(32)}:10`, `${"77".repeat(32)}:0`, `${"f1".repeat(32)}:0`]);
  });

  it("the plans of two listings of one state are the same; plans of different amounts share their first input", async () => {
    const a = await plan((await nodeListing([3, 2, 1, 0]).spendableUtxos({ address: OWNER, excludePending: true })).data, 2n);
    const b = await plan((await nodeListing([0, 1, 2, 3]).spendableUtxos({ address: OWNER, excludePending: true })).data, 2n);
    expect(a.inputs.map(keyOf)).toEqual(b.inputs.map(keyOf));
    const c = await plan((await nodeListing([2, 0, 3, 1]).spendableUtxos({ address: OWNER, excludePending: true })).data, 3n);
    expect(c.inputs.map(keyOf)[0]).toBe(a.inputs.map(keyOf)[0]);
  });
});
