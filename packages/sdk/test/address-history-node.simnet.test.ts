import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getSilContract, loadManagedKaspaWasmSync, silContractBytecodeHex, silverP2shAddress } from "@hardkas/core";
import { buildCovenantGenesis } from "@hardkas/accounts";
import {
  fundTestAccount,
  getHardkasFixtureKey,
  mineBlocks,
  startIsolatedSimnet,
  stopIsolatedSimnet,
  waitForTransaction,
  waitForUtxo,
  type IsolatedSimnetSession
} from "../../testing/src/index.js";
import { Hardkas, readAddressHistoryOnNode } from "../src/index.js";
import { runTxStatus } from "../../cli/src/runners/tx-status-runner.js";

vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 });

// -----------------------------------------------------------------------------
// R3-D · ADDRESS-HISTORY-1 against a real rusty-kaspad v2.1.0 (the isolated simnet harness's own node; never the
// machine's localnet). bob receives three payments and spends two (each through sdk.tx.send: one submission per txId,
// recorded in the workspace); blocks are mined past them (to dave, so bob's history holds only these). Then:
//   1. the history (default window): exactly the five transactions, once each, in chain order; each acceptance is the
//      node's chain block (its header's DAA and blue scores), its depth measured from the node's tip; every spend is
//      attributed through the node's spent entry (getVirtualChainFromBlockV2 High populates each input's UTXO entry);
//   2. a window that starts after the first payment: the node's window does not list it and says what it does not cover
//      (with the workspace's records merged, it is listed as a record outside the window, accepted before it);
//   3. `tx status --address` (runner) from a FRESH workspace (no record of it) for a payment whose output bob has spent:
//      the history locates it, and the look from the chain block before its acceptance observes it accepted there;
//   4. a covenant genesis: its output at the covenant's address is labelled with the covenant id the node indexes.
// Throwaway fixture keys only; nothing on a public network.
// -----------------------------------------------------------------------------

const KAS = 100_000_000n;
const FIXTURES = path.resolve(__dirname, "../../accounts/test/fixtures/silver-genesis-txid-1");
let session: IsolatedSimnetSession;
let k: any;
let ws = "";
let fresh = "";
let sdk: Hardkas;
let sdkFresh: Hardkas;
let ALICE = "";
let BOB = "";
let CAROL = "";
let DAVE = "";
const payments: string[] = [];
const spends: Array<{ txId: string; inputs: Array<{ outpoint: string; amountSompi: string }> }> = [];

const addressOf = (name: string) => String(new k.PrivateKey(getHardkasFixtureKey(name)).toPublicKey().toAddress("simnet").toString());
const headerOf = async (hash: string) => {
  const b: any = await session.rpc.call("getBlock", { hash, includeTransactions: false });
  return (b?.block ?? b)?.header;
};

