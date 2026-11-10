import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listHardkasAccounts, resolveHardkasAccount, resolveHardkasAccountAddress, resolveRealAccountOrAddress } from "../src/index.js";

// INT9-A (devnet, found by the real devnet cycle) · a devnet address (`kaspadev:`) given where an account or an address
// is accepted (`tx plan --to`, `silver spend --to`, …) was not recognised as an address: it was looked up as an account
// name and failed with an untyped "Unknown HardKAS account" (UNKNOWN_ERROR). A devnet payment to an address was
// impossible. The prefix names the address family only; the network is still proven by the node.

const DEVNET_ADDRESS = "kaspadev:qr8q0c4ganeu2crhc45fyrxtp86ujwnnsmkue56k5zkcx72mkz88yflkewlzn";

describe("INT9-A · devnet addresses are addresses", () => {
  it("resolveHardkasAccount takes a kaspadev: address as an external address of devnet", () => {
    expect(resolveHardkasAccount({ nameOrAddress: DEVNET_ADDRESS })).toMatchObject({ kind: "external-wallet", network: "devnet", address: DEVNET_ADDRESS });
  });

  it("resolveHardkasAccountAddress returns it (validated by the Kaspa SDK)", async () => {
    expect(await resolveHardkasAccountAddress(DEVNET_ADDRESS)).toBe(DEVNET_ADDRESS);
  });

  it("resolveRealAccountOrAddress returns it", () => {
    expect(resolveRealAccountOrAddress(null, DEVNET_ADDRESS)).toEqual({ address: DEVNET_ADDRESS });
  });

  // `accounts real import` stores no network: an imported devnet account was bound to no network, so every devnet
  // operation with it failed (EXECUTION_NETWORK_MISMATCH "Expected: devnet, Actual: undefined"). kaspadev: is the
  // devnet family only (unlike kaspatest:, which every testnet shares), as kaspasim: binds an entry to simnet.
  it("an imported real-store entry with a kaspadev: address and no network is a devnet account", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-int9a-acc-"));
    try {
      fs.mkdirSync(path.join(dir, ".hardkas"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, ".hardkas", "accounts.real.json"),
        JSON.stringify({
          schema: "hardkas.realAccountStore.v1",
          hardkasVersion: "x",
          version: "1.0.0-alpha",
          createdAt: "2026-11-09T00:00:00.000Z",
          networkId: "simnet",
          mode: "real",
          connectionMode: "node",
          accounts: [{ name: "imported", address: DEVNET_ADDRESS, privateKeyEnv: "HK_INT9A_NOT_SET", createdAt: "2026-11-09T00:00:00.000Z" }]
        })
      );
      const accounts = listHardkasAccounts({ cwd: dir } as any, { mode: "rpc", domain: "kaspa-l1", network: "devnet" } as any);
      expect(accounts.find((a: any) => a.name === "imported")).toMatchObject({ network: "devnet", address: DEVNET_ADDRESS });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("an unknown account name is a typed refusal (ACCOUNT_NOT_FOUND), not an untyped error", () => {
    try {
      resolveHardkasAccount({ nameOrAddress: "nobody-int9a" });
      expect.unreachable();
    } catch (e: any) {
      expect(e.code).toBe("ACCOUNT_NOT_FOUND");
      expect(String(e.message)).toMatch(/Unknown HardKAS account 'nobody-int9a'/);
    }
  });
});
