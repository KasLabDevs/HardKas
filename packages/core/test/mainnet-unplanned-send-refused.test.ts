import { describe, it, expect } from "vitest";
import { MAINNET_UNPLANNED_SEND_REFUSED, assertUnplannedSendNotOnMainnet } from "../src/index.js";

// Owner rule 2026-11-11 · an unplanned send (a signed transaction that names no plan of the workspace) is never allowed
// on mainnet, whatever the lockdown constant says: the rule does not read MAINNET_TRANSACTIONS_ENABLED at all.

const codeOf = (networks: unknown[]): string => {
  try {
    assertUnplannedSendNotOnMainnet(networks, "unit");
    return "PASSED";
  } catch (e: any) {
    return String(e?.code);
  }
};

describe("assertUnplannedSendNotOnMainnet", () => {
  it("every mainnet spelling among the identities involved is MAINNET_UNPLANNED_SEND_REFUSED, naming the networks", () => {
    for (const spelling of ["mainnet", "MAINNET", " Mainnet ", "mainnet-1", "kaspa", "KASPA", "kaspa-mainnet", "kaspa-mainnet-1"]) {
      expect(codeOf(["testnet-10", undefined, spelling]), spelling).toBe(MAINNET_UNPLANNED_SEND_REFUSED);
    }
    let err: any;
    try {
      assertUnplannedSendNotOnMainnet(["mainnet", "testnet-10"], "tx.send");
    } catch (e) {
      err = e;
    }
    expect(err?.metadata?.networks).toEqual(["mainnet", "testnet-10"]);
    expect(String(err?.message)).toMatch(/\(tx\.send\)/);
    expect(String(err?.message)).toMatch(/Nothing was sent or recorded/);
  });

  it("simnet, devnet, testnets, aliases and empty values pass", () => {
    for (const networks of [["simnet"], ["devnet"], ["testnet-10"], ["testnet-11", "testnet"], ["simulated", "local-docker-simnet"], ["prod"], [], [undefined, null, "", " ", 42]]) {
      expect(codeOf(networks), JSON.stringify(networks)).toBe("PASSED");
    }
  });

  it("the rule is not the lockdown switch: its source never reads MAINNET_TRANSACTIONS_ENABLED", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "mainnet-policy.ts"), "utf8");
    const body = /export function assertUnplannedSendNotOnMainnet[\s\S]*?\r?\n}\r?\n/.exec(source)?.[0] ?? "";
    expect(body).not.toBe("");
    expect(body).not.toMatch(/MAINNET_TRANSACTIONS_ENABLED|MAINNET_CONNECTIONS_ENABLED/);
  });
});
