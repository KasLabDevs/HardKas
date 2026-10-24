/*
 * WALLET-HD-0 · F-05: this lab used to open a synthetic WalletToolkit identity on `network: "testnet"` and ask the
 * user to fund its address from a testnet faucet. A synthetic identity's private key is computable from the wallet's
 * name, so funding it on a public network gives the funds away. The lab must never do that again:
 *   - it only ever opens the toolkit for the local simnet, declared explicitly;
 *   - it never mentions a faucet;
 *   - it uses no nonexistent `wallet.address()`.
 * Source inspection (the lab is a long-running process) + the network guard's own behaviour.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const indexTs = fs.readFileSync(path.join(here, "..", "src", "index.ts"), "utf8");

describe("WALLET-HD-0 · labs/testnet-runner never funds a synthetic identity on a public network", () => {
  it("does not open the toolkit on testnet and does not invite to use a faucet", () => {
    expect(indexTs).not.toMatch(/network:\s*["']testnet/);
    expect(indexTs).not.toMatch(/networkId:\s*["']testnet/);
    expect(indexTs).not.toMatch(/faucet/i);
  });

  it("every WalletToolkit.open declares the network the guard returned (simnet)", () => {
    const opens = [...indexTs.matchAll(/WalletToolkit\.open\(([^)]*)\)/g)].map((m) => m[1]);
    expect(opens.length).toBeGreaterThan(0);
    for (const args of opens) expect(args).toMatch(/networkId:\s*(labNetwork|["']simnet["'])/);
  });

  it("uses receive() (a method that exists), not address()", () => {
    expect(indexTs).not.toMatch(/wallet\.address\(\)/);
    expect(indexTs).toMatch(/wallet\.receive\(\)/);
  });
});

describe("WALLET-HD-0 · the lab's network guard", () => {
  it("refuses an undeclared, public or unknown network with an explanation that points to a real account", async () => {
    const { requireLabNetwork } = await import("../src/network-guard.js");
    for (const declared of [undefined, "", "testnet-10", "testnet-11", "testnet", "mainnet", "devnet", "foo", "kaspatest"]) {
      let err: any;
      try { requireLabNetwork(declared); } catch (e) { err = e; }
      expect(err, String(declared)).toBeDefined();
      expect(String(err.message)).toMatch(/accounts real generate/);
      expect(String(err.message)).toMatch(/synthetic/i);
    }
  });

  it("accepts simnet and its aliases only", async () => {
    const { requireLabNetwork } = await import("../src/network-guard.js");
    for (const declared of ["simnet", "SIMNET", " simnet ", "simulated", "kaspa-simnet"]) expect(requireLabNetwork(declared)).toBe("simnet");
  });
});
