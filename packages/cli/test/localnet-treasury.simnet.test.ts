import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { getLocalnetTreasuryAccount } from "@hardkas/accounts";
import { getHardkasFixtureKey, mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, type IsolatedSimnetSession } from "../../testing/src/index.js";
import { distributeFromTreasury, memoryTreasuryJournal, type TreasuryBlockProducer } from "../src/runners/localnet-treasury.js";
import { livenessMinerRewardAddress } from "../src/runners/localnet-runners.js";

vi.setConfig({ testTimeout: 900_000, hookTimeout: 300_000 });

// rc2 audit B2 (b): the treasury distribution against a real rusty-kaspad v2.1.0 simnet (the harness's own isolated
// node, never the canonical localnet). Everything is real but the block producer, which mines with the harness's
// getBlockTemplate + submitBlock instead of the canonical miner container: the deterministic treasury is mined to until
// its coinbases mature (simnet maturity 1000 DAA), the real Generator plans one 1 -> 3 transaction, the real signer
// signs it with the treasury key, the node's RPC (the real JsonWrpcKaspaClient) takes it, and blocks paying the liveness
// address (P2SH of OP_RETURN, nobody's) confirm it. The node decides: the recipients' exact balances are its answer.

let session: IsolatedSimnetSession;

function fixtureAddress(name: "bob" | "carol" | "dave"): string {
  const k: any = loadManagedKaspaWasmSync();
  return String(new k.PrivateKey(getHardkasFixtureKey(name)).toPublicKey().toAddress("simnet").toString());
}

/** The harness's miner as a TreasuryBlockProducer: blocks are mined on demand, so "stopped" is simply not mining. */
function harnessProducer(blocksPerStep: number, mined: string[]): TreasuryBlockProducer {
  return {
    async produceUntil(rewardAddress, done, deadline) {
      while (Date.now() < deadline) {
        if (await done()) return { reached: true };
        await mineBlocks(session, blocksPerStep, rewardAddress);
        mined.push(rewardAddress);
      }
      return { reached: await done() };
    },
    livenessRewardAddress: () => livenessMinerRewardAddress(),
    resumeLiveness: async () => {},
    stop: async () => {}
  };
}

beforeAll(async () => {
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
});

afterAll(async () => {
  if (session) await stopIsolatedSimnet(session);
});

describe("B2 (b) · localnet treasury distribution on a real rusty-kaspad v2.1.0 simnet", () => {
  it("funds the empty treasury by mining, then pays 3 accounts their exact amounts in one transaction the node confirms", async () => {
    const treasury = getLocalnetTreasuryAccount();
    const recipients = (["bob", "carol", "dave"] as const).map((name, i) => ({
      name,
      address: fixtureAddress(name),
      beforeBalanceSompi: 0n,
      amountSompi: BigInt(100 + i * 25) * 100_000_000n // 100, 125, 150 KAS
    }));
    for (const r of recipients) expect((await session.rpc.getBalanceByAddress(r.address)).balanceSompi).toBe(0n);

    const mined: string[] = [];
    const journal = memoryTreasuryJournal();
    const result = await distributeFromTreasury({
      rpc: session.rpc,
      producer: harnessProducer(50, mined),
      treasury,
      recipients,
      timeoutMs: 600_000,
      stopMiner: true,
      journal
    });

    expect(result.txIds).toHaveLength(1);
    const txId = result.txIds[0]!;
    expect(txId).toMatch(/^[0-9a-f]{64}$/);
    // the node's UTXO index: each recipient holds exactly one output of that transaction, of exactly its amount
    for (const r of recipients) {
      expect((await session.rpc.getBalanceByAddress(r.address)).balanceSompi, r.name).toBe(r.amountSompi);
      const utxos = await session.rpc.getUtxosByAddress(r.address);
      expect(utxos.map((u: any) => [String(u.outpoint.transactionId).toLowerCase(), BigInt(u.amountSompi), Boolean(u.isCoinbase)]), r.name).toEqual([
        [txId, r.amountSompi, false]
      ]);
    }
    // the change went back to the treasury (an output of the same transaction at the treasury's address)
    const change = (await session.rpc.getUtxosByAddress(treasury.address)).filter((u: any) => String(u.outpoint.transactionId).toLowerCase() === txId);
    expect(change).toHaveLength(1);
    expect(BigInt(change[0]!.amountSompi)).toBeGreaterThan(0n);
    // mined to the treasury to fund it, then only to the liveness address to confirm; never to a recipient
    const liveness = await livenessMinerRewardAddress();
    expect(mined[0]).toBe(treasury.address);
    expect(mined.at(-1)).toBe(liveness);
    for (const r of recipients) expect(mined).not.toContain(r.address);
    expect(journal.entries).toEqual([]);
    console.log("[localnet-treasury.simnet]", JSON.stringify({ txId, blocksMinedSteps: mined.length, changeSompi: String(change[0]!.amountSompi) }));
  });
});
