import { describe, it, expect } from "vitest";
import { getBroadcastableSignedTransaction } from "../src/signed-tx.js";
import type { SignedTxArtifact } from "../src/types.js";

describe("getBroadcastableSignedTransaction", () => {
  const baseArtifact: any = {
    schema: "hardkas.signedTx",
    hardkasVersion: "0.2.0-alpha",
    version: "1.0.0-alpha",
    status: "signed",
    createdAt: new Date().toISOString(),
    signedId: "signed-123",
    sourcePlanId: "plan-123",
    networkId: "devnet",
    mode: "real",
    from: { address: "kaspa:from" },
    to: { address: "kaspa:to" },
    amountSompi: "1000",
    signedTransaction: { format: "kaspa-sdk", payload: "raw-tx-hex" }
  };

  it("should validate a correct real signed artifact", () => {
    const result = getBroadcastableSignedTransaction(baseArtifact);
    expect(result.rawTransaction).toBe("raw-tx-hex");
  });

  it("should allow simulated artifacts", () => {
    const simulated = { ...baseArtifact, mode: "simulated" as any };
    const result = getBroadcastableSignedTransaction(simulated);
    expect(result.mode).toBe("simulated");
    expect(result.rawTransaction).toBe("raw-tx-hex");
  });

  it("should fail if payload is missing", () => {
    const invalid = { ...baseArtifact, signedTransaction: {} };
    expect(() => getBroadcastableSignedTransaction(invalid)).toThrow(/missing the raw transaction payload/);
  });
});
