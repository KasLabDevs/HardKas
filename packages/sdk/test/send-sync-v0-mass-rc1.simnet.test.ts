import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { KASPAD_REFERENCE_IMAGE, loadManagedKaspaWasmSync } from "@hardkas/core";
import { officialTxIdOf } from "@hardkas/kaspa-rpc";
import { calculateUpstreamStorageMass } from "@hardkas/tx-builder";
import { getHardkasFixtureKey, startIsolatedSimnet, stopIsolatedSimnet, type IsolatedSimnetSession } from "../../testing/src/index.js";
import { startCountingWsProxy, type CountingWsProxy } from "../../cli/test/helpers/counting-ws-proxy.js";
import { Hardkas } from "../src/index.js";

vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 });

// -----------------------------------------------------------------------------
// RC1 · R1 against a real rusty-kaspad v2.1.0 (simnet level, the harness's own node):
//
// D3 · the SDK's tx.send requires a node that says it is synced. A fresh node with no miner says `isSynced: false`
//   (R1 probe, evidence 01). Blocks whose timestamps are old (just above the genesis's) advance the DAA score — the
//   coinbases mature — while the node keeps saying it is not synced, so one node gives both halves:
//     - unsynced: tx.send refuses with NODE_NOT_SYNCED and no submitTransaction reaches the node (counted at the wire by
//       a loopback relay; the node's own mempool does not hold the transaction) — while the node itself WOULD take it:
//       the explicit escape (allowUnsyncedNode: true, simnet) sends another payment, and the node accepts it;
//     - one block with the node's current timestamp: `isSynced: true`, and the same tx.send goes out, once.
// D1 · the v0 payment's storage mass: HardKAS's signed v0 transaction commits 0; the node's mempool holds HardKAS's
//   computed value (tx-builder, the node's formula) and the exact fee; the node mines it with that value under the same
//   txid; the recipient's output holds exactly the amount planned; the official id of the payload committing the
//   computed value is the signed txid (the field is not covered by the id).
// Evidence: a JSON written to HARDKAS_TEST_R1_EVIDENCE (or the OS temp directory).
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const cliDist = path.join(repoRoot, "packages", "cli", "dist", "index.js");
const PW_ENV = "HK_RC1_R1_PW";
const PASSWORD = `rc1-r1-${process.pid}`;

let session: IsolatedSimnetSession;
let relay: CountingWsProxy;
let sdk: Hardkas;
let parent = "";
let ws = "";
let k: any;
let ALICE = "";
let BOB = "";
let CAROL = "";
const evidence: Record<string, any> = { schema: "hardkas.rc1.r1.sendSyncV0Mass.v1", startedAt: new Date().toISOString(), node: {}, steps: [] as any[] };
const record = (name: string, data: Record<string, unknown>) => evidence.steps.push({ name, at: new Date().toISOString(), ...data });
const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
const submits = () => relay.count("submitTransaction");
const isSynced = async () => ((await session.rpc.getServerInfo()) as any)?.isSynced;
const headerOf = (b: any) => b?.block?.header ?? b?.getBlockResponse?.block?.header ?? b?.header;
const verboseOf = (b: any) => b?.block?.verboseData ?? b?.getBlockResponse?.block?.verboseData ?? b?.verboseData;

/** One block from the node's template; with `timestamp`, the header carries that time instead of the node's. */
async function mineOne(payAddress: string, timestamp?: bigint) {
  const t: any = await session.rpc.call("getBlockTemplateRequest", { payAddress, extraData: [] });
  const block = t.blockMessage || t.block;
  if (timestamp !== undefined) block.header.timestamp = typeof block.header.timestamp === "bigint" ? timestamp : Number(timestamp);
  const r: any = await session.rpc.call("submitBlockRequest", { block, allowNonDAABlocks: false });
  if (r?.rejectReason && String(r.rejectReason) !== "None" && String(r.rejectReason) !== "0") throw new Error(`block rejected: ${JSON.stringify(r)}`);
}

