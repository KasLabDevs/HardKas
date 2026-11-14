import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getLocalnetTreasuryAccount } from "@hardkas/accounts";
import {
  distributeFromTreasury,
  fileTreasuryJournal,
  memoryTreasuryJournal,
  LOCALNET_TREASURY_PENDING_FILE,
  type TreasuryPendingJournal
} from "../src/runners/localnet-treasury.js";
import { FakeLocalnet, KAS, fixtureAddress } from "./localnet-treasury-fake-node.js";

// rc2 audit B4 + A10: the failure paths of the treasury distribution, with the real Generator and signer and a stand-in
// node (localnet-treasury-fake-node.ts).
//  - B4: a failure restores the liveness miner unless --stop-miner, and names what was already broadcast and funded.
//  - A10: a broadcast is classified as tx.send classifies it — the node's refusal is a rejection, an answer saying it
//    already holds the transaction means in flight, a request that left without an answer is an UNKNOWN outcome (never a
//    plain failure) — and a re-run after an unknown outcome sends the same transaction again, never a new payment.

const TREASURY = getLocalnetTreasuryAccount();
const ALICE = { name: "alice", address: fixtureAddress("0a") };
const BOB = { name: "bob", address: fixtureAddress("0b") };
const CAROL = { name: "carol", address: fixtureAddress("0c") };

function fundedTreasury(): FakeLocalnet {
  const node = new FakeLocalnet(5_000n);
  node.know(TREASURY.address);
  for (const r of [ALICE, BOB, CAROL]) node.know(r.address);
  for (let i = 0; i < 400; i++) node.add(TREASURY.address, 50n * KAS, { blockDaaScore: BigInt(100 + i), isCoinbase: true });
  return node;
}

const pay = (r: { name: string; address: string }, node: FakeLocalnet, amountSompi = 100n * KAS) => ({
  ...r,
  beforeBalanceSompi: node.balance(r.address),
  amountSompi
});

async function failure(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected a failure");
}

describe("B4 · a treasury run that fails midway", () => {
  it("names the transactions already broadcast and the accounts already funded, and restores the liveness miner", async () => {
    const node = fundedTreasury();
    // 3 × 3000 KAS from 50 KAS UTXOs does not fit one transaction: one transaction per recipient (alice, bob, carol)
    node.onSubmit = (txId, n) => (n === 1 ? { error: new Error(`Rejected transaction ${txId}: transaction ${txId} is not standard: x`) } : undefined);
    const journal = memoryTreasuryJournal();
    const err = await failure(
      distributeFromTreasury({
        rpc: node.rpc,
        producer: node.producer(),
        treasury: TREASURY,
        recipients: [pay(ALICE, node, 3_000n * KAS), pay(BOB, node, 3_000n * KAS), pay(CAROL, node, 3_000n * KAS)],
        timeoutMs: 20_000,
        stopMiner: false,
        journal
      })
    );
    const first = node.submissions[0]!.txId;
    expect(err.code).toBe("LOCALNET_TREASURY_SUBMIT_FAILED");
    expect(err.message).toContain(`Already broadcast by this run: ${first}`);
    expect(err.message).toMatch(/Funded and confirmed: alice\./);
    expect(err.message).toMatch(/liveness miner was restarted/);
    expect(err.context).toMatchObject({ broadcastTxIds: first, fundedAccounts: "alice" });
    expect(node.events.at(-1)).toMatch(/^resume:kaspasim:/);
    expect(node.balance(ALICE.address)).toBe(3_000n * KAS);
    expect(node.balance(BOB.address)).toBe(0n);
    // the refused transaction is not left in the journal: the node refused it, nothing of it is pending
    expect(journal.entries).toEqual([]);
  }, 60_000);

  it("a confirmation timeout names the transaction, keeps it pending, and with --stop-miner leaves the chain stopped", async () => {
    const node = fundedTreasury();
    const journal = memoryTreasuryJournal();
    const err = await failure(
      distributeFromTreasury({
        rpc: node.rpc,
        producer: node.producer({ produces: false }),
        treasury: TREASURY,
        recipients: [pay(ALICE, node)],
        timeoutMs: 300,
        stopMiner: true,
        journal
      })
    );
    const txId = node.submissions[0]!.txId;
    expect(err.code).toBe("LOCALNET_TREASURY_CONFIRM_TIMEOUT");
    expect(err.message).toContain(txId);
    expect(err.message).toMatch(/Broadcast but not confirmed: alice/);
    expect(err.message).toMatch(/left stopped \(--stop-miner\)/);
    expect(node.events.some((e) => e.startsWith("resume:"))).toBe(false);
    expect(journal.entries.map((e) => e.txId)).toEqual([txId]);

    // B4 (b): the re-run used to plan the identical transaction, which the node refused as a duplicate while the chain
    // stayed stopped. Now the recorded transaction is sent again, the node says it already holds it, the chain is mined
    // and it confirms: alice is paid once.
    const rerun = await distributeFromTreasury({
      rpc: node.rpc,
      producer: node.producer(),
      treasury: TREASURY,
      recipients: [pay(ALICE, node)],
      timeoutMs: 20_000,
      stopMiner: true,
      journal
    });
    expect(rerun.resumedTxIds).toEqual([txId]);
    expect(rerun.txIds).toEqual([txId]);
    expect(new Set(node.submissions.map((s) => s.txId))).toEqual(new Set([txId]));
    expect(node.balance(ALICE.address)).toBe(100n * KAS);
    expect(journal.entries).toEqual([]);
  }, 60_000);
});

