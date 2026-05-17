import { describe, it, expect } from "vitest";
import { serializeBridgePayload, deserializeBridgePayload, BridgeEntryPayload } from "../src/payload.js";
import { simulatePrefixMining } from "../src/prefix-miner.js";

describe("Bridge Local", () => {
  describe("Payload Serialization", () => {
    it("performs roundtrip serialize -> deserialize", () => {
      const payload: BridgeEntryPayload = {
        marker: "IGRA",
        targetEvmAddress: "0x1234567890123456789012345678901234567890",
        amountSompi: 100000000n,
        networkId: "sm" as any,
        nonce: 42
      };

      const hex = serializeBridgePayload(payload);
      const decoded = deserializeBridgePayload(hex);

      expect(decoded.marker).toBe(payload.marker);
      expect(decoded.targetEvmAddress.toLowerCase()).toBe(payload.targetEvmAddress.toLowerCase());
      expect(decoded.amountSompi).toBe(payload.amountSompi);
      expect(decoded.networkId).toBe(payload.networkId);
      expect(decoded.nonce).toBe(payload.nonce);
    });

    it("produces stable hex for fixed input", () => {
      const payload: BridgeEntryPayload = {
        marker: "IGRA",
        targetEvmAddress: "0x0000000000000000000000000000000000000001",
        amountSompi: 1n,
        networkId: "sm" as any,
        nonce: 0
      };

      const hex1 = serializeBridgePayload(payload);
      const hex2 = serializeBridgePayload(payload);

      expect(hex1).toBe(hex2);
      expect(hex1).toBe("4947524100000000000000000000000000000000000000010000000000000001736d00000000");
    });
  });

  describe("Prefix Mining Simulation", () => {
    const basePayload = {
      marker: "IGRA",
      targetEvmAddress: "0x1234567890123456789012345678901234567890",
      amountSompi: 100000000n,
      networkId: "sm" as any
    };

    it("returns deterministic result for fixed input", () => {
      const prefix = "00";
      const result1 = simulatePrefixMining(basePayload, prefix, { maxAttempts: 1000 });
      const result2 = simulatePrefixMining(basePayload, prefix, { maxAttempts: 1000 });

      expect(result1.nonce).toBe(result2.nonce);
      expect(result1.hash).toBe(result2.hash);
      expect(result1.hash.startsWith(prefix)).toBe(true);
    });

    it("fails when max attempts reached", () => {
      const impossiblePrefix = "ffffffff"; // Unlikely to find in 10 attempts
      expect(() => simulatePrefixMining(basePayload, impossiblePrefix, { maxAttempts: 10 }))
        .toThrow(/Failed to find prefix/);
    });

    it("respects start nonce", () => {
      const prefix = "0";
      const result1 = simulatePrefixMining(basePayload, prefix);
      const result2 = simulatePrefixMining(basePayload, prefix, { initialNonce: result1.nonce + 1 });

      expect(result2.nonce).toBeGreaterThan(result1.nonce);
      expect(result2.hash.startsWith(prefix)).toBe(true);
    });
  });
});