async function mempoolEntry(txId: string): Promise<any> {
  try {
    return json(await session.rpc.call("getMempoolEntryRequest", { transactionId: txId, includeOrphanPool: true, filterTransactionPool: false }));
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}
const heldOf = (entry: any) => (entry?.mempoolEntry ?? entry?.entry) as any;
const massOf = (tx: any) => {
  const v = tx?.storageMass ?? tx?.storage_mass ?? tx?.mass;
  return v === undefined || v === null ? undefined : BigInt(v);
};
const payloadOf = (signed: any) => {
  let tx: any = JSON.parse(signed.signedTransaction.payload);
  while (typeof tx === "string") tx = JSON.parse(tx);
  return tx;
};
const submissionsOf = (txId: string) => {
  const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /txSubmission-/.test(f)).filter((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).txId === txId) : [];
};
async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; code: string; message: string }> {
  try {
    return { ok: true, value: await p };
  } catch (e: any) {
    return { ok: false, code: String(e?.code ?? "UNCODED"), message: String(e?.message ?? e).slice(0, 800) };
  }
}

beforeAll(async () => {
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  relay = await startCountingWsProxy(session.rpcUrl, 0);
  k = loadManagedKaspaWasmSync();
  ALICE = session.minerAddress;
  BOB = String(new k.PrivateKey(getHardkasFixtureKey("bob")).toPublicKey().toAddress("simnet").toString());
  CAROL = String(new k.PrivateKey(getHardkasFixtureKey("carol")).toPublicKey().toAddress("simnet").toString());
  const info: any = await session.rpc.getServerInfo();
  evidence.node = {
    rpcUrl: session.rpcUrl,
    relay: relay.url,
    containerName: session.containerName,
    image: process.env.HARDKAS_KASPAD_IMAGE ?? KASPAD_REFERENCE_IMAGE,
    identity: json(session.handle.identity ?? null),
    serverVersion: info.serverVersion,
    networkId: info.networkId,
    harnessRunId: process.env.HARDKAS_TEST_RUN_ID
  };
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rc1-r1-"));
  const init = spawnSync(process.execPath, [cliDist, "init", "app", "--network", "simnet", "--skip-toolchain", "--json"], { cwd: parent, encoding: "utf8", env: process.env, timeout: 180_000 });
  expect(init.status, `${init.stdout}\n${init.stderr}`).toBe(0);
  ws = path.join(parent, "app");
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: relay.url } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  const imp = spawnSync(process.execPath, [cliDist, "accounts", "real", "import", "--name", "alice", "--address", ALICE, "--private-key-env", "HK_RC1_R1_KEY", "--password-env", PW_ENV, "--json"], {
    cwd: ws,
    encoding: "utf8",
    env: { ...process.env, HK_RC1_R1_KEY: session.minerPrivateKey, [PW_ENV]: PASSWORD },
    timeout: 180_000
  });
  expect(imp.status, `${imp.stdout}\n${imp.stderr}`).toBe(0);
  sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
});

afterAll(async () => {
  evidence.finishedAt = new Date().toISOString();
  evidence.relay = relay ? { submitTransaction: submits(), methods: relay.methods.length } : undefined;
  const file = process.env.HARDKAS_TEST_R1_EVIDENCE || path.join(os.tmpdir(), `rc1-r1-send-sync-v0-mass-${Date.now()}.json`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(json(evidence), null, 2));
    console.log(`[rc1-r1] evidence written to ${file}`);
  } catch {
    /* diagnostic */
  }
  await sdk?.close?.();
  if (relay) await relay.close();
  if (session) await stopIsolatedSimnet(session);
  if (parent) fs.rmSync(parent, { recursive: true, force: true });
});

