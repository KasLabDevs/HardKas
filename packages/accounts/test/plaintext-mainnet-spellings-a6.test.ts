import { describe, it, expect } from "vitest";
import { resolveAccountPrivateKey } from "../src/kaspa-wasm-signer.js";

// A6 (rc2 audit) · the "no plaintext key on mainnet" refusal compared the literal string "mainnet": a plan for
// `mainnet-1`, `kaspa-mainnet`, `kaspa` or `Mainnet` would have used a plaintext key the day the signing lockdown (which
// runs first today) is lifted. Now every spelling the lockdown itself treats as mainnet is refused.

const KEY = "11".repeat(32);
const account = { name: "plain", privateKey: KEY };

describe("A6 · resolveAccountPrivateKey refuses a plaintext key for every mainnet spelling", () => {
  for (const networkId of ["mainnet", "mainnet-1", "kaspa-mainnet", "kaspa", "Mainnet", " MAINNET "]) {
    it(`${JSON.stringify(networkId)} → refused`, async () => {
      await expect(resolveAccountPrivateKey(account, { networkId })).rejects.toThrow(/Unsafe plaintext privateKey fallback is forbidden on mainnet/);
    });
  }

  it("simnet and testnet-10 → the plaintext key is used (unchanged)", async () => {
    await expect(resolveAccountPrivateKey(account, { networkId: "simnet" })).resolves.toBe(KEY);
    await expect(resolveAccountPrivateKey(account, { networkId: "testnet-10" })).resolves.toBe(KEY);
  });
});
