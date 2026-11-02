import { describe, it, expect } from "vitest";
import { utxoToArtifact, utxoFromArtifact } from "../src/conversions.js";

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1C (F1.0-ter, 2026-10-25). The UTXO ⇄ artifact conversions keep a UTXO's covenant id: a
// persisted UTXO read back still says it belongs to a covenant, so no payment path can take it as ordinary.
// -----------------------------------------------------------------------------

const COVENANT_ID = "c0".repeat(32);
const base = {
  outpoint: { transactionId: "ab".repeat(32), index: 1 },
  address: "kaspasim:qcovenant",
  amountSompi: 100_000_000n,
  scriptPublicKey: "0000" + "20" + "11".repeat(32) + "ac",
  blockDaaScore: 7n,
  isCoinbase: false
};

describe("COVENANT-UTXO-PAYMENT-FILTER-1C · artifact conversions keep the covenant id", () => {
  it("CC-A1: utxoToArtifact keeps it and utxoFromArtifact gives it back", () => {
    const artifact = utxoToArtifact({ ...base, covenantId: COVENANT_ID } as any);
    expect((artifact as any).covenantId).toBe(COVENANT_ID);
    expect((utxoFromArtifact(artifact) as any).covenantId).toBe(COVENANT_ID);
  });

  it("CC-A2 (control): an ordinary UTXO round-trips without a covenant id key", () => {
    const artifact = utxoToArtifact(base as any);
    expect("covenantId" in artifact).toBe(false);
    expect("covenantId" in utxoFromArtifact(artifact)).toBe(false);
  });
});