describe("RC1 · R1 · tx.send and a v0 payment against a real rusty-kaspad (simnet)", () => {
  const A: Record<string, any> = {};

  it("D3 · an unsynced node (fresh; old-timestamp blocks mature the coinbases): NODE_NOT_SYNCED with no submitTransaction, though the node itself takes one sent with allowUnsyncedNode; one current block later the same send goes out once", async () => {
    const fresh: any = await session.rpc.getServerInfo();
    record("fresh node", { isSynced: fresh.isSynced, virtualDaaScore: fresh.virtualDaaScore });
    expect(fresh.isSynced, "a fresh node with no miner says it is not synced").toBe(false);

    // old timestamps: DAA advances, coinbases mature, the node stays unsynced
    const dag0: any = await session.rpc.getBlockDagInfo();
    let ts = BigInt(headerOf(await session.rpc.call("getBlock", { hash: dag0.sink, includeTransactions: false }))?.timestamp ?? 0);
    for (let i = 1; i <= 1105; i++) {
      ts += 1000n;
      await mineOne(i <= 5 ? ALICE : BOB, ts);
    }
    const after: any = await session.rpc.getBlockDagInfo();
    record("1105 old-timestamp blocks", { virtualDaaScore: after.virtualDaaScore, isSynced: await isSynced() });
    expect(await isSynced()).toBe(false);

    // B · the explicit escape: sent to the unsynced node, which accepts it
    const planB: any = await sdk.tx.plan({ from: "alice", to: CAROL, amount: "0.5" });
    const signedB: any = await sdk.tx.sign(planB, { account: "alice", keystorePassword: PASSWORD });
    const before = submits();
    const sentB = await settle(sdk.tx.send(signedB, { allowUnsyncedNode: true }));
    expect(sentB.ok, JSON.stringify(sentB)).toBe(true);
    expect((sentB as any).value?.submitted, JSON.stringify(sentB)).toBe(true);
    expect(submits() - before, "the escape sent it once").toBe(1);
    expect(heldOf(await mempoolEntry(signedB.txId)), "the unsynced node took it into its mempool").toBeDefined();
    record("B allowUnsyncedNode on the unsynced node", { txId: signedB.txId, isSynced: await isSynced(), submitTransaction: submits() - before });

    // A · the default: refused before anything is sent
    const planA: any = await sdk.tx.plan({ from: "alice", to: BOB, amount: "1" });
    const signedA: any = await sdk.tx.sign(planA, { account: "alice", keystorePassword: PASSWORD });
    const inputsOf = (p: any) => p.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
    expect(inputsOf(planA).some((o: string) => inputsOf(planB).includes(o)), "A and B spend different UTXOs").toBe(false);
    Object.assign(A, { plan: planA, signed: signedA });
    const beforeA = submits();
    const refused = await settle(sdk.tx.send(signedA));
    expect(refused.ok, JSON.stringify(refused)).toBe(false);
    expect((refused as any).code).toBe("NODE_NOT_SYNCED");
    expect(submits() - beforeA, "no submitTransaction at the wire").toBe(0);
    expect(heldOf(await mempoolEntry(signedA.txId)), "the node does not hold A").toBeUndefined();
    expect(submissionsOf(signedA.txId), "nothing recorded").toEqual([]);
    record("A refused on the unsynced node", { txId: signedA.txId, code: (refused as any).code, message: (refused as any).message, submitTransaction: submits() - beforeA });

    // one block with the node's own (current) timestamp
    await mineOne(BOB);
    expect(await isSynced(), "synced right after a current block").toBe(true);
    const beforeSend = submits();
    const sent = await settle(sdk.tx.send(signedA));
    expect(sent.ok, JSON.stringify(sent)).toBe(true);
    expect((sent as any).value?.submitted, JSON.stringify(sent)).toBe(true);
    expect(String((sent as any).value?.txId).toLowerCase()).toBe(String(signedA.txId).toLowerCase());
    expect(submits() - beforeSend, "sent once").toBe(1);
    expect(submissionsOf(signedA.txId).length, "one submission recorded").toBe(1);
    record("A sent once the node is synced", { txId: signedA.txId, isSynced: true, submitTransaction: submits() - beforeSend });
  });

  it("D1 · the v0 payment commits storage mass 0; the node holds and mines HardKAS's computed value under the same txid; the output holds exactly the amount planned", async () => {
    expect(A.signed, "the D3 case sent A").toBeDefined();
    const { plan, signed } = A;
    const payload = payloadOf(signed);
    const committed = massOf(payload);
    const computed = BigInt(
      calculateUpstreamStorageMass(
        (plan.inputs as any[]).map((i) => BigInt(i.amountSompi)),
        (payload.outputs as any[]).map((o) => BigInt(o.value ?? o.amount)),
        "simnet"
      )
    );
    expect(Number(payload.version)).toBe(0);
    expect(committed, "the signed v0 transaction commits storage mass 0").toBe(0n);
    expect(computed).toBeGreaterThan(0n);
    expect(officialTxIdOf({ ...payload, storageMass: String(computed) }), "the id does not cover the field").toBe(signed.txId);

    const held = heldOf(await mempoolEntry(signed.txId));
    expect(held, "in the node's mempool").toBeDefined();
    const heldMass = massOf(held.transaction);
    const heldFee = held.fee !== undefined ? BigInt(held.fee) : undefined;
    expect(heldMass, "the node holds HardKAS's computed storage mass").toBe(computed);
    expect(heldFee, "the node's fee is the plan's").toBe(BigInt(plan.estimatedFeeSompi));

    // mined: the accepting chain block (the SDK observer), the block that carries A, and the output at bob
    let derived: any;
    for (let round = 0; round < 10; round++) {
      await mineOne(BOB);
      derived = (await sdk.tx.observe(signed.txId)).derived;
      if (["ACCEPTED", "CONFIRMED", "FINALIZED"].includes(derived.status)) break;
    }
    expect(derived?.status, JSON.stringify(derived)).toMatch(/ACCEPTED|CONFIRMED/);
    const accepting = String(derived.acceptingBlockHash);
    const acceptingBlock: any = await session.rpc.call("getBlock", { hash: accepting, includeTransactions: false });
    const acceptingDaa = BigInt(headerOf(acceptingBlock).daaScore);
    let mined: any;
    let carrier = "";
    for (const h of (verboseOf(acceptingBlock)?.mergeSetBluesHashes ?? []) as string[]) {
      const b: any = await session.rpc.call("getBlock", { hash: h, includeTransactions: true });
      const txs: any[] = b?.block?.transactions ?? b?.transactions ?? [];
      mined = txs.find((t) => String(t?.verboseData?.transactionId ?? "").toLowerCase() === String(signed.txId).toLowerCase());
      if (mined) {
        carrier = h;
        break;
      }
    }
    expect(mined, "a block merged by the accepting block carries A").toBeDefined();
    expect(massOf(mined), "mined with HardKAS's computed storage mass").toBe(computed);

    const paid = (await session.rpc.getUtxosByAddress(BOB)).filter((u: any) => String(u.outpoint.transactionId).toLowerCase() === String(signed.txId).toLowerCase());
    expect(paid.map((u: any) => String(u.amountSompi)), "exactly the amount planned").toEqual(["100000000"]);
    expect(BigInt(paid[0].blockDaaScore ?? paid[0].raw?.utxoEntry?.blockDaaScore), "the output's DAA score is the accepting block's").toBe(acceptingDaa);

    record("D1 v0 storage mass", {
      txId: signed.txId,
      planFeeSompi: plan.estimatedFeeSompi,
      committedStorageMass: committed,
      computedStorageMass: computed,
      node: { heldStorageMass: heldMass, heldFeeSompi: heldFee, minedStorageMass: massOf(mined), carrierBlock: carrier, acceptingBlock: accepting, acceptingDaaScore: acceptingDaa },
      output: paid.map((u: any) => ({ outpoint: `${u.outpoint.transactionId}:${u.outpoint.index}`, amountSompi: String(u.amountSompi), blockDaaScore: String(u.blockDaaScore ?? "") })),
      divergence: "v0 commits 0; the node holds and mines HardKAS's computed value; same txid (documented; the v0 format is kept)"
    });
  });
});
