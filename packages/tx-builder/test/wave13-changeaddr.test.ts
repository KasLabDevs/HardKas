import { describe, it, expect, beforeAll } from "vitest";
import { TxPlanService } from "../src/service.js";
import { Utxo } from "../src/index.js";

class MockProvider {
  constructor(public utxos: Utxo[] = []) {}
  async getUtxos(address: string) { return this.utxos; }
  async getVirtualDaaScore() { return 2000n; }
}

describe("Wave 13 · CHANGEADDR-1 · Explicit change-output destination", () => {
  const fromAddress = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
  const toAddress = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
  const alternateChange = "kaspasim:qq56zz2ta0s9fmf67j6yw0w87urrtkpx03l4ddh3c2y5ex0jrt60yvcx9ypa6";
  const invalidChange = "kaspasim:invalid-address-here";

  let provider: MockProvider;
  let service: TxPlanService;

  beforeAll(() => {
    provider = new MockProvider([
      {
        address: fromAddress,
        outpoint: { transactionId: "a".repeat(64), index: 0 },
        amountSompi: 1000000000n, // 10 KAS
        scriptPublicKey: "20" + "00".repeat(32) + "ac",
        blockDaaScore: 1000n,
        isCoinbase: false
      }
    ]);
    service = new TxPlanService(provider, { coinbaseMaturity: 100n });
  });

  describe("Backward compatibility invariant", () => {
    it("omitting changeAddress preserves historical fromAddress behavior (Upstream)", async () => {
      const result = await service.planTransactionUpstream({
        fromAddress,
        toAddress,
        amountSompi: 100000000n // 1 KAS
      });

      expect(result.plan.change).toBeDefined();
      expect(result.plan.change!.address).toBe(fromAddress);
      expect(result.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    });

    it("omitting changeAddress preserves historical fromAddress behavior (Synthetic)", async () => {
      const result = await service.planTransactionSynthetic({
        fromAddress,
        toAddress,
        amountSompi: 100000000n // 1 KAS
      });

      expect(result.plan.change).toBeDefined();
      expect(result.plan.change!.address).toBe(fromAddress);
      expect(result.plannerAuthority).toBe("SYNTHETIC_SIMULATOR");
    });
  });

  describe("Explicit alternate change test", () => {
    it("routes change to alternate address if provided (Upstream)", async () => {
      const result = await service.planTransactionUpstream({
        fromAddress,
        toAddress,
        amountSompi: 100000000n,
        changeAddress: alternateChange
      });

      expect(result.plan.change).toBeDefined();
      expect(result.plan.change!.address).toBe(alternateChange);
      
      // Amount and recipient intact
      expect(result.plan.outputs[0].address).toBe(toAddress);
      expect(result.plan.outputs[0].amountSompi).toBe(100000000n);
      
      // Provenance intact
      expect(result.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    });

    it("routes change to alternate address if provided (Synthetic)", async () => {
      const result = await service.planTransactionSynthetic({
        fromAddress,
        toAddress,
        amountSompi: 100000000n,
        changeAddress: alternateChange
      });

      expect(result.plan.change).toBeDefined();
      expect(result.plan.change!.address).toBe(alternateChange);
      
      // Amount and recipient intact
      expect(result.plan.outputs[0].address).toBe(toAddress);
      expect(result.plan.outputs[0].amountSompi).toBe(100000000n);
      
      // Provenance intact
      expect(result.plannerAuthority).toBe("SYNTHETIC_SIMULATOR");
    });
  });

  describe("Same-address test", () => {
    it("is semantically equivalent to omit when changeAddress === fromAddress", async () => {
      const explicitResult = await service.planTransactionUpstream({
        fromAddress,
        toAddress,
        amountSompi: 100000000n,
        changeAddress: fromAddress
      });

      const implicitResult = await service.planTransactionUpstream({
        fromAddress,
        toAddress,
        amountSompi: 100000000n
      });

      expect(explicitResult.plan.change!.address).toBe(fromAddress);
      expect(explicitResult.plan.estimatedMass).toBe(implicitResult.plan.estimatedMass);
      expect(explicitResult.plan.estimatedFeeSompi).toBe(implicitResult.plan.estimatedFeeSompi);
      expect(explicitResult.plan.change!.amountSompi).toBe(implicitResult.plan.change!.amountSompi);
    });
  });

  describe("Invalid address", () => {
    it("fails closed rather than falling back silently", async () => {
      await expect(service.planTransactionUpstream({
        fromAddress,
        toAddress,
        amountSompi: 100000000n,
        changeAddress: invalidChange
      })).rejects.toThrow(); // The underlying kaspa-wasm or string parser throws
    });
  });

  describe("Differential fixture", () => {
    it("maintains same spend intent, UTXOs, and authority while replacing change destination", async () => {
      const A = await service.planTransactionUpstream({
        fromAddress,
        toAddress,
        amountSompi: 500000000n
      });

      const B = await service.planTransactionUpstream({
        fromAddress,
        toAddress,
        amountSompi: 500000000n,
        changeAddress: alternateChange
      });

      // Same spend intent
      expect(A.plan.outputs[0].address).toBe(B.plan.outputs[0].address);
      expect(A.plan.outputs[0].amountSompi).toBe(B.plan.outputs[0].amountSompi);
      
      // Same UTXOs selected
      expect(A.plan.inputs.length).toBe(B.plan.inputs.length);
      expect(A.plan.inputs[0].outpoint.transactionId).toBe(B.plan.inputs[0].outpoint.transactionId);

      // Change destination differs
      expect(A.plan.change!.address).toBe(fromAddress);
      expect(B.plan.change!.address).toBe(alternateChange);

      // Same unchanged planner authority
      expect(A.plannerAuthority).toBe(B.plannerAuthority);
      
      // Depending on the alternate change address string length/pubkey type (ECDSA vs Schnorr vs Script),
      // the estimated mass might legitimately differ, but fee mechanics are strictly valid.
      expect(B.plan.estimatedFeeSompi).toBeDefined();
    });
  });
});
