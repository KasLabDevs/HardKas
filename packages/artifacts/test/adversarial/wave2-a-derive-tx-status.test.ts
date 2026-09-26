import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { systemRuntimeContext, asNetworkId, KASPA_NETWORK_PARAMS, KASPA_CONSENSUS_PARAMS_PROVENANCE, finalityDepthFor } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../../src/canonical.js";
import { verifyArtifactIntegritySync, verifyArtifactSemantics } from "../../src/verify.js";
import { createTxPlanArtifact } from "../../src/tx-plan.js";
import { createSimulatedTxReceipt, syntheticTxIdFor } from "../../src/signed-tx.js";
import { createTxObservationArtifact, checkTxObservationCoherence, deriveObserverId, OBSERVER_ID_PATTERN } from "../../src/tx-observation.js";
import { deriveTxStatus, isConfirmed, TX_STATUS_POLICY_HARDKAS_DEFAULT_V1 } from "../../src/tx-status.js";
import { ProjectArtifactStore } from "../../src/store.js";

// Wave 2(a) · Q4 (ratified 2026-09-26) · IC-2′.3–.8 · T-RS-1…9
// "Persist facts; derive states." Submission and observations are immutable
// evidence; ACCEPTED / CONFIRMED(n) / REORGED / FINALIZED are derived under a
// versioned policy. Confirmations are blue-score depth (the node's unit).

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };
const TX = "a".repeat(64);
const SIGNED = "b".repeat(64);
const B1 = "c".repeat(64);
const B2 = "d".repeat(64);
const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);

function submission(accepted: boolean, txId = TX): any {
  const s: any = {
    schema: "hardkas.txSubmission.v1",
    hardkasVersion: "0.12.0-rc.23",
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simnet",
    mode: "localnet",
    createdAt: "2026-09-26T00:00:00.000Z",
    signedArtifactId: SIGNED,
    txId,
    submitResult: accepted ? { accepted: true, transactionId: txId } : { accepted: false, error: "Rejected transaction: orphan" },
    submitPoint: { virtualDaaScore: "900", sinkHash: "e".repeat(64), sinkBlueScore: "4900" },
    workflowId: "wf_0000000000000000",
    assumptionLevel: "local-simulated",
    lineage: { artifactId: "", parentArtifactId: SIGNED, lineageId: SIGNED, rootArtifactId: SIGNED, sequence: 3 }
  };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  return s;
}

type Point = { sinkBlueScore: bigint; virtualDaaScore?: bigint; sinkHash?: string };

// Two distinct observer instances (stable, opaque): the default one and a second node.
const OBS_A = deriveObserverId({ kind: "rpc", target: "simnet", locator: "ws://node-a.test:18210" });
const OBS_B = deriveObserverId({ kind: "rpc", target: "simnet", locator: "ws://node-b.test:18210" });

function obs(finding: any, point: Point, extra: { networkId?: string; kind?: "rpc" | "synthetic"; txId?: string; observedAt?: number; observerId?: string } = {}): any {
  const at = extra.observedAt ?? 1_700_000_000_000 + Number(point.sinkBlueScore);
  return createTxObservationArtifact(
    {
      networkId: asNetworkId(extra.networkId ?? "simnet") as any,
      mode: extra.kind === "synthetic" ? "simulator" : "localnet",
      subject: { txId: extra.txId ?? TX },
      observer: {
        observerId: extra.observerId ?? OBS_A,
        kind: extra.kind ?? "rpc",
        networkId: asNetworkId(extra.networkId ?? "simnet") as any,
        serverVersion: "2.0.1",
        capabilities: { reorgAware: true },
        description: extra.kind === "synthetic" ? "synthetic observation produced by the HardKAS simulator (no network)" : "observation obtained through the configured RPC observer"
      },
      point: {
        virtualDaaScore: (point.virtualDaaScore ?? point.sinkBlueScore).toString(),
        sinkHash: point.sinkHash ?? "f".repeat(64),
        sinkBlueScore: point.sinkBlueScore.toString()
      },
      finding,
      evidence: [{ method: "test", params: {}, responseDigest: "0".repeat(64) }]
    },
    { ...ctx, clock: { now: () => at } }
  );
}

