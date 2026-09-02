import { describe, it, expect } from "vitest";
import { assertAccountCompatible } from "../src/resolve.js";
import { HardkasKaspaAccount, HardkasSyntheticAccount, HardkasExternalWalletAccount } from "../src/types.js";
import { AccountNetworkMismatchError } from "@hardkas/core";

describe("Execution Guard - Accounts", () => {
  it("should pass when kaspa account network matches execution target", () => {
    const account: HardkasKaspaAccount = {
      name: "alice",
      kind: "kaspa",
      address: "kaspatest:q...",
      network: "testnet-10"
    };

    expect(() => {
      assertAccountCompatible(account, { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" });
    }).not.toThrow();
  });

  it("should fail when kaspa account network mismatches execution target", () => {
    const account: HardkasKaspaAccount = {
      name: "alice",
      kind: "kaspa",
      address: "kaspatest:q...",
      network: "testnet-10"
    };

    expect(() => {
      assertAccountCompatible(account, { mode: "rpc", domain: "kaspa-l1", network: "mainnet" });
    }).toThrowError(AccountNetworkMismatchError);
  });

  it("should pass synthetic accounts without network validation", () => {
    const account: HardkasSyntheticAccount = {
      name: "sim_alice",
      kind: "synthetic",
      executionMode: "simulator",
      address: "kaspa:sim_..."
    };

    expect(() => {
      assertAccountCompatible(account, { mode: "simulator", domain: "kaspa-l1", network: "simulated" });
    }).not.toThrow();
  });

  it("should fail when using a synthetic account with a non-simulator target", () => {
    const account: HardkasSyntheticAccount = {
      name: "sim_alice",
      kind: "synthetic",
      executionMode: "simulator",
      address: "kaspa:sim_..."
    };

    expect(() => {
      assertAccountCompatible(account, { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" });
    }).toThrowError(AccountNetworkMismatchError);
  });

  it("should validate external wallet networks", () => {
    const account: HardkasExternalWalletAccount = {
      name: "browser_wallet",
      kind: "external-wallet",
      network: "mainnet"
    };

    expect(() => {
      assertAccountCompatible(account, { mode: "rpc", domain: "kaspa-l1", network: "mainnet" });
    }).not.toThrow();

    expect(() => {
      assertAccountCompatible(account, { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" });
    }).toThrowError(AccountNetworkMismatchError);
  });
});
