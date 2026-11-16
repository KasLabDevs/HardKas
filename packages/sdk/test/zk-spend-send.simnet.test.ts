import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, type IsolatedSimnetSession } from "../../testing/src/index.js";
import { Hardkas, buildR0Groth16Scripts } from "../src/index.js";

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 });

// -----------------------------------------------------------------------------
// ZK-SEND-1 on a real rusty-kaspad v2.1.0 (simnet, the harness's own node): a RISC Zero Groth16 lock is funded and SPENT
// THROUGH HARDKAS — sdk.experimental.zk.toccata.spend (plan, signed artifact, fact, then sdk.tx.send: node identity, synced node, the
// v1 preflight with the lock's supplied unlock, one submission per txId) and `hardkas zk toccata spend` — for both lock
// modes and both receipts (the public kaspa-python-sdk vector and HardKAS's own). The Testnet-10 runs of 13-nov had to
// submit the builder's transaction with the raw RPC client. Refusals on the same node: a lock verify-scripts refuses and a
// destination of another network send nothing (the UTXO stays unspent, no submission is recorded); mainnet is refused
// before any node. `zk toccata observe` reads the accepted spend and its ZK status.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const cliDist = path.join(repoRoot, "packages", "cli", "dist", "index.js");
const VECTORS = [
  { name: "official", dir: "r0-groth16-official" },
  { name: "hardkas", dir: "r0-groth16-hardkas" }
] as const;
const PAYOUT = 100_000_000n;

let session: IsolatedSimnetSession;
let sdk: Hardkas;
let parent = "";
let ws = "";
let k: any;
let payee = "";
let tn10Payee = "";
const spent = new Set<string>();
const log = (m: string) => console.log(`[zk-spend-send] ${m}`);

const fixture = (dir: string) => {
  const d = path.join(repoRoot, "fixtures", "toccata-v2", "zk", dir);
  return {
    receiptPath: path.join(d, "receipt.hex"),
    imageId: JSON.parse(fs.readFileSync(path.join(d, "image-id.json"), "utf8")).imageId as string,
    journalHash: JSON.parse(fs.readFileSync(path.join(d, "journal.json"), "utf8")).journalHash as string,
    receiptHex: fs.readFileSync(path.join(d, "receipt.hex"), "utf8").trim()
  };
};
const utxosOf = async (address: string): Promise<any[]> => (((await session.rpc.call("getUtxosByAddressesRequest", { addresses: [address] })) as any).entries ?? []);
const submissionFiles = () => {
  const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /txSubmission/.test(f)) : [];
};

/** Locks `amount` at `p2sh` from a mature miner UTXO (a hand-made v0 payment: test setup, not the path under test). */
async function fund(p2sh: string, amount: bigint): Promise<string> {
  const dag: any = await session.rpc.call("getBlockDagInfoRequest", {});
  const daa = BigInt(dag.virtualDaaScore);
  const u = (await utxosOf(session.minerAddress)).find(
    (e: any) =>
      !spent.has(`${e.outpoint.transactionId}:${e.outpoint.index}`) &&
      BigInt(e.utxoEntry.amount) >= amount + 10_000_000n &&
      (!e.utxoEntry.isCoinbase || BigInt(e.utxoEntry.blockDaaScore) + 1000n <= daa)
  );
  if (!u) throw new Error("no mature miner UTXO");
  spent.add(`${u.outpoint.transactionId}:${u.outpoint.index}`);
  const minerSpk = k.payToAddressScript(new k.Address(session.minerAddress));
  const p2shSpk = k.payToAddressScript(new k.Address(p2sh));
  const fee = 1_000_000n;
  const tx = new k.Transaction({
    version: 0,
    inputs: [
      {
        previousOutpoint: u.outpoint, signatureScript: "", sequence: 0n, sigOpCount: 1,
        utxo: { outpoint: u.outpoint, amount: BigInt(u.utxoEntry.amount), scriptPublicKey: new k.ScriptPublicKey(0, u.utxoEntry.scriptPublicKey.slice(4)), blockDaaScore: BigInt(u.utxoEntry.blockDaaScore), isCoinbase: u.utxoEntry.isCoinbase }
      }
    ],
    outputs: [
      { value: amount, scriptPublicKey: new k.ScriptPublicKey(p2shSpk.version, p2shSpk.script) },
      { value: BigInt(u.utxoEntry.amount) - amount - fee, scriptPublicKey: new k.ScriptPublicKey(minerSpk.version, minerSpk.script) }
    ],
    lockTime: 0n, subnetworkId: "00".repeat(20), gas: 0n, payload: "", storageMass: 0n
  });
  const res: any = await session.rpc.submitTransaction(k.signTransaction(tx, [new k.PrivateKey(session.minerPrivateKey)], true));
  await mineBlocks(session, 2);
  const txId = String(res.transactionId);
  expect((await utxosOf(p2sh)).some((e: any) => e.outpoint.transactionId === txId), `funding ${txId} at ${p2sh}`).toBe(true);
  return txId;
}

