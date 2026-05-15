import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { runAccountsKeystoreImport } from "../src/runners/accounts-keystore-runners";
import { runAccountsRealGenerate } from "../src/runners/accounts-real-generate-runner";
import { runTxSign } from "../src/runners/tx-sign-runner";
import { loadRealAccountStoreSync } from "@hardkas/accounts";

describe("Account Hardening & Security Guards", () => {
  const accountsFile = path.join(process.cwd(), ".hardkas", "accounts.real.json");
  const keystoreDir = path.join(process.cwd(), ".hardkas", "keystore");

  beforeEach(() => {
    if (fs.existsSync(accountsFile)) fs.unlinkSync(accountsFile);
    if (fs.existsSync(keystoreDir)) fs.rmSync(keystoreDir, { recursive: true, force: true });
    process.env.HARDKAS_TEST_PW = "test-password";
    process.env.HARDKAS_TEST_PK = "0".repeat(64);
  });

  afterEach(() => {
    delete process.env.HARDKAS_TEST_PW;
    delete process.env.HARDKAS_TEST_PK;
  });

  it("should import an account as encrypted by default and set 0600 permissions", async () => {
    await runAccountsKeystoreImport({
      name: "alice",
      address: "kaspatest:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx",
      privateKeyEnv: "HARDKAS_TEST_PK",
      passwordEnv: "HARDKAS_TEST_PW"
    } as any);

    const keystorePath = path.join(keystoreDir, "alice.json");
    expect(fs.existsSync(keystorePath)).toBe(true);
    
    const stats = fs.statSync(keystorePath);
    // On Windows, mode might not show 0600 exactly via fs.stat, but we check if it was at least attempted or works on unix-like envs.
    // In many environments (Node.js on Windows), mode returns 33206 (0o100666) or similar.
    // However, the tool is supposed to set it.
    if (process.platform !== "win32") {
        expect(stats.mode & 0o777).toBe(0o600);
    }

    const store = loadRealAccountStoreSync();
    const alice = store?.accounts.find(a => a.name === "alice");
    expect(alice?.privateKey).toBeUndefined();
    expect(alice?.keystoreRef).toBe(".hardkas/keystore/alice.json");
  });

  it("should allow unsafe plaintext import with explicit flag", async () => {
    await runAccountsKeystoreImport({
      name: "bob",
      address: "kaspatest:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx",
      privateKeyEnv: "HARDKAS_TEST_PK",
      unsafePlaintext: true,
      yes: true
    } as any);

    const store = loadRealAccountStoreSync();
    const bob = store?.accounts.find(a => a.name === "bob");
    expect(bob?.privateKey).toBe(process.env.HARDKAS_TEST_PK);
    expect(bob?.keystoreRef).toBeUndefined();
  });

  it("should refuse mainnet signing without explicit flag", async () => {
    const planArtifact: any = {
      planId: "test-plan",
      networkId: "mainnet",
      mode: "real",
      from: { address: "kaspa:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx" },
      to: { address: "kaspa:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx" },
      amountSompi: 100000000n
    };

    const config: any = {
        network: { id: "mainnet" },
        accounts: {}
    };

    await expect(runTxSign({
      planArtifact,
      accountName: planArtifact.from.address,
      config,
      allowMainnetSigning: false
    })).rejects.toThrow("Mainnet signing is blocked");
  });

  it("should refuse signing if artifact network and account network disagree", async () => {
    const planArtifact: any = {
      planId: "test-plan",
      networkId: "mainnet",
      mode: "real",
      from: { address: "kaspatest:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx" }, // Testnet address
      to: { address: "kaspa:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx" },
      amountSompi: 100000000n
    };

    const config: any = {
        network: { id: "mainnet" },
        accounts: {}
    };

    await expect(runTxSign({
      planArtifact,
      accountName: planArtifact.from.address,
      config,
      allowMainnetSigning: true
    })).rejects.toThrow("Network mismatch");
  });
});