const accepted = (block: string, sinkBlue: bigint, depth: bigint, daaDepth?: bigint, observerId?: string) =>
  obs(
    {
      type: "chain_accepted",
      acceptingBlockHash: block,
      acceptingBlueScore: (sinkBlue - depth).toString(),
      acceptingDaaScore: ((daaDepth !== undefined ? sinkBlue + 10_000n : sinkBlue) - (daaDepth ?? depth)).toString(),
      confirmationsBlue: depth.toString(),
      confirmationsDaa: (daaDepth ?? depth).toString()
    },
    { sinkBlueScore: sinkBlue, virtualDaaScore: daaDepth !== undefined ? sinkBlue + 10_000n : sinkBlue },
    { ...(observerId ? { observerId } : {}) }
  );
const removed = (block: string, sinkBlue: bigint, observerId?: string) =>
  obs({ type: "chain_removed", acceptingBlockHash: block }, { sinkBlueScore: sinkBlue }, { ...(observerId ? { observerId } : {}) });
const mempool = (isOrphan: boolean, sinkBlue: bigint, observerId?: string) =>
  obs({ type: "mempool_entry", isOrphan, feeSompi: "1000" }, { sinkBlueScore: sinkBlue }, { ...(observerId ? { observerId } : {}) });
const finality = (
  block: string,
  sinkBlue: bigint,
  depth: bigint,
  networkId = "simnet",
  declaredDepth = String(finalityDepthFor(networkId) ?? 432_000),
  observerId?: string
) =>
  obs(
    { type: "finality_reached", acceptingBlockHash: block, acceptingBlueScore: (sinkBlue - depth).toString(), confirmationsBlue: depth.toString(), finalityDepth: declaredDepth },
    { sinkBlueScore: sinkBlue },
    { networkId, ...(observerId ? { observerId } : {}) }
  );