interface Run {
  exit: number | null;
  stdout: string;
  stderr: string;
}
/** The CLI in the workspace; while it runs, one block every 400 ms when `mine` (so `--wait` can see an acceptance). */
async function cli(args: string[], mine = false): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd: ws, env: process.env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let done = false;
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    const timer = setTimeout(() => child.kill(), 300_000);
    const miner = async () => {
      while (mine && !done) {
        await new Promise((r) => setTimeout(r, 400));
        if (!done) await mineBlocks(session, 1).catch(() => undefined);
      }
    };
    void miner();
    child.on("close", (exit) => {
      done = true;
      clearTimeout(timer);
      resolve({ exit, stdout, stderr });
    });
    child.stdin.end();
  });
}
const envelope = (r: Run): any => {
  const text = r.stdout.trim();
  try {
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return undefined;
  }
};
const brief = (r: Run) => JSON.stringify({ exit: r.exit, stdout: r.stdout.slice(-1500), stderr: r.stderr.slice(-800) });
const NODE = () => ["--network", "simnet", "--url", session.rpcUrl, "--json"];

beforeAll(async () => {
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  k = loadManagedKaspaWasmSync();
  payee = new k.PrivateKey("44".repeat(32)).toAddress("simnet").toString();
  tn10Payee = new k.PrivateKey("44".repeat(32)).toAddress("testnet-10").toString();
  // coinbases mature after 1000 DAA (simnet): every funding below takes its own
  await mineBlocks(session, 1030, session.minerAddress);
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-zk-send-"));
  const init = spawnSync(process.execPath, [cliDist, "init", "app", "--network", "simnet", "--skip-toolchain", "--json"], { cwd: parent, encoding: "utf8", env: process.env, timeout: 180_000 });
  expect(init.status, `${init.stdout}\n${init.stderr}`).toBe(0);
  ws = path.join(parent, "app");
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: session.rpcUrl } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
});

afterAll(async () => {
  await sdk?.close?.();
  if (session) await stopIsolatedSimnet(session);
  if (parent) fs.rmSync(parent, { recursive: true, force: true });
});

