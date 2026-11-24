import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendToKeystoreJson } from "../src/keystore-lock.js";
import { DEV_ACCOUNTS_PASSWORD, getOrCreateDevAccount } from "../src/dev-accounts.js";
import { KeystoreManager } from "../src/keystore.js";

describe("Priority 6 · Keystore hardening regressions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("appendToKeystoreJson refuses to overwrite existing corrupted keystore.json", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ks-corrupt-"));
    try {
      const ksDir = path.join(tmp, ".hardkas");
      fs.mkdirSync(ksDir, { recursive: true });
      const ksPath = path.join(ksDir, "keystore.json");
      const corruptBytes = "{ not valid json — keep existing accounts safe!";
      fs.writeFileSync(ksPath, corruptBytes, "utf-8");

      await expect(appendToKeystoreJson(tmp, "bob", { address: "kaspasim:qqbob" })).rejects.toThrow();
      expect(fs.readFileSync(ksPath, "utf-8")).toBe(corruptBytes);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("appendToKeystoreJson creates temp file with mode 0o600", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ks-perm-"));
    try {
      fs.mkdirSync(path.join(tmp, ".hardkas"), { recursive: true });
      const openSpy = vi.spyOn(fs.promises, "open");
      await appendToKeystoreJson(tmp, "alice", { address: "kaspasim:qqalice" });
      expect(openSpy).toHaveBeenCalled();
      const tmpCall = openSpy.mock.calls.find(([targetPath]) => String(targetPath).includes("keystore-"));
      expect(tmpCall).toBeDefined();
      expect(tmpCall?.[1]).toBe("w");
      expect(tmpCall?.[2]).toBe(0o600);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("getOrCreateDevAccount error message never reveals DEV_ACCOUNTS_PASSWORD", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-dev-pw-"));
    try {
      const devDir = path.join(tmp, ".hardkas", "dev-accounts");
      fs.mkdirSync(devDir, { recursive: true });
      const wrongEncrypted = await KeystoreManager.createEncryptedKeystore(
        { address: "kaspasim:qqalice", privateKey: "11".repeat(32), network: "simnet" },
        "different-password-not-dev",
        { label: "alice", network: "simnet" }
      );
      fs.writeFileSync(path.join(devDir, "alice.json"), JSON.stringify(wrongEncrypted), "utf-8");

      let message = "";
      try {
        await getOrCreateDevAccount(tmp, 0, "alice");
      } catch (e: any) {
        message = String(e?.message ?? e);
      }
      expect(message).toMatch(/Failed to decrypt dev account/);
      expect(message).not.toContain(DEV_ACCOUNTS_PASSWORD);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
