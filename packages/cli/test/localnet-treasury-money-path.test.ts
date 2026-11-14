import { describe, expect, it } from "vitest";
import { getLocalnetTreasuryAccount } from "@hardkas/accounts";
import { distributeFromTreasury, memoryTreasuryJournal } from "../src/runners/localnet-treasury.js";
import { FakeLocalnet, KAS, fixtureAddress, scriptHexOf } from "./localnet-treasury-fake-node.js";

// rc2 audit B2 (a): the treasury's money path with nothing of it mocked — the real kaspa-wasm Generator plans, the real
// signer (signTxPlanArtifact) signs with the deterministic treasury key, the real artifact code carries the transaction —
// over a realistic treasury UTXO set in the real RPC client's shape. Only the transport (the node) is a stand-in
// (localnet-treasury-fake-node.ts), which checks inputs, maturity and value, and applies the transaction when it mines.

const TREASURY = getLocalnetTreasuryAccount();
const RECIPIENTS = ["0a", "0b", "0c", "0d", "0f"].map((b, i) => ({ name: ["alice", "bob", "carol", "dave", "erin"][i]!, address: fixtureAddress(b) }));
// 0.1 KAS: at the relay minimum (100 sompi/gram, FEE-POLICY-1) a 1 -> 5 payment from ~11 inputs pays about 0.013 KAS
const FEE_BOUND_SOMPI = 10_000_000n;

/** The treasury as a long-running localnet leaves it: one coinbase per mined block, a change output, noise. */
function realisticTreasury(node: FakeLocalnet) {
  node.know(TREASURY.address);
  for (const r of RECIPIENTS) node.know(r.address);
  for (let i = 0; i < 400; i++) {
    // 50 KAS rewards plus the fees of the block (all different), mined long ago: mature
    node.add(TREASURY.address, 50n * KAS + BigInt(i) * 137n, { blockDaaScore: BigInt(100 + i), isCoinbase: true });
  }
  node.add(TREASURY.address, 1_234_000_000n, { blockDaaScore: 4_000n, isCoinbase: false }); // an earlier change output
  const immature = node.add(TREASURY.address, 500n * KAS, { blockDaaScore: node.daa - 5n, isCoinbase: true });
  const covenant = node.add(TREASURY.address, 900n * KAS, { blockDaaScore: 200n, isCoinbase: false, covenantId: "cd".repeat(32) });
  return { immature, covenant };
}

