import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "@hardkas/sdk";
import { deterministicCompare } from "@hardkas/core";

describe("Audit Hardening Suite (0.9.4-alpha)", () => {
  let tmpDir: string;
  let sdk: Hardkas;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-audit-"));
    sdk = await Hardkas.open({ cwd: tmpDir, autoBootstrap: true });
  });

  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("P0.1: Deterministic Multisig Ordering", () => {
    it("should provide consistent sorting independently of locale", () => {
      // Create some strings that might vary in localeCompare
      const a = "kaspa:qpzry9x8gf2tvdw0s3jn54khce6mua7lcqq20023l3l09lrd0fch2v0x956l";
      const b = "kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhx0cg";
      const c = "kaspa:qzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzv7y6g";

      const arr1 = [a, c, b].sort(deterministicCompare);
      const arr2 = [b, a, c].sort(deterministicCompare);
      const arr3 = [c, b, a].sort(deterministicCompare);

      expect(arr1).toEqual([a, b, c]);
      expect(arr2).toEqual([a, b, c]);
      expect(arr3).toEqual([a, b, c]);
    });
  });

  describe("P0.2: Artifact Sandbox Boundary", () => {
    it("should reject path traversal in artifacts.read()", async () => {
      // Write a secret file outside the artifacts directory
      const secretPath = path.join(tmpDir, "secret.json");
      fs.writeFileSync(secretPath, JSON.stringify({ secret: "data" }));

      // Try to read it using traversal
      await expect(sdk.artifacts.read("../secret.json")).rejects.toMatchObject({
        code: "PATH_TRAVERSAL"
      });
    });

    it("should reject absolute paths outside the workspace", async () => {
      const extDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-ext-"));
      const extFile = path.join(extDir, "ext.json");
      fs.writeFileSync(extFile, JSON.stringify({ data: "ext" }));

      await expect(sdk.artifacts.read(extFile)).rejects.toMatchObject({
        code: "PATH_TRAVERSAL"
      });

      fs.rmSync(extDir, { recursive: true, force: true });
    });
  });

  describe("P0.3: Replay SDK Path Resolution", () => {
    it("should resolve correct canonical directories for replay", async () => {
      // Generate some dummy artifacts and put them in .hardkas/receipts
      const receiptsDir = path.join(sdk.workspace.hardkasDir, "receipts");
      fs.mkdirSync(receiptsDir, { recursive: true });
      fs.writeFileSync(
        path.join(receiptsDir, "tx-receipt-dummy.json"),
        JSON.stringify({ schema: "hardkas.txReceipt", txId: "plan-dummy-1" })
      );

      const artifactsDir = path.join(sdk.workspace.hardkasDir, "artifacts");
      fs.mkdirSync(artifactsDir, { recursive: true });
      fs.writeFileSync(
        path.join(artifactsDir, "tx-plan-dummy.json"),
        JSON.stringify({
          schema: "hardkas.txPlan",
          planId: "plan-dummy-1",
          createdAt: "2026-06-01T00:00:00Z"
        })
      );

      // Execute replay with no targets
      try {
        await sdk.replay.verify();
      } catch (err: any) {
        // It will fail validation, but it should successfully find the files and not fail path resolution!
        // A missing receipt error is fine, but it shouldn't look in .hardkas/artifacts/.hardkas/receipts
        expect(((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err))).not.toContain(".hardkas/artifacts/.hardkas/receipts");
      }
    });
  });

  describe("P1.1: Localnet State Naming Compatibility", () => {
    it("should migrate localnet-state.json to localnet.json", async () => {
      // Mock localnet.json missing but localnet-state.json existing
      const localnetStatePath = path.join(
        sdk.workspace.hardkasDir,
        "localnet-state.json"
      );
      const localnetPath = path.join(sdk.workspace.hardkasDir, "localnet.json");

      if (fs.existsSync(localnetPath)) fs.unlinkSync(localnetPath);

      fs.writeFileSync(localnetStatePath, JSON.stringify({ migrated: true }));

      // Load through store.ts
      const { loadLocalnetState } = await import("@hardkas/localnet");
      const state = await loadLocalnetState(localnetPath);

      expect(state).toBeTruthy();
      expect((state as any).migrated).toBe(true);

      // Verify localnet.json was created and localnet-state.json kept
      expect(fs.existsSync(localnetPath)).toBe(true);
      expect(fs.existsSync(localnetStatePath)).toBe(true);
    });
  });

  describe("P1.2: SDK Mode Resolution", () => {
    it("should resolve to real mode for testnet/mainnet", async () => {
      const realSdk = await Hardkas.open({
        cwd: tmpDir,
        network: "testnet-10",
        autoBootstrap: false
      });

      // Mock the RPC call to prevent connection error
      realSdk.rpc.getUtxosByAddress = async () => {
        return [
          {
            outpoint: { transactionId: "mock-tx", index: 0 },
            address:
              "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhx0cg",
            amountSompi: 100_000_000n,
            scriptPublicKey: "mock"
          }
        ];
      };
      realSdk.rpc.getBlockDagInfo = async () => ({ virtualDaaScore: 0n }) as any;

      const plan = await realSdk.tx.plan({
        from: "alice",
        to: "bob",
        amount: 10n
      });
      expect(plan.mode).toBe("real");
    });
  });
});
