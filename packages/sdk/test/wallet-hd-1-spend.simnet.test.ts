import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { getHardkasFixtureKey, mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, waitForTransaction, type IsolatedSimnetSession } from "../../testing/src/index.js";
import { Hardkas, HardkasHdWallets } from "../src/index.js";

vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 });

// -----------------------------------------------------------------------------
// WALLET-HD-1 · an HD wallet that receives AND spends, end to end against a real rusty-kaspad v2.1.0 (the isolated
// simnet harness's own node; never the machine's localnet):
//   1. a wallet is created (random 24-word phrase, encrypted keystore in a temp workspace);
//   2. it receives on two receive addresses (receive[0], receive[1]) from the miner's fixture account;
//   3. the gap-limit scan finds both; one payment needs BOTH UTXOs: it is planned by the payment planner over the
//      wallet's UTXOs, signed per input with each address's own key, sent through sdk.tx.send, accepted and mined; the
//      change goes to the wallet's first change address;
//   4. the phrase recovers the wallet in a FRESH temp workspace: the same balance, found by the scan (change chain
//      included), and the recovered wallet spends the change output (a change-chain key) with its change to change[1].
// Throwaway wallets only; the phrase is never printed (compared as a boolean, kept in memory).
// -----------------------------------------------------------------------------

const PW = `hd1-${process.pid}-password`;
const KEY_ENV = "HK_HD1_ALICE_KEY";
const FAST = { memory: 19_456, iterations: 2, parallelism: 1 };
const KAS = 100_000_000n;

let session: IsolatedSimnetSession;
let k: any;
let ALICE = "";
let BOB = "";
let CAROL = "";
const made: string[] = [];
const sdks: Hardkas[] = [];

function workspace(label: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-hd1-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"), { recursive: true });
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: session.rpcUrl } },
    accounts: { alice: { kind: "kaspa", network: "simnet", address: ALICE, privateKeyEnv: KEY_ENV } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  return ws;
}

async function open(ws: string): Promise<Hardkas> {
  const sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
  sdks.push(sdk);
  return sdk;
}

async function pay(sdk: Hardkas, to: string, amount: string): Promise<string> {
  const plan: any = await sdk.tx.plan({ from: "alice", to, amount });
  const signed: any = await sdk.tx.sign(plan, { account: "alice" });
  const sent: any = await sdk.tx.send(signed);
  expect(sent.submitted, JSON.stringify(sent).slice(0, 500)).toBe(true);
  return String(signed.txId);
}

const utxosAt = async (address: string) => (await session.rpc.getUtxosByAddress(address)) as any[];
const sum = (us: any[]) => us.reduce((s, u) => s + BigInt(u.amountSompi), 0n);

beforeAll(async () => {
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  process.env[KEY_ENV] = session.minerPrivateKey;
  k = loadManagedKaspaWasmSync();
  ALICE = session.minerAddress;
  BOB = String(new k.PrivateKey(getHardkasFixtureKey("bob")).toPublicKey().toAddress("simnet").toString());
  CAROL = String(new k.PrivateKey(getHardkasFixtureKey("carol")).toPublicKey().toAddress("simnet").toString());
  // alice's coinbases mature (simnet coinbase maturity 1000 DAA + HardKAS's 10-DAA margin); the blocks carry the node's
  // current time, so the node says it is synced (tx.send requires it)
  await mineBlocks(session, 5, ALICE);
  await mineBlocks(session, 1020, BOB);
});

