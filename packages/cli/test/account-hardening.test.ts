import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runAccountsKeystoreImport } from "../src/runners/accounts-keystore-runners";
import { runAccountsRealGenerate } from "../src/runners/accounts-real-generate-runner";
import { runTxSign } from "../src/runners/tx-sign-runner";
import { loadRealAccountStoreSync } from "@hardkas/accounts";

describe("Account Hardening & Security Guards", () => {
  let tmpDir: string;
  let accountsFile: string;
  let keystoreDir: string;
  let dummyConfig: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "account-hardening-test-"));
    accountsFile = path.join(tmpDir, ".hardkas", "accounts.real.json");
    keystoreDir = path.join(tmpDir, ".hardkas", "keystore");
    dummyConfig = path.join(tmpDir, "hardkas.config.ts");

    fs.writeFileSync(dummyConfig, "export default {};", "utf-8");
    if (fs.existsSync(accountsFile)) fs.unlinkSync(accountsFile);
    if (fs.existsSync(keystoreDir))
      fs.rmSync(keystoreDir, { recursive: true, force: true });
    process.env.HARDKAS_TEST_PW = "test-password";
    process.env.HARDKAS_TEST_PK = "0".repeat(64);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.HARDKAS_TEST_PW;
    delete process.env.HARDKAS_TEST_PK;
  });

  it("should import an account as encrypted by default and set 0600 permissions", async () => {
    await runAccountsKeystoreImport({
      name: "alice",
      address: "kaspatest:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx",
      privateKeyEnv: "HARDKAS_TEST_PK",
      passwordEnv: "HARDKAS_TEST_PW",
      workspaceRoot: tmpDir
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

    const store = loadRealAccountStoreSync({ cwd: tmpDir });
    const alice = store?.accounts.find((a) => a.name === "alice");
    expect(alice?.privateKey).toBeUndefined();
    expect(alice?.keystoreRef).toBe(".hardkas/keystore/alice.json");
  });

  it("should allow unsafe plaintext import with explicit flag", async () => {
    await runAccountsKeystoreImport({
      name: "bob",
      address: "kaspatest:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx",
      privateKeyEnv: "HARDKAS_TEST_PK",
      unsafePlaintext: true,
      yes: true,
      workspaceRoot: tmpDir
    } as any);

    const store = loadRealAccountStoreSync({ cwd: tmpDir });
    const bob = store?.accounts.find((a) => a.name === "bob");
    expect(bob?.privateKey).toBe(process.env.HARDKAS_TEST_PK);
    expect(bob?.keystoreRef).toBeUndefined();
  });

  it("should refuse mainnet signing without explicit flag", async () => {
    const planArtifact: any = {
      planId: "test-plan",
      networkId: "mainnet",
      mode: "rpc",
      execution: { mode: "rpc", domain: "kaspa-l1", network: "mainnet" },
      from: { address: "kaspa:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx" },
      to: { address: "kaspa:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx" },
      amountSompi: 100000000n
    };

    const config: any = {
      defaultNetwork: "mainnet",
      accounts: {}
    };

    await expect(
      runTxSign({
        planArtifact,
        accountName: planArtifact.from.address,
        config,
        allowMainnetSigning: false
      })
    ).rejects.toMatchObject({ code: "MAINNET_SIGNING_DISABLED" });
  });

  it("should refuse signing if artifact network and account network disagree", async () => {
    // SDK-MAINNET-BROADCAST-GUARD-1: a mainnet PLAN is refused by the mainnet policy first (whatever the flag says), so
    // the mismatch is shown with the reachable case: a testnet-10 plan and an account whose address is mainnet's.
    const planArtifact: any = {
      planId: "test-plan",
      networkId: "testnet-10",
      mode: "rpc",
      execution: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" },
      from: {
        address: "kaspa:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx"
      }, // Mainnet address
      to: { address: "kaspatest:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx" },
      amountSompi: 100000000n
    };

    const config: any = {
      defaultNetwork: "testnet-10",
      accounts: {}
    };

    await expect(
      runTxSign({
        planArtifact,
        accountName: planArtifact.from.address,
        config,
        allowMainnetSigning: true
      })
      // refused as a network mismatch — here by the account/target compatibility check (WORKSPACE-AUTHORITY-2), which
      // runs before the runner's own artifact/address comparison
    ).rejects.toThrow(/network mismatch/i);
  });

  it("a mainnet plan is refused MAINNET_SIGNING_DISABLED even with --allow-mainnet-signing (the flag stays refused)", async () => {
    const planArtifact: any = {
      planId: "test-plan",
      networkId: "mainnet",
      mode: "rpc",
      execution: { mode: "rpc", domain: "kaspa-l1", network: "mainnet" },
      from: { address: "kaspa:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx" },
      to: { address: "kaspa:qrh60m5zv98m5l855l855l855l855l855l855l855l855l85sxtunx" },
      amountSompi: 100000000n
    };
    await expect(
      runTxSign({ planArtifact, accountName: planArtifact.from.address, config: { defaultNetwork: "mainnet", accounts: {} } as any, allowMainnetSigning: true })
    ).rejects.toMatchObject({ code: "MAINNET_SIGNING_DISABLED" });
  });
});
