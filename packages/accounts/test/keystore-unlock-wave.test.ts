import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KaspaWasmPrivateKeySigner } from "../src/kaspa-wasm-signer.js";
import { KeystoreManager } from "../src/keystore.js";
import { loadKaspaWasm } from "../src/signer-backend.js";
import { DEV_ACCOUNTS_PASSWORD } from "../src/dev-accounts.js";

// Accounts lifecycle wave (2026-10-03): the signer used to open ANY keystore-backed account with the
// development password ("hardkas-local-dev") and swallow the failure, so a real account encrypted with
// its owner's password could never sign, and one encrypted with the public development password was
// opened silently. A real keystore opens only with the password the caller passes in memory; the
// development password applies only to accounts the resolver marked as development accounts.

const USER_PW = "lib-user-pw-9a0c";
let dir: string;
let k: any;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-keystore-wave-"));
  k = await loadKaspaWasm();
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function keystoreAccount(password: string, keystoreKind?: "dev-account") {
  const key = crypto.randomBytes(32).toString("hex");
  const address = new k.PrivateKey(key).toKeypair().toAddress("simnet").toString();
  const keystore = await KeystoreManager.createEncryptedKeystore({ address, privateKey: key, network: "simnet" }, password, { label: "acct", network: "simnet" });
  const file = path.join(dir, `${crypto.randomUUID()}.json`);
  await KeystoreManager.saveEncryptedKeystore(file, keystore);
  return { name: "acct", kind: "kaspa", address, keystorePath: file, ...(keystoreKind ? { keystoreKind } : {}) } as any;
}

function planFor(address: string): any {
  const spk = k.payToAddressScript(address);
  const packed = Number(spk.version).toString(16).padStart(4, "0") + String(spk.script);
  const to = new k.PrivateKey(crypto.randomBytes(32).toString("hex")).toKeypair().toAddress("simnet").toString();
  return {
    networkId: "simnet",
    mode: "localnet",
    estimatedFeeSompi: "5000",
    from: { address },
    to: { address: to },
    amountSompi: "100000000",
    inputs: [{ address, amountSompi: "2000000000", outpoint: { transactionId: "cd".repeat(32), index: 0 }, scriptPublicKey: packed, blockDaaScore: "1" }],
    outputs: [{ address: to, amountSompi: "100000000" }],
    change: { address, amountSompi: String(2_000_000_000n - 100_000_000n - 5_000n) }
  };
}

describe("Accounts wave · a real keystore opens only with the password given in memory", () => {
  it("no password: KEYSTORE_PASSWORD_REQUIRED (never a silent development-password attempt)", async () => {
    const account = await keystoreAccount(USER_PW);
    const signer = new KaspaWasmPrivateKeySigner({ account });
    await expect(signer.signTxPlan({ planArtifact: planFor(account.address) } as any)).rejects.toMatchObject({ code: "KEYSTORE_PASSWORD_REQUIRED" });
  });

  it("a REAL keystore encrypted with the development password is not opened without the password either", async () => {
    const account = await keystoreAccount(DEV_ACCOUNTS_PASSWORD);
    const signer = new KaspaWasmPrivateKeySigner({ account });
    await expect(signer.signTxPlan({ planArtifact: planFor(account.address) } as any)).rejects.toMatchObject({ code: "KEYSTORE_PASSWORD_REQUIRED" });
  });

  it("the right password: signs", async () => {
    const account = await keystoreAccount(USER_PW);
    const signer = new KaspaWasmPrivateKeySigner({ account, keystorePassword: USER_PW } as any);
    const r = await signer.signTxPlan({ planArtifact: planFor(account.address) } as any);
    expect(r.txId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a wrong password: KEYSTORE_PASSWORD_INVALID, and the attempt is not in the message", async () => {
    const account = await keystoreAccount(USER_PW);
    const wrong = "lib-wrong-pw-33e1";
    const signer = new KaspaWasmPrivateKeySigner({ account, keystorePassword: wrong } as any);
    const err: any = await signer.signTxPlan({ planArtifact: planFor(account.address) } as any).catch((e) => e);
    expect(err?.code).toBe("KEYSTORE_PASSWORD_INVALID");
    expect(String(err?.message)).not.toContain(wrong);
  });

  it("control · an account the resolver marked as a development account opens with the development password", async () => {
    const account = await keystoreAccount(DEV_ACCOUNTS_PASSWORD, "dev-account");
    const signer = new KaspaWasmPrivateKeySigner({ account });
    const r = await signer.signTxPlan({ planArtifact: planFor(account.address) } as any);
    expect(r.txId).toMatch(/^[0-9a-f]{64}$/);
  });
});