afterAll(async () => {
  delete process.env[KEY_ENV];
  for (const sdk of sdks) await sdk.close?.();
  if (session) await stopIsolatedSimnet(session);
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("WALLET-HD-1 · an HD wallet receives on two addresses, spends from both, and is recovered from its phrase (real rusty-kaspad, simnet)", () => {
  const S: Record<string, any> = {};

  it("create; receive on receive[0] and receive[1]; the gap-limit scan finds both", async () => {
    const ws = workspace("a");
    const sdk = await open(ws);
    const hd = new HardkasHdWallets(sdk, { kdf: FAST });
    const w = await hd.manager.create({ label: "hd1", network: "simnet", password: PW });
    expect(w.mnemonicWords).toBe(24);
    const r0 = await hd.manager.receiveAddress("hd1", { password: PW });
    const r1 = await hd.manager.receiveAddress("hd1", { password: PW });
    expect([r0.index, r1.index, r0.verified]).toEqual([0, 1, true]);
    expect(r0.address).toMatch(/^kaspasim:/);

    const t0 = await pay(sdk, r0.address, "3");
    const t1 = await pay(sdk, r1.address, "2");
    await mineBlocks(session, 1, BOB);
    await waitForTransaction(session, r0.address, t0, 60_000);
    await waitForTransaction(session, r1.address, t1, 60_000);

    const scan = await hd.scan("hd1", { password: PW });
    expect(scan.verified).toBe(true);
    expect(scan.used.map((u) => `${u.chain}/${u.index}`)).toEqual(["receive/0", "receive/1"]);
    expect(scan.used.map((u) => u.address)).toEqual([r0.address, r1.address]);
    expect(scan.totalSompi).toBe(5n * KAS);
    expect(scan.nextReceive).toBe(2);
    expect(scan.nextChange).toBe(0);
    expect(scan.scanned.receive).toBe(2 + scan.gapLimit);
    expect(scan.scanned.change).toBe(scan.gapLimit);
    // without the password: the same addresses from the header, unverified
    const unverified = await hd.scan("hd1");
    expect(unverified.verified).toBe(false);
    expect(unverified.totalSompi).toBe(5n * KAS);
    Object.assign(S, { ws, sdk, hd, r0, r1 });
  });

  it("one payment needs both UTXOs: planned over the wallet, each input signed by its own key, sent, mined; change to change[0]", async () => {
    const { hd, r0, r1 } = S;
    const carolBefore = sum(await utxosAt(CAROL));
    const out = await hd.send("hd1", { to: CAROL, amount: "4", password: PW });
    expect(out.sent.submitted, JSON.stringify(out.sent).slice(0, 600)).toBe(true);
    expect(out.plan.schema).toBe("hardkas.txPlan");
    expect((out.plan as any).plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    expect(new Set(out.inputs.map((i) => i.address))).toEqual(new Set([r0.address, r1.address]));
    expect(out.inputs.every((i) => i.chain === "receive")).toBe(true);
    const change0 = await hd.manager.changeAddress("hd1", { index: 0, password: PW });
    expect(out.change.address).toBe(change0.address);
    expect(out.change.index).toBe(0);
    expect(out.change.amountSompi).toBeGreaterThan(0n);
    const fee = BigInt((out.plan as any).estimatedFeeSompi);
    expect(out.change.amountSompi).toBe(5n * KAS - 4n * KAS - fee);
    // the signed transaction spends exactly the planned inputs
    let tx: any = JSON.parse((out.signed as any).signedTransaction.payload);
    while (typeof tx === "string") tx = JSON.parse(tx);
    expect(tx.inputs).toHaveLength(2);

    await mineBlocks(session, 1, BOB);
    await waitForTransaction(session, change0.address, String(out.signed.txId), 60_000);
    const carolGot = (await utxosAt(CAROL)).filter((u) => String(u.outpoint.transactionId).toLowerCase() === String(out.signed.txId).toLowerCase());
    expect(carolGot.map((u) => BigInt(u.amountSompi))).toEqual([4n * KAS]);
    expect(sum(await utxosAt(CAROL)) - carolBefore).toBe(4n * KAS);
    expect(await utxosAt(r0.address)).toEqual([]);
    expect(await utxosAt(r1.address)).toEqual([]);
    expect(sum(await utxosAt(change0.address))).toBe(out.change.amountSompi);
    // the change index is recorded as used: the next payment changes to a fresh address
    expect(hd.manager.describe("hd1").accounts[0]).toMatchObject({ nextReceive: 2, nextChange: 1 });
    const after = await hd.scan("hd1", { password: PW });
    // BETA-FIX W2: every handed-out address stays listed (the emptied receive addresses with zero balance)
    expect(after.used.map((u) => `${u.chain}/${u.index}/${u.balanceSompi > 0n ? "funded" : "empty"}`)).toEqual(["receive/0/empty", "receive/1/empty", "change/0/funded"]);
    expect(after.used.filter((u) => u.utxoCount > 0).map((u) => `${u.chain}/${u.index}`)).toEqual(["change/0"]);
    expect(after.totalSompi).toBe(out.change.amountSompi);
    Object.assign(S, { change0, changeSompi: out.change.amountSompi, phrase: await hd.manager.revealMnemonic("hd1", { password: PW }) });
  });

  it("recovery: the phrase in a FRESH workspace sees the same balance (found on the change chain by the scan) and spends it, change to change[1]", async () => {
    const { change0, changeSompi, phrase } = S;
    const ws2 = workspace("recovered");
    expect(fs.existsSync(path.join(ws2, ".hardkas", "wallets"))).toBe(false);
    const sdk2 = await open(ws2);
    const hd2 = new HardkasHdWallets(sdk2, { kdf: FAST });
    const rec = await hd2.manager.importMnemonic({ label: "recovered", network: "simnet", mnemonic: phrase, password: "another-password-2" });
    expect(rec.accounts[0]!.xpub === S.hd.manager.describe("hd1").accounts[0].xpub).toBe(true);
    expect(rec.accounts[0]).toMatchObject({ nextReceive: 0, nextChange: 0 });
    const scan = await hd2.scan("recovered", { password: "another-password-2" });
    expect(scan.used.map((u) => `${u.chain}/${u.index}`)).toEqual(["change/0"]);
    expect(scan.used[0]!.address).toBe(change0.address);
    expect(scan.totalSompi).toBe(changeSompi);
    expect(scan.nextChange).toBe(1);

    const out = await hd2.send("recovered", { to: CAROL, amount: "0.5", password: "another-password-2" });
    expect(out.sent.submitted, JSON.stringify(out.sent).slice(0, 600)).toBe(true);
    expect(out.inputs.map((i) => `${i.chain}/${i.addressIndex}`)).toEqual(["change/0"]);
    expect(out.change.index).toBe(1);
    expect(out.change.address).not.toBe(change0.address);
    await mineBlocks(session, 1, BOB);
    await waitForTransaction(session, out.change.address, String(out.signed.txId), 60_000);
    expect(await utxosAt(change0.address)).toEqual([]);
    const fee = BigInt((out.plan as any).estimatedFeeSompi);
    expect(sum(await utxosAt(out.change.address))).toBe(changeSompi - KAS / 2n - fee);
    // the original wallet (other workspace) sees the same chain state
    const original = await S.hd.scan("hd1", { password: PW });
    // BETA-FIX W2: hd1's own index handed out receive 0..1 and change 0 (all emptied now); change 1 is found by the scan
    expect(original.used.map((u: any) => `${u.chain}/${u.index}/${u.handedOut ? "index" : "scan"}`)).toEqual(["receive/0/index", "receive/1/index", "change/0/index", "change/1/scan"]);
    expect(original.used.filter((u: any) => u.utxoCount > 0).map((u: any) => `${u.chain}/${u.index}`)).toEqual(["change/1"]);
    expect(original.totalSompi).toBe(changeSompi - KAS / 2n - fee);
  });

  it("refusals on the node network: a wallet of another network, a wrong password, more than the wallet holds", async () => {
    const { hd } = S;
    await hd.manager.create({ label: "devnet-wallet", network: "devnet", password: PW });
    await expect(hd.scan("devnet-wallet")).rejects.toMatchObject({ code: "HD_WALLET_NETWORK_MISMATCH" });
    await expect(hd.send("hd1", { to: CAROL, amount: "0.1", password: "wrong-password" })).rejects.toMatchObject({ code: "HD_WALLET_UNLOCK_FAILED" });
    await expect(hd.send("hd1", { to: CAROL, amount: "1000", password: PW })).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS_UPSTREAM" });
  });
});