describe.each(VECTORS)("ZK-SEND-1 · a ZK lock spent through HardKAS on a real rusty-kaspad (simnet), $name receipt", ({ dir }) => {
  const fx = fixture(dir);

  it("SDK, proof-only: sdk.experimental.zk.toccata.spend sends the spend once (plan, signed, fact, one submission); the node pays out; a second spend of it is not sent again", async () => {
    const scripts = buildR0Groth16Scripts({ imageId: fx.imageId, journalHash: fx.journalHash, receiptHex: fx.receiptHex });
    expect(scripts.ok, JSON.stringify(scripts.issues)).toBe(true);
    const amount = 200_000_000n;
    const f = await fund(scripts.p2shAddresses.simnet, amount);
    const before = submissionFiles().length;
    const r = await sdk.experimental.zk.toccata.spend({ scripts, utxo: { transactionId: f, index: 0 }, destinationAddress: payee });
    log(`proof-only ${r.txId} submitted=${r.send.submitted} fee ${r.built.feeSompi} storageMass ${(r.plan as any).storageMass}`);
    expect(r.send.submitted, JSON.stringify((r.send as any).submission?.submitResult)).toBe(true);
    expect(r.txId).toBe(r.built.transactionId);
    expect(submissionFiles().length).toBe(before + 1);
    const submission: any = r.send.submission;
    expect(submission.schema).toBe("hardkas.txSubmission.v1");
    expect(submission.signedArtifactId).toBe((r.signed as any).contentHash);
    expect(submission.preflight?.inputs).toBe(1);
    expect(fs.existsSync(r.planPath!) && fs.existsSync(r.signedPath!) && fs.existsSync(r.zkFactPath!)).toBe(true);
    await mineBlocks(session, 2);
    const paid = (await utxosOf(payee)).find((e: any) => e.outpoint.transactionId === r.txId);
    expect(paid, "the payout").toBeDefined();
    expect(BigInt(paid.utxoEntry.amount)).toBe(amount - r.built.feeSompi);
    // one submission per txId: the same spend again (its amount given: the UTXO is spent) is the recorded one
    const again = await sdk.experimental.zk.toccata.spend({ scripts, utxo: { transactionId: f, index: 0, amountSompi: amount }, destinationAddress: payee });
    expect(again.txId).toBe(r.txId);
    expect((again.send as any).alreadySubmitted, JSON.stringify(again.send)).toBe(true);
    expect(submissionFiles().length).toBe(before + 1);
  });

  it("SDK, proof-and-output-bound: the bound spend pays exactly the bound payout, consensus-enforced", async () => {
    const scripts = buildR0Groth16Scripts({
      imageId: fx.imageId,
      journalHash: fx.journalHash,
      receiptHex: fx.receiptHex,
      bindingPolicy: { mode: "proof-and-output-bound", payout: { address: payee, amountSompi: PAYOUT } }
    });
    expect(scripts.ok, JSON.stringify(scripts.issues)).toBe(true);
    const f = await fund(scripts.p2shAddresses.simnet, scripts.requiredFundingSompi!);
    const r = await sdk.experimental.zk.toccata.spend({ scripts, utxo: { transactionId: f, index: 0 } });
    log(`bound ${r.txId} submitted=${r.send.submitted} fee ${r.built.feeSompi}`);
    expect(r.send.submitted, JSON.stringify((r.send as any).submission?.submitResult)).toBe(true);
    expect(r.built.consensusEnforced).toBe(true);
    expect((r.plan as any).outputs).toEqual([{ address: payee, amountSompi: String(PAYOUT), role: "payment" }]);
    await mineBlocks(session, 2);
    const paid = (await utxosOf(payee)).find((e: any) => e.outpoint.transactionId === r.txId);
    expect(paid && BigInt(paid.utxoEntry.amount)).toBe(PAYOUT);
    expect((await utxosOf(scripts.p2shAddresses.simnet)).some((e: any) => e.outpoint.transactionId === f)).toBe(false);
  });

  it("CLI, proof-only from the build-scripts record: refusals send nothing (a record verify-scripts refuses, a destination of another network, mainnet); then `zk toccata spend --wait` sends it and the node accepts it", async () => {
    const build = await cli(["zk", "toccata", "build-scripts", "--image-id", fx.imageId, "--journal-hash", fx.journalHash, "--receipt", fx.receiptPath, "--json"]);
    expect(build.exit, brief(build)).toBe(0);
    const record = envelope(build);
    expect(record?.ok).toBe(true);
    const recordPath = path.join(parent, `${dir}-proof-only.json`);
    fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));
    const f = await fund(record.p2shAddresses.simnet, 200_000_000n);
    const before = submissionFiles().length;
    const stillLocked = async () => (await utxosOf(record.p2shAddresses.simnet)).some((e: any) => e.outpoint.transactionId === f);

    // a lock verify-scripts refuses: one byte of the redeem script changed
    const tampered = { ...record, redeemScript: record.redeemScript.slice(0, 400) + (record.redeemScript[400] === "0" ? "1" : "0") + record.redeemScript.slice(401) };
    const tamperedPath = path.join(parent, `${dir}-tampered.json`);
    fs.writeFileSync(tamperedPath, JSON.stringify(tampered, null, 2));
    const refusedLock = await cli(["zk", "toccata", "spend", "--receipt", fx.receiptPath, "--scripts", tamperedPath, "--utxo", `${f}:0`, "--to", payee, ...NODE()]);
    expect(envelope(refusedLock)?.code, brief(refusedLock)).toBe("ZK_SPEND_LOCK_REFUSED");
    expect(refusedLock.exit).not.toBe(0);
    // a destination of another network
    const refusedNet = await cli(["zk", "toccata", "spend", "--receipt", fx.receiptPath, "--scripts", recordPath, "--utxo", `${f}:0`, "--to", tn10Payee, ...NODE()]);
    expect(envelope(refusedNet)?.code, brief(refusedNet)).toBe("ZK_SPEND_BUILD_REFUSED");
    // mainnet, before any node
    const refusedMain = await cli(["zk", "toccata", "spend", "--receipt", fx.receiptPath, "--scripts", recordPath, "--utxo", `${f}:0`, "--to", payee, "--network", "mainnet", "--json"]);
    expect(envelope(refusedMain)?.code, brief(refusedMain)).toBe("MAINNET_BROADCAST_DISABLED");
    expect(submissionFiles().length, "nothing was recorded").toBe(before);
    expect(await stillLocked(), "nothing was spent").toBe(true);

    const sent = await cli(["zk", "toccata", "spend", "--receipt", fx.receiptPath, "--scripts", recordPath, "--utxo", `${f}:0`, "--to", payee, "--wait", "--timeout", "120", ...NODE()], true);
    const out = envelope(sent);
    log(`CLI proof-only: ${brief(sent).slice(0, 600)}`);
    expect(sent.exit, brief(sent)).toBe(0);
    expect(out?.outcome).toBe("submitted");
    expect(out?.wait?.status).toBe("accepted");
    expect(submissionFiles().length).toBe(before + 1);
    const paid = (await utxosOf(payee)).find((e: any) => e.outpoint.transactionId === out.txId);
    expect(paid && BigInt(paid.utxoEntry.amount)).toBe(200_000_000n - BigInt(out.feeSompi));
  });

  it("CLI, proof-and-output-bound from its parameters: `zk toccata spend` pays the bound payout; `zk toccata observe` reads it accepted with its ZK status", async () => {
    const scripts = buildR0Groth16Scripts({
      imageId: fx.imageId,
      journalHash: fx.journalHash,
      receiptHex: fx.receiptHex,
      bindingPolicy: { mode: "proof-and-output-bound", payout: { address: payee, amountSompi: PAYOUT } }
    });
    const f = await fund(scripts.p2shAddresses.simnet, scripts.requiredFundingSompi!);
    const sent = await cli([
      "zk", "toccata", "spend", "--receipt", fx.receiptPath, "--image-id", fx.imageId, "--journal-hash", fx.journalHash,
      "--mode", "proof-and-output-bound", "--payout-address", payee, "--payout-amount", String(PAYOUT), "--utxo", `${f}:0`, ...NODE()
    ]);
    const out = envelope(sent);
    expect(sent.exit, brief(sent)).toBe(0);
    expect(out?.outcome).toBe("submitted");
    expect(out?.consensusEnforced).toBe(true);
    await mineBlocks(session, 3);
    const paid = (await utxosOf(payee)).find((e: any) => e.outpoint.transactionId === out.txId);
    expect(paid && BigInt(paid.utxoEntry.amount)).toBe(PAYOUT);
    const seen = await cli(["zk", "toccata", "observe", out.txId, ...NODE()]);
    const look = envelope(seen);
    log(`observe: ${brief(seen).slice(0, 600)}`);
    expect(seen.exit, brief(seen)).toBe(0);
    expect(["ACCEPTED", "CONFIRMED", "FINALIZED"]).toContain(look?.state);
    expect(look?.zkFact?.artifactId).toBe(out.zkFact.artifactId);
    expect(look?.zkStatus).toBeDefined();
  });
});
