import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { validateAddressNetwork, validateAddressPrefix, addressMatchesNetwork } from "../src/real-accounts.js";

/*
 * HK-14 / TX-04 / L1-03 (counter-audit X3-02-tx.log): devnet addresses are `kaspadev:` (rusty-kaspa crypto/addresses
 * v2.1.0 `Prefix::Devnet => "kaspadev"`; kaspa-wasm 2.1.0 `toAddress("devnet")` → kaspadev:), yet they were refused and
 * `kaspasim:` accepted for devnet; unknown networks (`testnet-12` too) were not checked at all; `kaspa:sim_*` passed on
 * any network; `networks.mainnet.allowMainnet` made `kaspa:` addresses pass on other networks.
 */

const k: any = loadManagedKaspaWasmSync();
const addrOn = (net: string) => new k.PrivateKey(randomBytes(32).toString("hex")).toKeypair().toAddress(net).toString();
const codeOf = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e: any) {
    return e?.code;
  }
  return undefined;
};

describe("HK-14 · address prefix by network type", () => {
  it("devnet: kaspadev: accepted (what kaspa-wasm generates), kaspasim: refused", () => {
    const dev = addrOn("devnet");
    expect(dev.startsWith("kaspadev:")).toBe(true);
    expect(codeOf(() => validateAddressPrefix(dev))).toBeUndefined();
    expect(codeOf(() => validateAddressNetwork(dev, "devnet"))).toBeUndefined();
    expect(codeOf(() => validateAddressNetwork(addrOn("simnet"), "devnet"))).toBe("NETWORK_ADDRESS_MISMATCH");
    expect(addressMatchesNetwork(dev, "devnet")).toBe(true);
  });

  it("every testnet suffix is a testnet (testnet-12 checked), mainnet spellings are mainnet", () => {
    expect(codeOf(() => validateAddressNetwork(addrOn("devnet"), "testnet-12"))).toBe("NETWORK_ADDRESS_MISMATCH");
    expect(codeOf(() => validateAddressNetwork(addrOn("testnet-12"), "testnet-12"))).toBeUndefined();
    expect(codeOf(() => validateAddressNetwork(addrOn("mainnet"), "kaspa-mainnet"))).toBeUndefined();
    expect(codeOf(() => validateAddressNetwork(addrOn("testnet-10"), "kaspa-mainnet"))).toBe("NETWORK_ADDRESS_MISMATCH");
  });

  it("an unknown network fails closed (NETWORK_UNKNOWN), and does not match", () => {
    expect(codeOf(() => validateAddressNetwork(addrOn("testnet-10"), "nonsense"))).toBe("NETWORK_UNKNOWN");
    expect(addressMatchesNetwork(addrOn("testnet-10"), "nonsense")).toBe(false);
  });

  it("kaspa:sim_* only in the simulator", () => {
    expect(codeOf(() => validateAddressNetwork("kaspa:sim_alice", "simulated"))).toBeUndefined();
    expect(codeOf(() => validateAddressNetwork("kaspa:sim_alice", "simnet", undefined, { simulated: true }))).toBeUndefined();
    expect(codeOf(() => validateAddressNetwork("kaspa:sim_alice", "simnet"))).toBe("NETWORK_ADDRESS_MISMATCH");
    expect(codeOf(() => validateAddressNetwork("kaspa:sim_alice", "testnet-10"))).toBe("NETWORK_ADDRESS_MISMATCH");
  });

  it("allowMainnet (config) no longer makes kaspa: pass on another network", () => {
    expect(codeOf(() => validateAddressNetwork(addrOn("mainnet"), "testnet-10", true))).toBe("NETWORK_ADDRESS_MISMATCH");
    expect(codeOf(() => validateAddressNetwork(addrOn("mainnet"), "simnet", true))).toBe("NETWORK_ADDRESS_MISMATCH");
  });

  it("a prefix that is no Kaspa prefix is HARDKAS_INVALID_ADDRESS", () => {
    expect(codeOf(() => validateAddressPrefix("bitcoin:qqq"))).toBe("HARDKAS_INVALID_ADDRESS");
  });
});