function workspace(label: string, accounts: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `hk-r3d-${label}-`));
  fs.mkdirSync(path.join(dir, ".hardkas"), { recursive: true });
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: session.rpcUrl } },
    accounts
  };
  fs.writeFileSync(path.join(dir, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  return dir;
}

async function send(from: string, to: string, amount: string): Promise<{ txId: string; plan: any }> {
  const plan: any = await sdk.tx.plan({ from, to, amount });
  const signed: any = await sdk.tx.sign(plan, { account: from });
  const sent: any = await sdk.tx.send(signed);
  expect(sent.submitted, JSON.stringify(sent).slice(0, 400)).toBe(true);
  return { txId: String(signed.txId), plan };
}

beforeAll(async () => {
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  k = loadManagedKaspaWasmSync();
  ALICE = session.minerAddress;
  BOB = addressOf("bob");
  CAROL = addressOf("carol");
  DAVE = addressOf("dave");
  process.env.HK_R3D_ALICE = session.minerPrivateKey;
  process.env.HK_R3D_BOB = getHardkasFixtureKey("bob");
  ws = workspace("hist", {
    alice: { kind: "kaspa", network: "simnet", address: ALICE, privateKeyEnv: "HK_R3D_ALICE" },
    bob: { kind: "kaspa", network: "simnet", address: BOB, privateKeyEnv: "HK_R3D_BOB" }
  });
  fresh = workspace("fresh", {});
  // alice's coinbases mature (1000 DAA + margin); blocks with the node's own time keep it synced (tx.send requires it)
  await mineBlocks(session, 5, ALICE);
  await mineBlocks(session, 1020, DAVE);
  sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
  sdkFresh = await Hardkas.open({ cwd: fresh, network: "simnet" });

  // three payments to bob, each mined before the next
  for (const amount of ["3", "2", "4"]) {
    const p = await send("alice", BOB, amount);
    payments.push(p.txId);
    await mineBlocks(session, 1, DAVE);
    await waitForTransaction(session, BOB, p.txId, 60_000);
  }
  // two spends by bob
  for (let i = 0; i < 2; i++) {
    const s = await send("bob", CAROL, "1");
    spends.push({ txId: s.txId, inputs: s.plan.inputs.map((x: any) => ({ outpoint: `${x.outpoint.transactionId}:${x.outpoint.index}`, amountSompi: String(x.amountSompi) })) });
    await mineBlocks(session, 1, DAVE);
    await waitForTransaction(session, CAROL, s.txId, 60_000);
  }
  // mine past them
  await mineBlocks(session, 12, DAVE);
});

afterAll(async () => {
  delete process.env.HK_R3D_ALICE;
  delete process.env.HK_R3D_BOB;
  await sdk?.close?.();
  await sdkFresh?.close?.();
  if (session) await stopIsolatedSimnet(session);
  for (const d of [ws, fresh]) if (d) fs.rmSync(d, { recursive: true, force: true });
});

describe("R3-D · an address's history on a real rusty-kaspad (simnet)", () => {
  const S: Record<string, any> = {};

  it("N-1 all five transactions, once each, in chain order, with the node's acceptances and depths; spends attributed by the node's spent entries", async () => {
    const r = await readAddressHistoryOnNode(sdk, BOB);
    S.full = r;
    const ids = r.entries.map((e) => e.txId);
    expect(new Set(ids).size, "deduplicated").toBe(ids.length);
    expect(ids, JSON.stringify(r.coverage.window)).toEqual([...payments, ...spends.map((s) => s.txId)]);
    expect(r.coverage.window).toMatchObject({ reachedTip: true, stoppedBy: "tip" });
    expect(r.coverage.spends).toBe("node-entries");
    expect(r.coverage.node).toMatchObject({ networkId: "simnet", isSynced: true });
    const tipDaa = BigInt(r.coverage.point.virtualDaaScore);
    const tipBlue = BigInt(r.coverage.point.sinkBlueScore);
    for (const e of r.entries) {
      expect(e.source, e.txId).toBe("node+workspace");
      const h = await headerOf(e.acceptance!.chainBlockHash);
      expect(String(h.daaScore), e.txId).toBe(e.acceptance!.daaScore);
      expect(String(h.blueScore), e.txId).toBe(e.acceptance!.blueScore);
      expect(e.acceptance!.confirmationsDaa).toBe((tipDaa - BigInt(h.daaScore)).toString());
      expect(e.acceptance!.confirmationsBlue).toBe((tipBlue - BigInt(h.blueScore)).toString());
      // 12 blocks were mined after the last spend's block; its ACCEPTING chain block is the first of them (a block's
      // transactions are accepted by the chain block that merges it), so at least 11 lie above it
      expect(BigInt(e.acceptance!.confirmationsBlue)).toBeGreaterThanOrEqual(11n);
    }
    // the payments: what each paid bob
    expect(r.entries.slice(0, 3).map((e) => [e.direction, e.receivedSompi])).toEqual([
      ["in", (3n * KAS).toString()],
      ["in", (2n * KAS).toString()],
      ["in", (4n * KAS).toString()]
    ]);
    // the spends: exactly the plan's inputs, through the node's spent entry (whenever the output was created)
    for (const [i, s] of spends.entries()) {
      const e = r.entries[3 + i]!;
      expect(e.spends.map((x) => ({ outpoint: x.outpoint, amountSompi: x.amountSompi })), s.txId).toEqual(s.inputs);
      expect(e.spends.every((x) => x.matchedBy === "node-entry")).toBe(true);
      expect(BigInt(e.spentSompi!)).toBe(s.inputs.reduce((a, x) => a + BigInt(x.amountSompi), 0n));
      for (const x of s.inputs) {
        const created = r.entries.find((c) => x.outpoint.startsWith(c.txId));
        if (created) expect(created.outputs.find((o) => `${created.txId}:${o.index}` === x.outpoint)?.spentBy).toBe(s.txId);
      }
    }
    // an output still unspent: its UTXO entry's DAA score is its acceptance's (two node views agree)
    const utxos: any[] = await session.rpc.getUtxosByAddress(BOB);
    for (const u of utxos) {
      const e = r.entries.find((x) => x.txId === String(u.outpoint.transactionId));
      expect(e, `unspent ${u.outpoint.transactionId}`).toBeDefined();
      expect(String(u.blockDaaScore ?? u.raw?.utxoEntry?.blockDaaScore)).toBe(e!.acceptance!.daaScore);
    }
    // the observer (the virtual chain, V1) names the same accepting chain blocks
    for (const txId of [payments[0]!, spends[1]!.txId]) {
      const seen: any = await sdk.tx.observe(txId);
      expect(seen.derived.acceptingBlockHash).toBe(r.entries.find((e) => e.txId === txId)!.acceptance!.chainBlockHash);
    }
  });

  it("N-2 a window that starts after the first payment: the node's window does not list it and says so; the workspace's record of it is outside the window", async () => {
    const first = S.full.entries[0];
    const after = String(BigInt(first.acceptance.daaScore) + 1n);
    const r = await readAddressHistoryOnNode(sdk, BOB, { since: after, workspaceRecords: false });
    expect(r.coverage.window.firstCoveredDaaScore).toBe(after);
    expect(r.entries.map((e) => e.txId)).toEqual([payments[1], payments[2], ...spends.map((s) => s.txId)]);
    expect(r.coverage.notCovered[0]).toMatch(new RegExp(`at or below DAA score ${first.acceptance.daaScore}`));
    // a spend of the first payment's output inside this window is still attributed (the node's spent entry names bob)
    const spentFirst = spends.find((s) => s.inputs.some((x) => x.outpoint.startsWith(payments[0]!)));
    if (spentFirst) expect(r.entries.find((e) => e.txId === spentFirst.txId)!.spends.some((x) => x.outpoint.startsWith(payments[0]!))).toBe(true);
    // the workspace's own evidence of the first payment: its submission (sent here) and one observation of it
    await sdk.tx.observe(payments[0]!);
    const merged = await readAddressHistoryOnNode(sdk, BOB, { since: after });
    const rec = merged.entries.find((e) => e.txId === payments[0]);
    expect(rec, "the workspace's record").toMatchObject({ source: "workspace", acceptance: { chainBlockHash: first.acceptance.chainBlockHash } });
    expect(rec!.outsideWindow).toMatch(/before the window/);
  });

  it("N-3 tx status --address (runner) from a fresh workspace: a payment whose output bob spent is located and observed accepted", async () => {
    const spent = payments.find((p) => spends.some((s) => s.inputs.some((x) => x.outpoint.startsWith(p))));
    expect(spent, "a payment whose output was spent").toBeDefined();
    const utxos: any[] = await session.rpc.getUtxosByAddress(BOB);
    expect(utxos.some((u) => String(u.outpoint.transactionId) === spent), "its output is no longer in the UTXO set").toBe(false);
    const accepting = S.full.entries.find((e: any) => e.txId === spent).acceptance;
    const r = await runTxStatus({ txId: spent!, address: BOB, sdk: sdkFresh, workspaceRoot: fresh, network: "simnet" });
    expect(r.addressLookup).toMatchObject({ address: BOB, found: true, acceptingBlockHash: accepting.chainBlockHash, cursor: accepting.previousChainBlockHash });
    expect(r.look.taken).toBe(true);
    expect(["ACCEPTED", "CONFIRMED"]).toContain(r.derived.status);
    expect(r.derived.acceptingBlockHash).toBe(accepting.chainBlockHash);
    expect(r.derived.evidence.submissionArtifactId, "the fresh workspace holds no submission of it").toBeUndefined();
  });

  it("N-4 a covenant output at its address is labelled with the covenant id the node indexes", async () => {
    const funding = await fundTestAccount(session, "alice", 10n * KAS + 20_000_000n);
    const artifact = JSON.parse(fs.readFileSync(path.join(FIXTURES, "counter-covenant-10.artifact.json"), "utf8"));
    const g = buildCovenantGenesis({
      artifact,
      contractName: "CounterCovenant",
      valueSompi: 10n * KAS,
      funding: [{ ...funding, privateKey: session.minerPrivateKey, computeBudget: 10 }],
      changeAddress: ALICE,
      networkId: "simnet",
      feeSompi: 1_000_000n
    });
    const res: any = await session.rpc.submitTransaction(g.rpcTransaction, { allowOrphan: false, expectedTxId: g.txId });
    expect(res?.accepted, String(res?.error ?? "")).not.toBe(false);
    await mineBlocks(session, 2, DAVE);
    const { contract } = getSilContract(artifact, "CounterCovenant");
    const covAddress = silverP2shAddress(silContractBytecodeHex(contract), "simnet");
    const utxo = await waitForUtxo(session, covAddress, { transactionId: g.txId.toLowerCase(), index: 0 });
    const r = await readAddressHistoryOnNode(sdk, covAddress, { lookback: 50 });
    const e = r.entries.find((x) => x.txId === g.txId.toLowerCase());
    expect(e, JSON.stringify(r.entries).slice(0, 600)).toMatchObject({
      covenantBound: true,
      receivedSompi: "0",
      covenantBoundReceivedSompi: (10n * KAS).toString(),
      outputs: [{ index: 0, covenantId: utxo.covenantId }]
    });
  });
});