describe("Wave 2(a) · upstream parameters are provenanced, not chosen", () => {
  it("finality depth is the verified rusty-kaspa value for every network HardKAS runs against, and unknown for the rest", () => {
    for (const net of ["mainnet", "testnet-10", "simnet", "devnet"]) {
      expect(KASPA_NETWORK_PARAMS[net]!.finalityDepth, net).toBe(432_000);
      expect(KASPA_NETWORK_PARAMS[net]!.bps).toBe(10);
    }
    expect(finalityDepthFor("simulated")).toBeUndefined();
    expect(finalityDepthFor("testnet-11")).toBeUndefined();
    expect(KASPA_CONSENSUS_PARAMS_PROVENANCE.source).toBe("kaspanet/rusty-kaspa");
    expect(KASPA_CONSENSUS_PARAMS_PROVENANCE.refs).toContain("v2.0.1");
    expect(KASPA_CONSENSUS_PARAMS_PROVENANCE.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("the default policy is an explicit HardKAS product choice, never presented as a Kaspa parameter", () => {
    expect(TX_STATUS_POLICY_HARDKAS_DEFAULT_V1.origin).toBe("hardkas-product-default");
    expect(TX_STATUS_POLICY_HARDKAS_DEFAULT_V1.minConfirmations).toBe(100);
    expect(TX_STATUS_POLICY_HARDKAS_DEFAULT_V1.confirmationUnit).toBe("blue-score");
    expect(TX_STATUS_POLICY_HARDKAS_DEFAULT_V1.policyVersion).toBe(1);
  });
});

describe("Wave 2(a) · deriveTxStatus (T-RS)", () => {
  it("T-RS-1 · a submission alone: SUBMITTED means the submit call succeeded at that instant, never CONFIRMED; rejected → REJECTED_BY_NODE; nothing → INSUFFICIENT_EVIDENCE", () => {
    const ok = deriveTxStatus({ txId: TX, submission: submission(true), observations: [] });
    expect(ok.status).toBe("SUBMITTED");
    expect(isConfirmed(ok)).toBe(false);
    expect(ok.evidence.submissionArtifactId).toMatch(/^[0-9a-f]{64}$/);
    expect(deriveTxStatus({ txId: TX, submission: submission(false), observations: [] }).status).toBe("REJECTED_BY_NODE");
    const none = deriveTxStatus({ txId: TX, observations: [] });
    expect(none.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(none.isFinal).toBe(false);
  });

  it("T-RS-2 · a mempool entry decides MEMPOOL_ACCEPTED, an orphan entry MEMPOOL_ORPHAN; absence is not evidence", () => {
    expect(deriveTxStatus({ txId: TX, submission: submission(true), observations: [mempool(false, 5000n)] }).status).toBe("MEMPOOL_ACCEPTED");
    expect(deriveTxStatus({ txId: TX, submission: submission(true), observations: [mempool(true, 5000n)] }).status).toBe("MEMPOOL_ORPHAN");
    const absent = deriveTxStatus({
      txId: TX,
      submission: submission(true),
      observations: [obs({ type: "mempool_absent" }, { sinkBlueScore: 5000n }), obs({ type: "not_found", scannedChainBlocks: 10 }, { sinkBlueScore: 5001n })]
    });
    expect(absent.status).toBe("SUBMITTED");
    expect(absent.reasons.join(" ")).toMatch(/not evidence/);
  });

  it("T-RS-3 · ACCEPTED below the policy depth, CONFIRMED at it; the unit is blue score (a large DAA delta never confirms)", () => {
    const shallow = deriveTxStatus({ txId: TX, submission: submission(true), observations: [accepted(B1, 5000n, 99n)] });
    expect(shallow.status).toBe("ACCEPTED");
    expect(shallow.confirmations).toEqual({ blue: "99", daa: "99", unit: "blue-score" });
    expect(shallow.acceptingBlockHash).toBe(B1);
    expect(isConfirmed(shallow)).toBe(false);

    const deep = deriveTxStatus({ txId: TX, submission: submission(true), observations: [accepted(B1, 5000n, 100n)] });
    expect(deep.status).toBe("CONFIRMED");
    expect(isConfirmed(deep)).toBe(true);
    expect(deep.reasons.join(" ")).toMatch(/hardkas\.txStatusPolicy\.default v1 \(100, hardkas-product-default\)/);
    expect(deep.reasons.join(" ").toLowerCase()).not.toMatch(/kaspa parameter|upstream/);

    // DAA depth 9,000 with blue depth 3: still ACCEPTED (confirmations are blue score).
    const daaHigh = deriveTxStatus({ txId: TX, submission: submission(true), observations: [accepted(B1, 5000n, 3n, 9000n)] });
    expect(daaHigh.status).toBe("ACCEPTED");
    expect(daaHigh.confirmations).toEqual({ blue: "3", daa: "9000", unit: "blue-score" });

    // A caller's policy is a policy: 5 blue confirmations satisfy `isConfirmed(policy)`.
    const user = { ...TX_STATUS_POLICY_HARDKAS_DEFAULT_V1, policyId: "test.policy", origin: "user" as const, minConfirmations: 5 };
    const withUser = deriveTxStatus({ txId: TX, submission: submission(true), observations: [accepted(B1, 5000n, 5n)], policy: user });
    expect(withUser.status).toBe("CONFIRMED");
    expect(isConfirmed(shallow, user)).toBe(true);
  });

  it("T-RS-4 · acceptance then removal of the accepting block is REORGED; a later acceptance by another block is ACCEPTED again", () => {
    const reorged = deriveTxStatus({ txId: TX, submission: submission(true), observations: [accepted(B1, 5000n, 10n), removed(B1, 5010n)] });
    expect(reorged.status).toBe("REORGED");
    expect(reorged.isFinal).toBe(false);
    const again = deriveTxStatus({
      txId: TX,
      submission: submission(true),
      observations: [accepted(B1, 5000n, 10n), removed(B1, 5010n), accepted(B2, 5020n, 4n)]
    });
    expect(again.status).toBe("ACCEPTED");
    expect(again.acceptingBlockHash).toBe(B2);
  });

  it("T-RS-5 · FINALIZED only at the network's verified finality depth with the block on the chain; shallower or mis-declared finality is refused as incoherent", () => {
    const depth = BigInt(finalityDepthFor("simnet")!);
    const fin = deriveTxStatus({ txId: TX, submission: submission(true), observations: [accepted(B1, 5000n, 10n), finality(B1, 5000n + depth, depth)] });
    expect(fin.status).toBe("FINALIZED");
    expect(fin.isFinal).toBe(true);
    expect(fin.finality).toMatchObject({ depth: depth.toString(), rule: "kaspa-virtual-chain-finality" });
    expect(fin.finality!.asObservedAt.sinkBlueScore).toBe((5000n + depth).toString());
    expect(fin.reasons.join(" ")).toMatch(/final according to the observed Kaspa virtual-chain finality rule/);
    expect(fin.reasons.join(" ").toLowerCase()).not.toMatch(/irreversible/);

    // Producer refuses: depth below finality, wrong declared depth, network without a verified depth.
    expect(() => finality(B1, 5000n + depth - 1n, depth - 1n)).toThrow(/OBSERVATION_INCOHERENT/);
    expect(() =>
      obs(
        { type: "finality_reached", acceptingBlockHash: B1, acceptingBlueScore: "0", confirmationsBlue: (5000n + depth).toString(), finalityDepth: "1" },
        { sinkBlueScore: 5000n + depth }
      )
    ).toThrow(/verified upstream depth/);
    expect(() => finality(B1, 5000n + depth, depth, "testnet-11")).toThrow(/no verified finality depth/);

    // Hand-sealed incoherent observation: the verifier flags it and the derivation ignores it.
    const forged: any = structuredClone(finality(B1, 5000n + depth, depth));
    forged.finding.confirmationsBlue = "1";
    forged.finding.acceptingBlueScore = (5000n + depth - 1n).toString();
    delete forged.contentHash;
    forged.contentHash = calculateContentHash(forged, CURRENT_HASH_VERSION);
    const v = verifyArtifactIntegritySync(structuredClone(forged), { strict: true });
    expect(v.ok).toBe(false);
    expect(codes(v)).toContain("OBSERVATION_INCOHERENT");
    const derived = deriveTxStatus({ txId: TX, submission: submission(true), observations: [forged] });
    expect(derived.status).toBe("SUBMITTED");
    expect(derived.evidence.ignored.some((i) => /incoherent/.test(i.reason))).toBe(true);
  });

  it("T-RS-6 · finality followed by removal of the same block is CONFLICTING_OBSERVATIONS (the protocol excludes it)", () => {
    const depth = BigInt(finalityDepthFor("simnet")!);
    const r = deriveTxStatus({
      txId: TX,
      submission: submission(true),
      observations: [finality(B1, 5000n + depth, depth), removed(B1, 5001n + depth)]
    });
    expect(r.status).toBe("CONFLICTING_OBSERVATIONS");
    expect(r.isFinal).toBe(false);
  });

  it("T-RS-7 · a pruned observer yields UNOBSERVABLE_PRUNED, never finality by age; an earlier durable finality observation stands", () => {
    const pruned = obs({ type: "pruned_unobservable", reason: "start hash below the pruning point" }, { sinkBlueScore: 9_000_000n });
    const r = deriveTxStatus({ txId: TX, submission: submission(true), observations: [pruned] });
    expect(r.status).toBe("UNOBSERVABLE_PRUNED");
    const depth = BigInt(finalityDepthFor("simnet")!);
    const durable = deriveTxStatus({ txId: TX, submission: submission(true), observations: [finality(B1, 5000n + depth, depth), pruned] });
    expect(durable.status).toBe("FINALIZED");
  });

  it("T-RS-8 · LEGACY-scope or tampered observations never decide; they are reported as ignored", () => {
    const legacy: any = structuredClone(accepted(B1, 5000n, 500n));
    legacy.hashVersion = 4;
    delete legacy.contentHash;
    legacy.contentHash = calculateContentHash(legacy, 4);
    const tampered: any = structuredClone(accepted(B1, 5000n, 500n));
    tampered.finding.confirmationsBlue = "600";
    tampered.finding.acceptingBlueScore = "4400";
    const r = deriveTxStatus({ txId: TX, submission: submission(true), observations: [legacy, tampered] });
    expect(r.status).toBe("SUBMITTED");
    expect(r.evidence.ignored.length).toBe(2);
    expect(r.evidence.ignored.map((i) => i.reason).join(" | ")).toMatch(/LEGACY/);
    expect(r.evidence.ignored.map((i) => i.reason).join(" | ")).toMatch(/identity does not verify/);
  });

  it("T-RS-9 · the simulator never yields CONFIRMED/FINALIZED: SYNTHETIC_EXECUTED; synthetic plus network evidence is a conflict", () => {
    const plan: any = createTxPlanArtifact({
      ctx,
      networkId: asNetworkId("simnet") as any,
      mode: "simulator",
      from: { input: "alice", address: "kaspasim:qqalice", accountName: "alice" },
      to: { input: "bob", address: "kaspasim:qqbob" },
      amountSompi: 500n,
      plan: {
        inputs: [{ outpoint: { transactionId: "ab".repeat(32), index: 0 }, amountSompi: 1000n, address: "kaspasim:qqalice", scriptPublicKey: "spk" }],
        outputs: [{ address: "kaspasim:qqbob", amountSompi: 500n }],
        change: { address: "kaspasim:qqalice", amountSompi: 490n },
        estimatedFeeSompi: 10n,
        estimatedMass: 100n
      } as any
    });
    const txId = syntheticTxIdFor(plan.contentHash);
    const receipt = createSimulatedTxReceipt(plan, txId, ctx, { preStateHash: "1".repeat(64), postStateHash: "2".repeat(64) });
    const r = deriveTxStatus({ txId, submission: receipt, observations: [] });
    expect(r.status).toBe("SYNTHETIC_EXECUTED");
    expect(isConfirmed(r)).toBe(false);
    const depth = BigInt(finalityDepthFor("simnet")!);
    // A network observation whose subject is the synthetic txId, re-sealed for the test:
    // synthetic evidence never mixes with network evidence.
    const netObs: any = { ...finality(B1, 5000n + depth, depth), subject: { txId } };
    delete netObs.contentHash;
    netObs.contentHash = calculateContentHash(netObs, CURRENT_HASH_VERSION);
    const conflict = deriveTxStatus({ txId, submission: receipt, observations: [netObs] });
    expect(conflict.status).toBe("CONFLICTING_OBSERVATIONS");
    expect(conflict.status).not.toBe("FINALIZED");
  });

  it("two accepting blocks both observed on the chain are CONFLICTING_OBSERVATIONS; the derivation is order-independent", () => {
    const a = accepted(B1, 5000n, 10n);
    const b = accepted(B2, 5001n, 4n);
    const r1 = deriveTxStatus({ txId: TX, submission: submission(true), observations: [a, b] });
    const r2 = deriveTxStatus({ txId: TX, submission: submission(true), observations: [b, a] });
    expect(r1.status).toBe("CONFLICTING_OBSERVATIONS");
    expect(r2).toEqual(r1);
    const seq = [accepted(B1, 5000n, 10n), removed(B1, 5010n), accepted(B2, 5020n, 4n)];
    const forward = deriveTxStatus({ txId: TX, submission: submission(true), observations: seq });
    const backward = deriveTxStatus({ txId: TX, submission: submission(true), observations: [...seq].reverse() });
    expect(backward).toEqual(forward);
  });

  it("an observation is a FULL v5 artifact without lineage or workflow fields, stored under observations/ and listed by txId (rejects a tampered copy)", async () => {
    const o = accepted(B1, 5000n, 10n);
    const strict = verifyArtifactIntegritySync(structuredClone(o), { strict: true });
    expect(strict.ok, codes(strict).join(",")).toBe(true);
    expect(strict.authScope).toBe("FULL");
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w2a-store-"));
    try {
      const store = new ProjectArtifactStore(ws);
      const p = await store.writeArtifact(o);
      expect(p.replace(/\\/g, "/")).toMatch(/\/observations\//);
      const semantics = verifyArtifactSemantics(structuredClone(o), { strict: true, workspaceRoot: ws });
      expect(codes(semantics)).not.toContain("MISSING_LINEAGE");
      expect(codes(semantics)).not.toContain("MISSING_WORKFLOW_ID");
      const tampered: any = structuredClone(o);
      tampered.finding.confirmationsBlue = "11";
      fs.writeFileSync(path.join(path.dirname(p), "tampered.json"), JSON.stringify(tampered));
      const listed = store.listObservationsByTxId(TX);
      expect(listed.observations.map((x: any) => x.contentHash)).toEqual([o.contentHash]);
      expect(listed.rejected.length).toBe(1);
      expect(store.listObservationsByTxId(B2).observations).toEqual([]);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  it("observer locality · the observerId is opaque, stable and authenticated; a temporal history exists only within one observer", () => {
    expect(OBS_A).toMatch(OBSERVER_ID_PATTERN);
    expect(OBS_A).not.toBe(OBS_B);
    expect(deriveObserverId({ kind: "rpc", target: "simnet", locator: "ws://node-a.test:18210" })).toBe(OBS_A);
    expect(OBS_A).not.toContain("node-a");
    // Required and authenticated.
    expect(() => obs({ type: "mempool_absent" }, { sinkBlueScore: 1n }, { observerId: "obs_short" })).toThrow(/OBSERVATION_INCOHERENT/);
    const o: any = accepted(B1, 5000n, 10n);
    const swapped: any = structuredClone(o);
    swapped.observer.observerId = OBS_B;
    expect(calculateContentHash(swapped, CURRENT_HASH_VERSION)).not.toBe(o.contentHash);
    expect(deriveTxStatus({ txId: TX, submission: submission(true), observations: [swapped] }).evidence.ignored.length).toBe(1);

    const depth = BigInt(finalityDepthFor("simnet")!);
    // 1. Same observer: accepted(B) → removed(B) ⇒ REORGED.
    const same = deriveTxStatus({ txId: TX, submission: submission(true), observations: [accepted(B1, 5000n, 10n, undefined, OBS_A), removed(B1, 5010n, OBS_A)] });
    expect(same.status).toBe("REORGED");
    expect(same.perObserver.map((h) => [h.observerId, h.status])).toEqual([[OBS_A, "REORGED"]]);

    // 2. Different observers: A accepted(B), B removed(B) ⇒ NOT REORGED: the views disagree.
    const cross = deriveTxStatus({ txId: TX, submission: submission(true), observations: [accepted(B1, 5000n, 10n, undefined, OBS_A), removed(B1, 5010n, OBS_B)] });
    expect(cross.status).toBe("CONFLICTING_OBSERVATIONS");
    expect(cross.status).not.toBe("REORGED");
    expect(cross.reasons.join(" ")).toMatch(/observer_views_disagree/);
    expect(new Map(cross.perObserver.map((h) => [h.observerId, h.status]))).toEqual(new Map([[OBS_A, "ACCEPTED"], [OBS_B, "NOT_ON_CHAIN"]]));
    // The ordering by sinkBlueScore is never applied across observers: swapping the points changes nothing.
    const crossSwapped = deriveTxStatus({ txId: TX, submission: submission(true), observations: [accepted(B1, 5020n, 10n, undefined, OBS_A), removed(B1, 5010n, OBS_B)] });
    expect(crossSwapped.status).toBe("CONFLICTING_OBSERVATIONS");

    // 3. Same observer: finalized(B) → removed(B) ⇒ CONFLICTING (its own history is incoherent).
    const sameFinal = deriveTxStatus({ txId: TX, submission: submission(true), observations: [finality(B1, 5000n + depth, depth, "simnet", undefined, OBS_A), removed(B1, 5001n + depth, OBS_A)] });
    expect(sameFinal.status).toBe("CONFLICTING_OBSERVATIONS");
    expect(sameFinal.reasons.join(" ")).toMatch(/its own history is incoherent/);

    // 4. Different observers: A finalized(B), B removed(B) ⇒ a disagreement between observers, never an observed finality violation.
    const crossFinal = deriveTxStatus({ txId: TX, submission: submission(true), observations: [finality(B1, 5000n + depth, depth, "simnet", undefined, OBS_A), removed(B1, 5001n + depth, OBS_B)] });
    expect(crossFinal.status).toBe("CONFLICTING_OBSERVATIONS");
    expect(crossFinal.isFinal).toBe(false);
    expect(crossFinal.reasons.join(" ")).toMatch(/observer_views_disagree/);
    expect(crossFinal.reasons.join(" ")).toMatch(/not an observed violation of the finality rule/);
    expect(crossFinal.reasons.join(" ")).not.toMatch(/incoherent/);
    expect(new Map(crossFinal.perObserver.map((h) => [h.observerId, h.status]))).toEqual(new Map([[OBS_A, "FINALIZED"], [OBS_B, "NOT_ON_CHAIN"]]));

    // Agreement reinforces: two observers on the same block ⇒ confirmations = the minimum view; a lagging mempool view does not contradict.
    const agree = deriveTxStatus({
      txId: TX,
      submission: submission(true),
      observations: [accepted(B1, 5000n, 150n, undefined, OBS_A), accepted(B1, 5100n, 120n, undefined, OBS_B)]
    });
    expect(agree.status).toBe("CONFIRMED");
    expect(agree.confirmations?.blue).toBe("120");
    expect(agree.reasons.join(" ")).toMatch(/2 observers agree/);
    const lag = deriveTxStatus({ txId: TX, submission: submission(true), observations: [accepted(B1, 5000n, 3n, undefined, OBS_A), mempool(false, 4990n, OBS_B)] });
    expect(lag.status).toBe("ACCEPTED");
    // A negative claim alone establishes nothing: B says "not on my chain" and nobody accepted ⇒ back to the submission.
    const negativeOnly = deriveTxStatus({ txId: TX, submission: submission(true), observations: [removed(B1, 5010n, OBS_B)] });
    expect(negativeOnly.status).toBe("SUBMITTED");
    // Different accepting blocks across observers ⇒ disagreement, not a reorg.
    const twoBlocks = deriveTxStatus({ txId: TX, submission: submission(true), observations: [accepted(B1, 5000n, 10n, undefined, OBS_A), accepted(B2, 5000n, 4n, undefined, OBS_B)] });
    expect(twoBlocks.status).toBe("CONFLICTING_OBSERVATIONS");
    expect(twoBlocks.reasons.join(" ")).toMatch(/observer_views_disagree/);
  });

  it("coherence: confirmationsBlue must equal sinkBlueScore − acceptingBlueScore; a synthetic finding needs a synthetic observer", () => {
    const good: any = structuredClone(accepted(B1, 5000n, 10n));
    expect(checkTxObservationCoherence(good).ok).toBe(true);
    good.finding.confirmationsBlue = "11";
    expect(checkTxObservationCoherence(good)).toMatchObject({ ok: false, path: "finding.confirmationsBlue" });
    expect(() => obs({ type: "synthetic_executed", receiptArtifactId: "9".repeat(64) }, { sinkBlueScore: 1n })).toThrow(/synthetic observer/);
  });
});
