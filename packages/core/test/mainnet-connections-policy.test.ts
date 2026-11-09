import { describe, it, expect } from "vitest";
import {
  MAINNET_CONNECTIONS_ENABLED,
  MAINNET_TRANSACTIONS_ENABLED,
  MAINNET_CONNECTION_DISABLED,
  assertMainnetConnectionsDisabled,
  isMainnetConnectionDisabledError,
  mainnetConnectionDisabledMessage
} from "../src/index.js";

// MAINNET TOTAL LOCKDOWN (owner decision 2026-11-09) · the core of the common layer: two constants (not settings) and the
// one refusal every layer raises before any connection.

describe("MAINNET TOTAL LOCKDOWN · @hardkas/core policy", () => {
  it("both switches are constants set to false", () => {
    expect(MAINNET_CONNECTIONS_ENABLED).toBe(false);
    expect(MAINNET_TRANSACTIONS_ENABLED).toBe(false);
  });

  it("every mainnet spelling, among the identities involved, is refused with MAINNET_CONNECTION_DISABLED", () => {
    for (const spelling of ["mainnet", "MAINNET", " Mainnet ", "mainnet-1", "mainnet-7", "kaspa", "KASPA", "kaspa-mainnet", "kaspa-mainnet-1"]) {
      let err: any;
      try {
        assertMainnetConnectionsDisabled(["testnet-10", spelling], "unit");
      } catch (e) {
        err = e;
      }
      expect(err?.code, spelling).toBe(MAINNET_CONNECTION_DISABLED);
      expect(isMainnetConnectionDisabledError(err), spelling).toBe(true);
      expect(err?.metadata?.networks, spelling).toContain(spelling);
      expect(String(err?.message), spelling).toMatch(/Nothing was contacted/);
    }
  });

  it("non-mainnet networks, aliases that name no network type, and empty values pass", () => {
    expect(() => assertMainnetConnectionsDisabled(["simnet", "devnet", "testnet-10", "testnet-11", "simulated", "prod", "", undefined, null, 42])).not.toThrow();
  });

  it("the message names no way to enable it, and says what the identity-only case did", () => {
    const m = mainnetConnectionDisabledMessage("ctx");
    expect(m).toMatch(/^MAINNET_CONNECTION_DISABLED: /);
    expect(m).toMatch(/No flag, option, environment variable or configuration enables them/);
    expect(m).toMatch(/allowPublic, experimental, allowMainnet, HARDKAS_\*/);
    expect(mainnetConnectionDisabledMessage("ctx", "identity-only")).toMatch(/answered only its identity \(getServerInfo\).*Nothing was sent\./);
  });

  it("no environment variable changes it (read nowhere)", () => {
    const saved = { ...process.env };
    try {
      Object.assign(process.env, { HARDKAS_ALLOW_MAINNET: "1", HARDKAS_MAINNET: "1", HARDKAS_MAINNET_ENABLED: "true", HARDKAS_MAINNET_CONNECTIONS: "1" });
      expect(() => assertMainnetConnectionsDisabled(["mainnet"])).toThrow(/MAINNET_CONNECTION_DISABLED/);
    } finally {
      for (const k of ["HARDKAS_ALLOW_MAINNET", "HARDKAS_MAINNET", "HARDKAS_MAINNET_ENABLED", "HARDKAS_MAINNET_CONNECTIONS"]) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});
