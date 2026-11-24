import { describe, it, expect } from "vitest";
import { HardkasFixtureSigner } from "../src/fixture-signer.js";

// AUDIT 2026-11-21 · the fixture signer's mainnet refusal covers every spelling of mainnet, not only the exact word.
describe("fixture signer refuses every spelling of mainnet", () => {
  it("FS-1 constructor", () => {
    for (const id of ["mainnet", "kaspa-mainnet", "Mainnet", "KASPA-MAINNET"]) {
      expect(() => new HardkasFixtureSigner(id), id).toThrow(/mainnet/i);
    }
    for (const id of ["simnet", "testnet-10", "devnet"]) expect(() => new HardkasFixtureSigner(id), id).not.toThrow();
  });
  it("FS-2 signTransaction on a plan of another spelling of mainnet", async () => {
    const s = new HardkasFixtureSigner("simnet");
    for (const id of ["kaspa-mainnet", "Mainnet"]) {
      await expect(s.signTransaction({ networkId: id } as any), id).rejects.toThrow(/mainnet/i);
    }
  });
});
