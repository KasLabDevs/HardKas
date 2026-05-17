import { describe, it, expect } from "vitest";
import { 
  utxoToArtifact, 
  utxoFromArtifact, 
  txOutputToArtifact, 
  txOutputFromArtifact,
  validateTxPlanArtifact,
  HARDKAS_VERSION,
  ARTIFACT_SCHEMAS,
  ARTIFACT_VERSION
} from "../src/index.js";
import { Utxo, TxOutput } from "@hardkas/tx-builder";
import { asTxId, asKaspaAddress } from "@hardkas/core";

describe("Real Transaction Artifacts", () => {
  describe("Conversions", () => {
    it("should convert Utxo <-> UtxoArtifact without loss", () => {
      const utxo: Utxo = {
        outpoint: { transactionId: "abc", index: 0 },
        address: "kaspa:address1",
        amountSompi: 1000000n,
        scriptPublicKey: "script123",
        blockDaaScore: 5000n,
        isCoinbase: false
      };

      const artifact = utxoToArtifact(utxo);
      expect(artifact.amountSompi).toBe("1000000");
      expect(artifact.blockDaaScore).toBe("5000");

      const back = utxoFromArtifact(artifact);
      expect(back).toEqual(utxo);
    });

    it("should convert TxOutput <-> TxOutputArtifact without loss", () => {
      const output: TxOutput = {
        address: "kaspa:address2",
        amountSompi: 500000n
      };

      const artifact = txOutputToArtifact(output);
      expect(artifact.amountSompi).toBe("500000");

      const back = txOutputFromArtifact(artifact);
      expect(back).toEqual(output);
    });

    it("should throw on invalid BigInt string", () => {
      expect(() => utxoFromArtifact({
        outpoint: { transactionId: asTxId("a"), index: 0 },
        address: asKaspaAddress("addr"),
        amountSompi: "invalid",
        scriptPublicKey: "s"
      })).toThrow(/Invalid BigInt string/);
    });
  });

  describe("Validation", () => {
    const validArtifact: any = {
      schema: ARTIFACT_SCHEMAS.TX_PLAN,
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      createdAt: new Date().toISOString(),
      networkId: "simnet",
      mode: "real",
      planId: "p123",
      from: { address: "addr1" },
      to: { address: "addr2" },
      amountSompi: "100",
      inputs: [{
        outpoint: { transactionId: "tx1", index: 0 },
        address: "addr1",
        amountSompi: "1000",
        scriptPublicKey: "spk"
      }],
      outputs: [{ address: "addr2", amountSompi: "100" }],
      estimatedMass: "1000",
      estimatedFeeSompi: "10"
    };

    it("should accept a valid artifact", () => {
      const res = validateTxPlanArtifact(validArtifact);
      expect(res.ok).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it("should reject wrong schema", () => {
      const res = validateTxPlanArtifact({ ...validArtifact, schema: "wrong" });
      expect(res.ok).toBe(false);
      expect(res.errors[0]).toContain("Invalid schema");
    });

    it("should reject invalid bigint strings", () => {
      const res = validateTxPlanArtifact({ ...validArtifact, amountSompi: "abc" });
      expect(res.ok).toBe(false);
      expect(res.errors[0]).toContain("Invalid amountSompi");
    });

    it("should reject missing required fields", () => {
      const { networkId, ...invalid } = validArtifact as any;
      const res = validateTxPlanArtifact(invalid);
      expect(res.ok).toBe(false);
      expect(res.errors).toContain("Missing networkId");
    });
  });
});