describe("B2 (a) · treasury money path: real Generator, real signer, deterministic treasury key", () => {
  it("pays 5 recipients exactly 100 KAS each in one signed 1 -> 5 transaction, change back to the treasury, fee bounded", async () => {
    const node = new FakeLocalnet(5_000n);
    const { immature, covenant } = realisticTreasury(node);
    const treasuryBefore = node.balance(TREASURY.address);
    for (const r of RECIPIENTS.slice(0, 2)) node.add(r.address, 7n * KAS); // two of them already hold something
    const before = new Map(RECIPIENTS.map((r) => [r.address, node.balance(r.address)]));
    const journal = memoryTreasuryJournal();

    const result = await distributeFromTreasury({
      rpc: node.rpc,
      producer: node.producer(),
      treasury: TREASURY,
      recipients: RECIPIENTS.map((r) => ({ ...r, beforeBalanceSompi: before.get(r.address)!, amountSompi: 100n * KAS })),
      timeoutMs: 20_000,
      stopMiner: false,
      journal
    });

    expect(node.submissions).toHaveLength(1);
    const sent = node.submissions[0]!;
    expect(result.txIds).toEqual([sent.txId]);
    expect(sent.txId).toMatch(/^[0-9a-f]{64}$/);

    // inputs: treasury UTXOs only, never the immature coinbase or the covenant's UTXO; every input signed
    const spent = sent.tx.inputs.map((i: any) => `${i.previousOutpoint.transactionId}:${i.previousOutpoint.index}`);
    expect(spent).not.toContain(`${immature.outpoint.transactionId}:0`);
    expect(spent).not.toContain(`${covenant.outpoint.transactionId}:0`);
    for (const i of sent.tx.inputs) expect(String(i.signatureScript)).toMatch(/^[0-9a-f]{100,}$/i);

    // outputs: exactly 100 KAS to each recipient's own script; everything else is change to the treasury's own script
    // (one output, or two when the change had to be split — see TREASURY_CHANGE_SPLIT_SOMPI)
    for (const r of RECIPIENTS) {
      const paid = sent.outputs.filter((o) => o.address === r.address);
      expect(paid, r.name).toEqual([{ address: r.address, amountSompi: 100n * KAS }]);
    }
    const change = sent.outputs.filter((o) => o.address === TREASURY.address);
    expect(sent.outputs).toHaveLength(RECIPIENTS.length + change.length);
    expect(change.length).toBeGreaterThanOrEqual(1);
    expect(change.length).toBeLessThanOrEqual(2);
    for (const c of change) expect(c.amountSompi).toBeGreaterThanOrEqual(1n * KAS);
    expect(sent.tx.outputs.find((o: any) => o.scriptPublicKey.scriptPublicKey === scriptHexOf(TREASURY.address).slice(4))).toBeDefined();
    const changeTotal = change.reduce((s, c) => s + c.amountSompi, 0n);

    // the fee: inputs - outputs, positive and small
    expect(sent.feeSompi).toBeGreaterThan(0n);
    expect(sent.feeSompi).toBeLessThanOrEqual(FEE_BOUND_SOMPI);
    expect(sent.inputsSompi).toBe(500n * KAS + changeTotal + sent.feeSompi);

    // after the block: exact balances, the treasury lower by exactly what it paid plus the fee
    for (const r of RECIPIENTS) expect(node.balance(r.address), r.name).toBe(before.get(r.address)! + 100n * KAS);
    for (const r of RECIPIENTS) expect(result.finalBalances.get(r.address)).toBe(before.get(r.address)! + 100n * KAS);
    // the confirming blocks paid their coinbase to the liveness address, not to the treasury
    expect(node.balance(TREASURY.address)).toBe(treasuryBefore - 500n * KAS - sent.feeSompi);
    expect(journal.entries).toEqual([]);
    expect(node.events.at(-1)).toMatch(/^resume:kaspasim:/);
  }, 60_000);

  it("the same treasury UTXO set and payment always give the same transaction (inputs chosen deterministically)", async () => {
    const ids: string[] = [];
    for (let run = 0; run < 2; run++) {
      const node = new FakeLocalnet(5_000n);
      realisticTreasury(node);
      await distributeFromTreasury({
        rpc: node.rpc,
        producer: node.producer(),
        treasury: TREASURY,
        recipients: [{ ...RECIPIENTS[0]!, beforeBalanceSompi: 0n, amountSompi: 250n * KAS }],
        timeoutMs: 20_000,
        stopMiner: true
      });
      ids.push(node.submissions[0]!.txId);
    }
    // the fake numbers its UTXOs the same way on each run, so the sets are identical
    expect(ids[0]).toBe(ids[1]);
  }, 60_000);

  it("a payment the largest inputs cover almost exactly (the Generator's dust-change refusal) is still paid, exactly", async () => {
    // measured (W2-debug3): six 50 KAS + 30,000 sompi UTXOs for 250 KAS are refused by the Generator alone
    // (CHANGE_BELOW_STANDARD_OUTPUT); the treasury splits its change and pays
    for (const extra of [30_000n, 150_000n, 600_000n]) {
      const node = new FakeLocalnet(5_000n);
      node.know(TREASURY.address);
      const alice = RECIPIENTS[0]!;
      node.know(alice.address);
      for (let i = 0; i < 20; i++) node.add(TREASURY.address, 50n * KAS + extra, { blockDaaScore: BigInt(100 + i), isCoinbase: true });
      const treasuryBefore = node.balance(TREASURY.address);
      await distributeFromTreasury({
        rpc: node.rpc,
        producer: node.producer(),
        treasury: TREASURY,
        recipients: [{ ...alice, beforeBalanceSompi: 0n, amountSompi: 250n * KAS }],
        timeoutMs: 20_000,
        stopMiner: true
      });
      const sent = node.submissions[0]!;
      expect(node.submissions, String(extra)).toHaveLength(1);
      expect(sent.outputs.filter((o) => o.address === alice.address), String(extra)).toEqual([{ address: alice.address, amountSompi: 250n * KAS }]);
      expect(sent.outputs.every((o) => o.address === alice.address || o.address === TREASURY.address)).toBe(true);
      expect(node.balance(alice.address)).toBe(250n * KAS);
      expect(node.balance(TREASURY.address)).toBe(treasuryBefore - 250n * KAS - sent.feeSompi);
      expect(sent.feeSompi).toBeLessThanOrEqual(FEE_BOUND_SOMPI);
    }
  }, 60_000);

  it("B6 · one recipient whose amount needs more inputs than one standard transaction holds is paid over several, exactly", async () => {
    const node = new FakeLocalnet(5_000n);
    node.know(TREASURY.address);
    const bob = RECIPIENTS[1]!;
    node.know(bob.address);
    for (let i = 0; i < 400; i++) node.add(TREASURY.address, 50n * KAS, { blockDaaScore: BigInt(100 + i), isCoinbase: true });

    const result = await distributeFromTreasury({
      rpc: node.rpc,
      producer: node.producer(),
      treasury: TREASURY,
      recipients: [{ ...bob, beforeBalanceSompi: 0n, amountSompi: 10_000n * KAS }],
      timeoutMs: 60_000,
      stopMiner: true
    });

    expect(node.submissions.length).toBeGreaterThan(1);
    expect(result.txIds).toHaveLength(node.submissions.length);
    const toBob = node.submissions.flatMap((s) => s.outputs.filter((o) => o.address === bob.address).map((o) => o.amountSompi));
    expect(toBob.reduce((a, b) => a + b, 0n)).toBe(10_000n * KAS);
    expect(node.balance(bob.address)).toBe(10_000n * KAS);
    for (const s of node.submissions) expect(s.feeSompi).toBeLessThanOrEqual(FEE_BOUND_SOMPI * 10n);
  }, 120_000);
});