describe("A10 · a broadcast without an answer is an unknown outcome, and a re-run never pays twice", () => {
  const unknownFirst = (node: FakeLocalnet) => {
    node.onSubmit = (_txId, n) => (n === 0 ? { deliver: true, error: new Error("RPC request submitTransaction timed out after 30000ms") } : undefined);
  };

  it("a timeout after the request left is LOCALNET_TREASURY_SUBMIT_OUTCOME_UNKNOWN, recorded, never SUBMIT_FAILED", async () => {
    const node = fundedTreasury();
    unknownFirst(node);
    const journal = memoryTreasuryJournal();
    const err = await failure(
      distributeFromTreasury({ rpc: node.rpc, producer: node.producer(), treasury: TREASURY, recipients: [pay(BOB, node)], timeoutMs: 20_000, stopMiner: false, journal })
    );
    const txId = node.submissions[0]!.txId;
    expect(err.code).toBe("LOCALNET_TREASURY_SUBMIT_OUTCOME_UNKNOWN");
    expect(err.message).toMatch(/outcome unknown/);
    expect(err.message).toMatch(/did not send it again and did not pay again/);
    expect(err.message).toMatch(/Sent with an unknown outcome: bob/);
    expect(journal.entries).toHaveLength(1);
    expect(journal.entries[0]).toMatchObject({ txId, rawTransaction: node.submissions[0]!.raw });
    expect(journal.entries[0]!.recipients).toEqual([{ name: "bob", address: BOB.address, amountSompi: (100n * KAS).toString(), expectedBalanceSompi: (100n * KAS).toString() }]);

    // the re-run, as `localnet seed` / `fund --treasury bob` again: the same transaction (it is in the mempool), mined
    node.onSubmit = undefined;
    const rerun = await distributeFromTreasury({ rpc: node.rpc, producer: node.producer(), treasury: TREASURY, recipients: [pay(BOB, node)], timeoutMs: 20_000, stopMiner: false, journal });
    expect(rerun.resumedTxIds).toEqual([txId]);
    expect(new Set(node.submissions.map((s) => s.txId))).toEqual(new Set([txId]));
    expect(node.balance(BOB.address)).toBe(100n * KAS);
    expect(journal.entries).toEqual([]);
  }, 60_000);

  it("re-audit F2: a re-run asking for more than the resumed transaction paid sends only what is still owed, then the recipient holds exactly the amount asked", async () => {
    const node = fundedTreasury();
    unknownFirst(node);
    const journal = memoryTreasuryJournal();
    await failure(
      distributeFromTreasury({ rpc: node.rpc, producer: node.producer(), treasury: TREASURY, recipients: [pay(ALICE, node)], timeoutMs: 20_000, stopMiner: false, journal })
    );
    const first = node.submissions[0]!.txId;
    node.onSubmit = undefined;

    // before the change, alice counted as paid by address: the 150 KAS still owed were never sent and the run succeeded
    const rerun = await distributeFromTreasury({
      rpc: node.rpc,
      producer: node.producer(),
      treasury: TREASURY,
      recipients: [{ ...ALICE, beforeBalanceSompi: 0n, amountSompi: 250n * KAS }],
      timeoutMs: 20_000,
      stopMiner: false,
      journal
    });
    expect(rerun.resumedTxIds).toEqual([first]);
    expect(rerun.txIds).toHaveLength(2);
    expect(node.balance(ALICE.address)).toBe(250n * KAS);
    expect(journal.entries).toEqual([]);
  }, 60_000);

  it("the unknown-outcome transaction was in fact accepted long before the re-run: recognized at the treasury, not paid again", async () => {
    const node = fundedTreasury();
    unknownFirst(node);
    const journal = memoryTreasuryJournal();
    await failure(
      distributeFromTreasury({ rpc: node.rpc, producer: node.producer(), treasury: TREASURY, recipients: [pay(CAROL, node)], timeoutMs: 20_000, stopMiner: true, journal })
    );
    const txId = node.submissions[0]!.txId;
    node.onSubmit = undefined;
    node.mine(3, fixtureAddress("0e")); // someone else's miner confirmed it meanwhile
    expect(node.balance(CAROL.address)).toBe(100n * KAS);

    const rerun = await distributeFromTreasury({ rpc: node.rpc, producer: node.producer(), treasury: TREASURY, recipients: [pay(CAROL, node)], timeoutMs: 20_000, stopMiner: true, journal });
    expect(rerun.resumedTxIds).toEqual([txId]);
    expect(new Set(node.submissions.map((s) => s.txId))).toEqual(new Set([txId]));
    expect(node.balance(CAROL.address)).toBe(100n * KAS);
    expect(journal.entries).toEqual([]);
  }, 60_000);

  it("a pending transaction the node refuses and the treasury shows no trace of is LOCALNET_TREASURY_PENDING_UNRESOLVED: nobody is paid on a guess", async () => {
    const node = fundedTreasury();
    unknownFirst(node);
    const journal = memoryTreasuryJournal();
    await failure(
      distributeFromTreasury({ rpc: node.rpc, producer: node.producer(), treasury: TREASURY, recipients: [pay(ALICE, node)], timeoutMs: 20_000, stopMiner: true, journal })
    );
    const pending = node.mempool.get(node.submissions[0]!.txId);
    node.mempool.clear();
    for (const i of pending.inputs) node.utxos.delete(`${i.previousOutpoint.transactionId}:${i.previousOutpoint.index}`); // spent elsewhere
    node.onSubmit = undefined;
    const before = node.submissions.length;
    const err = await failure(
      distributeFromTreasury({ rpc: node.rpc, producer: node.producer(), treasury: TREASURY, recipients: [pay(ALICE, node)], timeoutMs: 20_000, stopMiner: true, journal })
    );
    expect(err.code).toBe("LOCALNET_TREASURY_PENDING_UNRESOLVED");
    expect(node.submissions.slice(before).map((s) => s.txId)).toEqual([node.submissions[0]!.txId]);
    expect(node.balance(ALICE.address)).toBe(0n);
    expect(journal.entries).toHaveLength(1);
  }, 60_000);

  it("a node rejection is LOCALNET_TREASURY_SUBMIT_FAILED; a request that never left is SUBMIT_NOT_SENT; neither stays pending", async () => {
    for (const [error, code] of [
      [(txId: string) => new Error(`Rejected transaction ${txId}: transaction ${txId} is not standard: x`), "LOCALNET_TREASURY_SUBMIT_FAILED"],
      [() => Object.assign(new Error("the socket is not open"), { code: "RPC_REQUEST_NOT_SENT" }), "SUBMIT_NOT_SENT"]
    ] as const) {
      const node = fundedTreasury();
      node.onSubmit = (txId) => ({ error: error(txId) });
      const journal = memoryTreasuryJournal();
      const err = await failure(
        distributeFromTreasury({ rpc: node.rpc, producer: node.producer(), treasury: TREASURY, recipients: [pay(ALICE, node)], timeoutMs: 20_000, stopMiner: true, journal })
      );
      expect(err.code).toBe(code);
      expect(journal.entries).toEqual([]);
    }
  }, 60_000);
});

describe("A10 · the workspace journal file", () => {
  it("records, survives a new process (re-read from disk), clears, and is removed when empty; an unreadable one refuses to pay", () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-treasury-journal-"));
    try {
      const file = path.join(ws, LOCALNET_TREASURY_PENDING_FILE);
      const a: TreasuryPendingJournal = fileTreasuryJournal(ws);
      const entry = { txId: "ab".repeat(32), rawTransaction: "{}", recipients: [{ name: "alice", address: ALICE.address, amountSompi: "1", expectedBalanceSompi: "1" }], recordedAt: "2026-01-01T00:00:00.000Z" };
      a.record(entry);
      expect(fileTreasuryJournal(ws).load()).toEqual([entry]);
      a.clear(entry.txId);
      expect(fs.existsSync(file)).toBe(false);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "{ not json");
      expect(() => fileTreasuryJournal(ws).load()).toThrow(/LOCALNET_TREASURY_PENDING_UNRESOLVED|Cannot read/);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });
});
