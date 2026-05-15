import { describe, it, expect } from "vitest";
import { createDeploymentRecord, updateDeploymentStatus } from "../src/deployment.js";
import { CURRENT_HASH_VERSION } from "../src/canonical.js";

describe("Deployment artifacts", () => {
  it("createDeploymentRecord produces valid contentHash", () => {
    const record = createDeploymentRecord({
      label: "test", 
      networkId: "simnet" as any, 
      status: "sent", 
      txId: "simtx_abc" as any
    });
    expect(record.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("same deployment input produces same hash", () => {
    const r1 = createDeploymentRecord({ label: "test", networkId: "simnet" as any, status: "sent", txId: "simtx_abc" as any });
    const r2 = createDeploymentRecord({ label: "test", networkId: "simnet" as any, status: "sent", txId: "simtx_abc" as any });
    expect(r1.contentHash).toBe(r2.contentHash);
  });

  it("different status produces different hash", () => {
    const r1 = createDeploymentRecord({ label: "test", networkId: "simnet" as any, status: "sent", txId: "simtx_abc" as any });
    const r2 = createDeploymentRecord({ label: "test", networkId: "simnet" as any, status: "confirmed", txId: "simtx_abc" as any });
    expect(r1.contentHash).not.toBe(r2.contentHash);
  });

  it("deployedAt is excluded from hash (deterministic)", async () => {
    const r1 = createDeploymentRecord({ label: "test", networkId: "simnet" as any, status: "sent" });
    // Wait a bit to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));
    const r2 = createDeploymentRecord({ label: "test", networkId: "simnet" as any, status: "sent" });
    
    expect(r1.deployedAt).not.toBe(r2.deployedAt);
    expect(r1.contentHash).toBe(r2.contentHash);
  });

  it("updateDeploymentStatus returns new record with new hash", () => {
    const r1 = createDeploymentRecord({ label: "test", networkId: "simnet" as any, status: "sent" });
    const r2 = updateDeploymentStatus(r1, "confirmed", "tx_123" as any);
    
    expect(r2.status).toBe("confirmed");
    expect(r2.txId).toBe("tx_123");
    expect(r2.contentHash).not.toBe(r1.contentHash);
  });
});
