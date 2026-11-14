import { describe, it, expect, vi, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A6 (rc2 audit) · `accounts real generate --unsafe-plaintext` refused a plaintext mainnet key only for the literal
// network "mainnet". Invisible today (the signing lockdown answers first), it would have stored a plaintext mainnet key
// for `kaspa-mainnet`, `mainnet-1` or a config alias declaring mainnet the day the lockdown is lifted. This test lifts the
// FIRST line (refuseMainnetSigning is a no-op here) to show the SECOND one now holds for every spelling and alias.

vi.mock("../src/mainnet-guard.js", async () => {
  const actual: any = await vi.importActual("../src/mainnet-guard.js");
  return {
    ...actual,
    refuseMainnetSigning: () => undefined,
    workspaceConfigForGuard: async () => ({ networks: { prod: { kind: "kaspa-rpc", network: "mainnet" } } })
  };
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-a6-generate-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("A6 · plaintext generation is refused for every mainnet spelling and alias, even with the lockdown lifted", () => {
  for (const networkId of ["mainnet", "kaspa-mainnet", "mainnet-1", "Mainnet", "prod"]) {
    it(`--network ${networkId} --unsafe-plaintext → PLAINTEXT_MAINNET_FORBIDDEN, nothing written`, async () => {
      const { runAccountsRealGenerate } = await import("../src/runners/accounts-real-generate-runner.js");
      let error: any;
      try {
        await runAccountsRealGenerate({ name: "plain", networkId: networkId as any, unsafePlaintext: true, yes: true, json: true, workspaceRoot: dir });
      } catch (e) {
        error = e;
      }
      expect(error?.code).toBe("PLAINTEXT_MAINNET_FORBIDDEN");
      expect(fs.existsSync(path.join(dir, ".hardkas"))).toBe(false);
    });
  }
});
