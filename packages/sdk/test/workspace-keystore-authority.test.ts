import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";
import {
  KeystoreManager,
  loadKaspaWasm,
  loadOrCreateRealAccountStore,
  importRealDevAccount,
  saveRealAccountStore
} from "@hardkas/accounts";
import { createTxPlanArtifact } from "@hardkas/artifacts";
import { systemRuntimeContext } from "@hardkas/core";
import { TxPlanService } from "@hardkas/tx-builder";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// SDK-WORKSPACE-KEYSTORE-1 (2026-10-03): `Hardkas.open({ cwd: workspace })` did not govern where real
// encrypted keystores were looked up: the account resolver read `.hardkas/keystore/` from the process's
// current directory, while dev accounts and the real account store already came from the workspace. An
// application running outside its workspace could neither resolve nor sign with the workspace's encrypted
// account, and a keystore lying in the application's own directory passed for an account of the workspace.
// The configured workspace is the authority; the process cwd is never HardKAS state.

const PW = "ws-keystore-pw-" + crypto.randomBytes(4).toString("hex");
const NAME = "encuser";
let k: any;
let ws: string; // the configured workspace
let appDir: string; // the application's own process cwd, outside the workspace
let account: { address: string; keystorePath: string };
let plan: any;

// The same records `hardkas accounts real generate --password-env` leaves in a workspace.
async function encryptedAccount(root: string, name: string, password: string) {
  const key = crypto.randomBytes(32).toString("hex");
  const address = new k.PrivateKey(key).toKeypair().toAddress("simnet").toString();
  const keystore = await KeystoreManager.createEncryptedKeystore({ address, privateKey: key, network: "simnet" }, password, { label: name, network: "simnet" });
  const keystorePath = path.join(root, ".hardkas", "keystore", `${name}.json`);
  fs.mkdirSync(path.dirname(keystorePath), { recursive: true });
  await KeystoreManager.saveEncryptedKeystore(keystorePath, keystore);
  const store = importRealDevAccount(await loadOrCreateRealAccountStore({ cwd: root }), { name, address, keystoreRef: `.hardkas/keystore/${name}.json` });
  await saveRealAccountStore(store, { cwd: root });
  return { address, keystorePath };
}

async function planFrom(from: string) {
  const spk = k.payToAddressScript(from);
  const packed = Number(spk.version).toString(16).padStart(4, "0") + String(spk.script);
  const to = new k.PrivateKey(crypto.randomBytes(32).toString("hex")).toKeypair().toAddress("simnet").toString();
  const amount = 100_000_000n;
  const utxo = { outpoint: { transactionId: "ab".repeat(32), index: 0 }, address: from, amountSompi: 2_000_000_000n, scriptPublicKey: packed, isCoinbase: false, blockDaaScore: 1n };
  const service = new TxPlanService({ getUtxos: async () => [utxo as any], getVirtualDaaScore: async () => 100_000n });
  const result = await service.planTransactionUpstream({ fromAddress: from, toAddress: to, amountSompi: amount, feeRate: 100n, networkId: "simnet" });
  return createTxPlanArtifact({
    networkId: "simnet" as any,
    mode: "localnet" as any,
    from: { input: NAME, address: from, accountName: NAME },
    to: { input: to, address: to },
    amountSompi: amount,
    plan: result.plan,
    rpcUrl: "ws://127.0.0.1:18210",
    ctx: {
      ...systemRuntimeContext,
      utxoSelection: result.utxoSelection,
      ...(result.plannerAuthority ? { plannerAuthority: result.plannerAuthority } : {}),
      ...(result.plannerAuthorityDetail ? { plannerAuthorityDetail: result.plannerAuthorityDetail } : {})
    } as any
  });
}

const runFrom = (dir: string) => vi.spyOn(process, "cwd").mockReturnValue(dir);

beforeAll(async () => {
  k = await loadKaspaWasm();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ws-keystore-"));
  account = await encryptedAccount(ws, NAME, PW);
  plan = await planFrom(account.address);
});

beforeEach(() => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-app-cwd-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(appDir, { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(ws, { recursive: true, force: true });
});

describe("SDK-WORKSPACE-KEYSTORE-1 · the configured workspace, not the process cwd, governs real keystores", () => {
  it("an application outside the workspace resolves the workspace's encrypted account with its keystore", async () => {
    runFrom(appDir);
    const sdk = await Hardkas.open({ cwd: ws });
    const acc: any = await sdk.accounts.resolve(NAME);
    expect(acc.address).toBe(account.address);
    expect(acc.keystorePath ? path.resolve(acc.keystorePath) : null).toBe(path.resolve(account.keystorePath));
  });

  it("…and signs with the password given in memory", async () => {
    runFrom(appDir);
    const sdk = await Hardkas.open({ cwd: ws });
    const signed: any = await sdk.tx.sign(structuredClone(plan), { account: NAME, keystorePassword: PW });
    expect(signed.status).toBe("signed");
    expect(signed.txId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a keystore in the application's own directory is not an account of the workspace", async () => {
    await encryptedAccount(appDir, "decoy", "other-pw-" + crypto.randomBytes(4).toString("hex"));
    runFrom(appDir);
    const sdk = await Hardkas.open({ cwd: ws });
    const names = (await sdk.accounts.list()).map((a: any) => a.name);
    expect(names).toContain(NAME);
    expect(names).not.toContain("decoy");
  });

  it("a same-name keystore in the application's directory never replaces the workspace's account", async () => {
    const other = await encryptedAccount(appDir, NAME, "other-pw-" + crypto.randomBytes(4).toString("hex"));
    runFrom(appDir);
    const sdk = await Hardkas.open({ cwd: ws });
    const acc: any = await sdk.accounts.resolve(NAME);
    expect(acc.address).not.toBe(other.address);
    expect(acc.address).toBe(account.address);
    expect(acc.keystorePath ? path.resolve(acc.keystorePath) : null).toBe(path.resolve(account.keystorePath));
  });

  it("the flow writes no HardKAS state into the application's directory", async () => {
    runFrom(appDir);
    const sdk = await Hardkas.open({ cwd: ws });
    // The outcome of signing is the business of the tests above; this one looks only at the directory.
    await sdk.accounts.resolve(NAME);
    await sdk.tx.sign(structuredClone(plan), { account: NAME, keystorePassword: PW }).catch(() => undefined);
    expect(fs.readdirSync(appDir)).toEqual([]);
  });

  it("control · with the process cwd = the workspace (how the CLI runs), the account resolves and signs", async () => {
    runFrom(ws);
    const sdk = await Hardkas.open({ cwd: ws });
    const acc: any = await sdk.accounts.resolve(NAME);
    expect(acc.keystorePath ? path.resolve(acc.keystorePath) : null).toBe(path.resolve(account.keystorePath));
    const signed: any = await sdk.tx.sign(structuredClone(plan), { account: NAME, keystorePassword: PW });
    expect(signed.status).toBe("signed");
  });
});
