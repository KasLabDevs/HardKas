import { describe, it, expect } from "vitest";
import { createLocalnetSnapshot } from "../src/snapshot.js";
import { saveLocalnetState } from "../src/store.js";
import { LocalnetState } from "../src/types.js";
import { ProjectArtifactStore } from "@hardkas/artifacts";
import { asNetworkId } from "@hardkas/core";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Helper to create mock state
function createMockState(
  accounts: Array<{ name: string; address: string }>,
  utxos: Array<any>
): LocalnetState {
  return {
    schema: "hardkas.localnetState.v1",
    hardkasVersion: "1.0.0",
    version: "1.0.0-alpha",
    mode: "simulator",
    networkId: asNetworkId("simnet"),
    daaScore: "100",
    createdAt: "2026-08-21T00:00:00.000Z",
    accounts,
    utxos
  };
}

describe("Localnet Snapshot Determinism", () => {
  it("should generate the same artifactId regardless of array order or timestamp", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-test-"));
    const store = new ProjectArtifactStore(tempDir);
    
    // State A1
    const stateA1 = createMockState(
      [
        { name: "Alice", address: "kaspatest:alice" },
        { name: "Bob", address: "kaspatest:bob" }
      ],
      [
        { id: "utxo1", outpoint: { transactionId: "00", index: 0 }, amountSompi: "100" },
        { id: "utxo2", outpoint: { transactionId: "11", index: 1 }, amountSompi: "200" }
      ]
    );

    // State A2 (same content, different order)
    const stateA2 = createMockState(
      [
        { name: "Bob", address: "kaspatest:bob" },
        { name: "Alice", address: "kaspatest:alice" }
      ],
      [
        { id: "utxo2", outpoint: { transactionId: "11", index: 1 }, amountSompi: "200" },
        { id: "utxo1", outpoint: { transactionId: "00", index: 0 }, amountSompi: "100" }
      ]
    );

    // Write state A1
    const targetPathA1 = path.join(tempDir, ".hardkas", "localnet", "state-a1.json");
    await saveLocalnetState(stateA1, targetPathA1);

    // Wait a bit to ensure timestamp would be different if it mattered (even though we removed it)
    await new Promise(resolve => setTimeout(resolve, 50));

    // Write state A2
    const targetPathA2 = path.join(tempDir, ".hardkas", "localnet", "state-a2.json");
    await saveLocalnetState(stateA2, targetPathA2);

    // Query artifacts
    const artifacts = await store.queryArtifacts({ schema: "hardkas.snapshot.v1" });
    
    // There should only be ONE unique artifact because content is identical
    // But since store.writeArtifact overwrites by artifactId (hash), we should just see 1 artifact!
    // Or if it writes multiple, they have the exact same artifactId.
    
    const uniqueIds = new Set(artifacts.map(a => a.artifactId));
    expect(uniqueIds.size).toBe(1);

    // State B (different content)
    const stateB = createMockState(
      [
        { name: "Alice", address: "kaspatest:alice" }
      ],
      [
        { id: "utxo1", outpoint: { transactionId: "00", index: 0 }, amountSompi: "100" }
      ]
    );

    const targetPathB = path.join(tempDir, ".hardkas", "localnet", "state-b.json");
    await saveLocalnetState(stateB, targetPathB);

    const artifactsAfterB = await store.queryArtifacts({ schema: "hardkas.snapshot.v1" });
    const uniqueIdsAfterB = new Set(artifactsAfterB.map(a => a.artifactId));
    
    expect(uniqueIdsAfterB.size).toBe(2);
  });
});
