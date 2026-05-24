import { describe, it, expect } from "vitest";
import { reconstructStateAtDaa } from "../src/state.js";
import { LocalnetState } from "../src/types.js";
import { ARTIFACT_SCHEMAS, HARDKAS_VERSION } from "@hardkas/artifacts";

describe("State Reconstruction (Time Travel)", () => {
  it("mathematically reconstructs UTXO state to a previous DAA score", () => {
    // Mock state simulating various points in time
    const mockState: LocalnetState = {
      schema: ARTIFACT_SCHEMAS.LOCALNET_STATE,
      hardkasVersion: HARDKAS_VERSION,
      version: "1.0",
      createdAt: new Date().toISOString(),
      mode: "simulated",
      networkId: "simulated",
      daaScore: "100",
      accounts: [],
      snapshots: [],
      utxos: [
        {
          id: "utxo_1_genesis",
          address: "kaspa:alice",
          amountSompi: "1000",
          spent: false,
          createdAtDaaScore: "0"
        },
        {
          id: "utxo_2_spent_early",
          address: "kaspa:bob",
          amountSompi: "500",
          spent: true,
          createdAtDaaScore: "10",
          spentAtDaaScore: "20"
        },
        {
          id: "utxo_3_spent_late",
          address: "kaspa:charlie",
          amountSompi: "250",
          spent: true,
          createdAtDaaScore: "15",
          spentAtDaaScore: "80"
        },
        {
          id: "utxo_4_created_late",
          address: "kaspa:alice",
          amountSompi: "2000",
          spent: false,
          createdAtDaaScore: "80"
        }
      ]
    };

    // Revert state to DAA 50
    // Expected behavior:
    // utxo_1_genesis: keep, unspent (created 0 <= 50)
    // utxo_2_spent_early: keep, spent (created 10 <= 50, spent 20 <= 50)
    // utxo_3_spent_late: keep, UNSPENT (created 15 <= 50, but spent 80 > 50)
    // utxo_4_created_late: DELETE (created 80 > 50)
    
    const reconstructed = reconstructStateAtDaa(mockState, 50n);

    expect(reconstructed.daaScore).toBe("50");
    expect(reconstructed.utxos.length).toBe(3); // utxo_4 is wiped out from timeline

    const genesis = reconstructed.utxos.find(u => u.id === "utxo_1_genesis");
    expect(genesis?.spent).toBe(false);

    const early = reconstructed.utxos.find(u => u.id === "utxo_2_spent_early");
    expect(early?.spent).toBe(true);
    expect(early?.spentAtDaaScore).toBe("20");

    const late = reconstructed.utxos.find(u => u.id === "utxo_3_spent_late");
    expect(late?.spent).toBe(false); // Revived!
    expect(late?.spentAtDaaScore).toBeUndefined(); // Dropped the temporal property
  });
});
