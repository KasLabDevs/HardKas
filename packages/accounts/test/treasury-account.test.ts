import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  ensureDevAccounts,
  getLocalnetTreasuryAccount,
  listDevAccountsSync,
  LOCALNET_TREASURY_ACCOUNT_NAME,
  LOCALNET_TREASURY_SEED,
  loadKaspaWasm
} from "../src";

describe("localnet deterministic treasury account", () => {
  it("derives a stable simnet treasury identity distinct from dev accounts without writing to dev-accounts", async () => {
    const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-treasury-"));
    try {
      await ensureDevAccounts(tmpWs);
      const devAccounts = listDevAccountsSync(tmpWs);
      const treasury = getLocalnetTreasuryAccount();
      const treasuryAgain = getLocalnetTreasuryAccount();

      expect(treasury.name).toBe(LOCALNET_TREASURY_ACCOUNT_NAME);
      expect(treasury.kind).toBe("kaspa");
      expect(treasury.network).toBe("simnet");
      expect(treasury.address).toMatch(/^kaspasim:/);
      expect(treasury.address).toBe(treasuryAgain.address);
      expect(treasury.privateKey).toMatch(/^[0-9a-f]{64}$/);
      expect(treasury.privateKey).toBe(treasuryAgain.privateKey);

      const wasm = await loadKaspaWasm();
      const expectedHex = createHash("sha256").update(LOCALNET_TREASURY_SEED).digest("hex");
      const expectedAddress = new wasm.PrivateKey(expectedHex).toKeypair().toAddress("simnet").toString();
      expect(treasury.address).toBe(expectedAddress);

      expect(devAccounts.map((a) => a.name)).not.toContain(LOCALNET_TREASURY_ACCOUNT_NAME);
      expect(devAccounts.map((a) => a.address)).not.toContain(treasury.address);
    } finally {
      fs.rmSync(tmpWs, { recursive: true, force: true });
    }
  });
});
