// Diagnostic (not a repo test): the "consulted much later" variant of the false REORGED. HardKAS held A
// (chain_accepted); A was replaced by B, and by the next look B is already at finality depth, so the
// removal look's re-acceptance finding is finality_reached(B) — which carries no link. What does the
// FIXED derivation say? Uses the worktree's built dists, read-only.
// usage: node diag-finality-variant.mjs <worktree>
import path from "node:path";
import { pathToFileURL } from "node:url";

const wt = path.resolve(process.argv[2]);
const art = await import(pathToFileURL(path.join(wt, "packages", "artifacts", "dist", "index.js")).href);
const core = await import(pathToFileURL(path.join(wt, "packages", "core", "dist", "index.js")).href);
const { createTxObservationArtifact, deriveObserverId, deriveTxStatus, calculateContentHash, CURRENT_HASH_VERSION } = art;
const { systemRuntimeContext, asNetworkId, finalityDepthFor } = core;

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };
const TX = "a".repeat(64);
const SIGNED = "b".repeat(64);
const A = "c".repeat(64);
const B = "d".repeat(64);
const OBS = deriveObserverId({ kind: "rpc", target: "simnet", locator: "ws://node-a.test:18210" });

function submission() {
  const s = {
    schema: "hardkas.txSubmission.v1",
    hardkasVersion: "0.12.0-rc.26",
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
function obs(finding, sinkBlue) {
  return createTxObservationArtifact(
    {
      networkId: asNetworkId("simnet"),
      mode: "localnet",
      subject: { txId: TX },
      observer: { observerId: OBS, kind: "rpc", networkId: asNetworkId("simnet"), serverVersion: "2.1.0", capabilities: { reorgAware: true }, description: "observation obtained through the configured RPC observer" },
      point: { virtualDaaScore: sinkBlue.toString(), sinkHash: "f".repeat(64), sinkBlueScore: sinkBlue.toString() },
      finding,
      evidence: [{ method: "test", params: {}, responseDigest: "0".repeat(64) }]
    },
    { ...ctx, clock: { now: () => 1_700_000_000_000 + Number(sinkBlue) } }
  );
}
const depth = BigInt(finalityDepthFor("simnet"));
const heldA = obs({ type: "chain_accepted", acceptingBlockHash: A, acceptingBlueScore: "4997", confirmationsBlue: "3" }, 5000n);
const laterFinalB = obs({ type: "finality_reached", acceptingBlockHash: B, acceptingBlueScore: "4998", confirmationsBlue: (5002n + depth - 4998n).toString(), finalityDepth: depth.toString() }, 5002n + depth);
const removedA = obs({ type: "chain_removed", acceptingBlockHash: A }, 5002n + depth);

const show = (label, r) => console.log(`${label}: ${r.status}${r.acceptingBlockHash ? ` (${r.acceptingBlockHash.slice(0, 4)}…)` : ""} — ${(r.reasons ?? [])[0] ?? ""}`);
show("fixed observer's finding  [chain_accepted(A), finality_reached(B)]", deriveTxStatus({ txId: TX, submission: submission(), observations: [heldA, laterFinalB] }));
show("HEAD observer's finding   [chain_accepted(A), chain_removed(A)]    ", deriveTxStatus({ txId: TX, submission: submission(), observations: [heldA, removedA] }));
