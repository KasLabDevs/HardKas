import { describe, it, expect } from "vitest";
import { 
  validateIgraTxPlanArtifact, 
  validateIgraSignedTxArtifact, 
  validateIgraTxReceiptArtifact,
  createIgraPlanId,
  createIgraSignedId
} from "../src/igra-artifacts.js";
import { ARTIFACT_SCHEMAS, HARDKAS_VERSION } from "../src/constants.js";

describe("Igra Artifacts", () => {
  const common = {
    hardkasVersion: HARDKAS_VERSION,
    networkId: "igra-testnet",
    mode: "l2-rpc",
    createdAt: new Date().toISOString(),
    l2Network: "igra",
    chainId: 12345
  };

  describe("IgraTxPlanArtifact", () => {
    it("should validate a correct plan artifact", () => {
      const artifact = {
        schema: ARTIFACT_SCHEMAS.IGRA_TX_PLAN,
        ...common,
        planId: createIgraPlanId("0".repeat(64)),
        status: "built",
        request: {
          to: "0x0000000000000000000000000000000000000000",
          data: "0x",
          valueWei: "1000000000000000000"
        }
      };
      const result = validateIgraTxPlanArtifact(artifact);
      expect(result.ok).toBe(true);
    });

    it("should reject invalid EVM address", () => {
      const artifact = {
        schema: ARTIFACT_SCHEMAS.IGRA_TX_PLAN,
        ...common,
        planId: createIgraPlanId("0".repeat(64)),
        status: "built",
        request: {
          to: "invalid",
          data: "0x",
          valueWei: "0"
        }
      };
      const result = validateIgraTxPlanArtifact(artifact);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("Invalid request.to: must be a 0x-prefixed 40-character EVM address");
    });

    it("should reject invalid bigint string", () => {
      const artifact = {
        schema: ARTIFACT_SCHEMAS.IGRA_TX_PLAN,
        ...common,
        planId: createIgraPlanId("0".repeat(64)),
        status: "built",
        request: {
          to: "0x0000000000000000000000000000000000000000",
          data: "0x",
          valueWei: "abc"
        }
      };
      const result = validateIgraTxPlanArtifact(artifact);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("Invalid request.valueWei: must be a decimal bigint string");
    });
  });

  describe("IgraSignedTxArtifact", () => {
    it("should validate a correct signed artifact", () => {
      const artifact = {
        schema: ARTIFACT_SCHEMAS.IGRA_SIGNED_TX,
        ...common,
        signedId: createIgraSignedId("0".repeat(64)),
        sourcePlanId: "plan-123",
        status: "signed",
        rawTransaction: "0x1234"
      };
      const result = validateIgraSignedTxArtifact(artifact);
      expect(result.ok).toBe(true);
    });

    it("should reject invalid rawTransaction", () => {
      const artifact = {
        schema: ARTIFACT_SCHEMAS.IGRA_SIGNED_TX,
        ...common,
        signedId: createIgraSignedId("0".repeat(64)),
        sourcePlanId: "plan-123",
        status: "signed",
        rawTransaction: "0x123" // Odd length
      };
      const result = validateIgraSignedTxArtifact(artifact);
      expect(result.ok).toBe(false);
    });
  });

  describe("IgraTxReceiptArtifact", () => {
    it("should validate a correct receipt artifact", () => {
      const artifact = {
        schema: ARTIFACT_SCHEMAS.IGRA_TX_RECEIPT,
        ...common,
        txHash: "0x" + "0".repeat(64),
        rpcUrl: "http://localhost:8545",
        status: "submitted"
      };
      const result = validateIgraTxReceiptArtifact(artifact);
      expect(result.ok).toBe(true);
    });

    it("should reject invalid txHash", () => {
      const artifact = {
        schema: ARTIFACT_SCHEMAS.IGRA_TX_RECEIPT,
        ...common,
        txHash: "0x1234",
        rpcUrl: "http://localhost:8545",
        status: "submitted"
      };
      const result = validateIgraTxReceiptArtifact(artifact);
      expect(result.ok).toBe(false);
    });
  });
});
