import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { getHardkasFixtureKey, mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, waitForTransaction, type IsolatedSimnetSession } from "../../testing/src/index.js";
import { Hardkas } from "../../sdk/src/index.js";
import { cliDist } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 });

// -----------------------------------------------------------------------------
// WALLET-HD-1 · the `hardkas wallet hd` commands end to end against a real rusty-kaspad v2.1.0 (the isolated simnet
// harness's own node): create, two receive addresses, balance (gap-limit scan), send from both addresses with change to
// the first change address, balance again. The funding comes from the miner's fixture account through the SDK.
// Throwaway wallet in a temp workspace; the password comes from an environment variable; nothing secret is printed.
// -----------------------------------------------------------------------------

const PW = `hd1-cli-${process.pid}-pw`;
const KEY_ENV = "HK_HD1_CLI_ALICE_KEY";
const KAS = 100_000_000n;

let session: IsolatedSimnetSession;
let sdk: Hardkas;
let ws = "";
let ALICE = "";
let BOB = "";
let CAROL = "";

function cli(args: string[]): Promise<{ exit: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd: ws, env: { ...process.env, HK_HD1_PW: PW }, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 300_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (exit) => {
      clearTimeout(timer);
      resolve({ exit, stdout, stderr });
    });
    child.stdin.end();
  });
}
const json = (s: string) => JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
const brief = (r: { exit: number | null; stdout: string; stderr: string }) => JSON.stringify({ exit: r.exit, stdout: r.stdout.slice(-800), stderr: r.stderr.slice(-500) });

async function fund(to: string, amount: string): Promise<string> {
  const plan: any = await sdk.tx.plan({ from: "alice", to, amount });
  const signed: any = await sdk.tx.sign(plan, { account: "alice" });
  const sent: any = await sdk.tx.send(signed);
  expect(sent.submitted).toBe(true);
  return String(signed.txId);
}

beforeAll(async () => {
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  process.env[KEY_ENV] = session.minerPrivateKey;
  const k = loadManagedKaspaWasmSync();
  ALICE = session.minerAddress;
  BOB = String(new k.PrivateKey(getHardkasFixtureKey("bob")).toPublicKey().toAddress("simnet").toString());
  CAROL = String(new k.PrivateKey(getHardkasFixtureKey("carol")).toPublicKey().toAddress("simnet").toString());
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-hd1-cli-sim-"));
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: session.rpcUrl } },
    accounts: { alice: { kind: "kaspa", network: "simnet", address: ALICE, privateKeyEnv: KEY_ENV } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  await mineBlocks(session, 5, ALICE);
  await mineBlocks(session, 1020, BOB);
  sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
});

afterAll(async () => {
  delete process.env[KEY_ENV];
  await sdk?.close?.();
  if (session) await stopIsolatedSimnet(session);
  if (ws) fs.rmSync(ws, { recursive: true, force: true });
});

describe("WALLET-HD-1 · hardkas wallet hd on a real rusty-kaspad (simnet)", () => {
  it("create → two receive addresses → balance → send from both (change to change[0]) → balance", async () => {
    const created = await cli(["wallet", "hd", "create", "--name", "cli1", "--password-env", "HK_HD1_PW", "--json"]);
    expect(created.exit, brief(created)).toBe(0);
    const a0 = json((await cli(["wallet", "hd", "address", "cli1", "--password-env", "HK_HD1_PW", "--json"])).stdout);
    const a1 = json((await cli(["wallet", "hd", "address", "cli1", "--password-env", "HK_HD1_PW", "--json"])).stdout);
    expect([a0.index, a1.index]).toEqual([0, 1]);
    expect(a0.address).toBe(json(created.stdout).firstReceiveAddress);

    const t0 = await fund(a0.address, "3");
    const t1 = await fund(a1.address, "2");
    await mineBlocks(session, 1, BOB);
    await waitForTransaction(session, a0.address, t0, 60_000);
    await waitForTransaction(session, a1.address, t1, 60_000);

    const b = await cli(["wallet", "hd", "balance", "cli1", "--json"]);
    expect(b.exit, brief(b)).toBe(0);
    const bal = json(b.stdout);
    expect(bal.totalSompi).toBe(String(5n * KAS));
    expect(bal.used.map((u: any) => `${u.chain}/${u.index}`)).toEqual(["receive/0", "receive/1"]);
    expect(bal.verified).toBe(false);

    const s = await cli(["wallet", "hd", "send", "cli1", "--to", CAROL, "--amount", "4", "--password-env", "HK_HD1_PW", "--json"]);
    expect(s.exit, brief(s)).toBe(0);
    const sent = json(s.stdout);
    expect(sent.submitted, brief(s)).toBe(true);
    expect(new Set(sent.inputs.map((i: any) => i.address))).toEqual(new Set([a0.address, a1.address]));
    expect(sent.change.index).toBe(0);
    expect(sent.change.path).toBe("m/44'/111111'/0'/1/0");
    expect(BigInt(sent.change.amountSompi)).toBe(5n * KAS - 4n * KAS - BigInt(sent.feeSompi));
    await mineBlocks(session, 1, BOB);
    await waitForTransaction(session, CAROL, sent.txId, 60_000);
    const paid = ((await session.rpc.getUtxosByAddress(CAROL)) as any[]).filter((u) => String(u.outpoint.transactionId).toLowerCase() === String(sent.txId).toLowerCase());
    expect(paid.map((u) => BigInt(u.amountSompi))).toEqual([4n * KAS]);

    const after = json((await cli(["wallet", "hd", "balance", "cli1", "--password-env", "HK_HD1_PW", "--json"])).stdout);
    expect(after.verified).toBe(true);
    // BETA-FIX W2: the emptied receive addresses stay listed, zero balance (the local index handed them out)
    expect(after.used.map((u: any) => `${u.chain}/${u.index}/${u.balanceSompi}`)).toEqual(["receive/0/0", "receive/1/0", `change/0/${String(sent.change.amountSompi)}`]);
    expect(after.used.map((u: any) => u.handedOut)).toEqual([true, true, true]);
    expect(after.totalSompi).toBe(String(sent.change.amountSompi));
    expect(after.nextChange).toBe(1);
  });
});
