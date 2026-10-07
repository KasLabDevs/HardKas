import { describe, it, expect } from "vitest";
import { systemRuntimeContext, asNetworkId, finalityDepthFor } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../src/canonical.js";
import { createTxObservationArtifact, deriveObserverId } from "../src/tx-observation.js";
import { deriveTxStatus } from "../src/tx-status.js";

// False REORGED (live 2026-10-02, record run 2, tx 7): one node answer can say both "the accepting
// block A left the selected chain" and "chain block B accepts the transaction". The observer records
// that as ONE fact, `chain_accepted(B)` with `removedAcceptingBlockHash: A`; within one observer's
// history B then replaces A. Without that link, two accepting blocks stay incoherent (unchanged).

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };
const TX = "a".repeat(64);
const SIGNED = "b".repeat(64);
const A = "c".repeat(64);
const B = "d".repeat(64);
const OBS = deriveObserverId({ kind: "rpc", target: "simnet", locator: "ws://node-a.test:18210" });

function submission(): any {
  const s: any = {
    schema: "hardkas.txSubmission.v1",
    hardkasVersion: "0.12.0-rc.27",
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simnet",
    mode: "localnet",
    createdAt: "2026-10-02T00:00:00.000Z",
    signedArtifactId: SIGNED,
    txId: TX,
    submitResult: { accepted: true, transactionId: TX },
    submitPoint: { virtualDaaScore: "900", sinkHash: "e".repeat(64), sinkBlueScore: "4900" },
    workflowId: "wf_0000000000000000",
    assumptionLevel: "local-simulated",
    lineage: { artifactId: "", parentArtifactId: SIGNED, lineageId: SIGNED, rootArtifactId: SIGNED, sequence: 3 }
  };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  return s;
}

function obs(finding: any, sinkBlue: bigint): any {
  return createTxObservationArtifact(
    {
      networkId: asNetworkId("simnet") as any,
      mode: "localnet",
      subject: { txId: TX },
      observer: {
        observerId: OBS,
        kind: "rpc",
        networkId: asNetworkId("simnet") as any,
        serverVersion: "2.1.0",
        capabilities: { reorgAware: true },
        description: "observation obtained through the configured RPC observer"
      },
      point: { virtualDaaScore: sinkBlue.toString(), sinkHash: "f".repeat(64), sinkBlueScore: sinkBlue.toString() },
      finding,
      evidence: [{ method: "test", params: {}, responseDigest: "0".repeat(64) }]
    },
    { ...ctx, clock: { now: () => 1_700_000_000_000 + Number(sinkBlue) } }
  );
}
const accepted = (block: string, sinkBlue: bigint, depth: bigint, extra: Record<string, unknown> = {}) =>
  obs({ type: "chain_accepted", acceptingBlockHash: block, acceptingBlueScore: (sinkBlue - depth).toString(), confirmationsBlue: depth.toString(), ...extra }, sinkBlue);

describe("False REORGED · a re-acceptance in the same answer replaces the accepting block", () => {
  it("chain_accepted(B) naming A as removed: the observer's accepting block is B (ACCEPTED, then CONFIRMED), never two blocks", () => {
    const shallow = deriveTxStatus({ txId: TX, submission: submission(), observations: [accepted(A, 5000n, 3n), accepted(B, 5002n, 1n, { removedAcceptingBlockHash: A })] });
    expect(shallow.status).toBe("ACCEPTED");
    expect(shallow.acceptingBlockHash).toBe(B);
    const deep = deriveTxStatus({ txId: TX, submission: submission(), observations: [accepted(A, 5000n, 3n), accepted(B, 5002n, 1n, { removedAcceptingBlockHash: A }), accepted(B, 5101n, 100n)] });
    expect(deep.status).toBe("CONFIRMED");
    expect(deep.acceptingBlockHash).toBe(B);
  });

  it("unchanged guard: two accepting blocks with no removal linking them are still CONFLICTING_OBSERVATIONS", () => {
    const r = deriveTxStatus({ txId: TX, submission: submission(), observations: [accepted(A, 5000n, 3n), accepted(B, 5002n, 1n)] });
    expect(r.status).toBe("CONFLICTING_OBSERVATIONS");
  });

  it("a block this observer saw final cannot be replaced: that history is CONFLICTING_OBSERVATIONS (as a removal of it is)", () => {
    const depth = BigInt(finalityDepthFor("simnet")!);
    const fin = obs({ type: "finality_reached", acceptingBlockHash: A, acceptingBlueScore: "1", confirmationsBlue: (5000n + depth - 1n).toString(), finalityDepth: depth.toString() }, 5000n + depth);
    const r = deriveTxStatus({ txId: TX, submission: submission(), observations: [fin, accepted(B, 5001n + depth, 1n, { removedAcceptingBlockHash: A })] });
    expect(r.status).toBe("CONFLICTING_OBSERVATIONS");
  });

  it("coherence: an observation cannot name its own accepting block as the removed one", () => {
    expect(() => accepted(A, 5000n, 3n, { removedAcceptingBlockHash: A })).toThrow(/OBSERVATION_INCOHERENT/);
  });
});
