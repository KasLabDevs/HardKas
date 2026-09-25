import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { asNetworkId, systemRuntimeContext } from "@hardkas/core";
import { ProjectArtifactStore, createSimulatedTxReceipt, createTxPlanArtifact, resolveArtifact, resolveArtifactHandle } from "@hardkas/artifacts";
import { loadSimulatedReceipt } from "../src/receipts.js";
import { saveLocalnetState } from "../src/store.js";

// Wave 1.2 · localnet lookups follow IC-5′: `loadSimulatedReceipt(txId)` is the tx namespace
// (verified candidates, ambiguity → error, never first-match); AUD-45: a snapshot without
// lineage resolves by its recomputed contentHash (identity by category, IC-7.5).

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };

function makePlan(amount = 500n) {
  const plan: any = {
    inputs: [{ outpoint: { transactionId: "ab".repeat(32), index: 0 }, amountSompi: 1000n, address: "kaspasim:qqalice", scriptPublicKey: "spk" }],
    outputs: [{ address: "kaspasim:qqbob", amountSompi: amount }],
    change: { address: "kaspasim:qqalice", amountSompi: 1000n - amount - 10n },
    estimatedFeeSompi: 10n,
    estimatedMass: 100n
  };
  return createTxPlanArtifact({
    ctx,
    networkId: asNetworkId("simnet") as any,
    mode: "simulator",
    from: { input: "alice", address: "kaspasim:qqalice", accountName: "alice" },
    to: { input: "bob", address: "kaspasim:qqbob" },
    amountSompi: amount,
    plan
  });
}

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e: any) {
    return e?.code ?? `ERR:${e?.message}`;
  }
};

describe("Wave 1.2 · localnet identity lookups", () => {
  let ws: string;
  let store: ProjectArtifactStore;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w12-localnet-"));
    store = new ProjectArtifactStore(ws);
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("loadSimulatedReceipt: exactly one verified receipt for the txId, ambiguity and invalid copies fail closed", async () => {
    const plan = makePlan();
    const txId = "simtx_" + "2".repeat(32);
    const receipt = createSimulatedTxReceipt(plan, txId, ctx, { daaScore: "1" });
    await store.writeArtifact(receipt);
    expect(((await loadSimulatedReceipt(txId, { cwd: ws })) as any).contentHash).toBe(receipt.contentHash);
    expect(await codeOf(loadSimulatedReceipt("simtx_" + "3".repeat(32), { cwd: ws }))).toBe("RECEIPT_NOT_FOUND");

    const other = createSimulatedTxReceipt(plan, txId, ctx, { daaScore: "2" });
    await store.writeArtifact(other);
    expect(await codeOf(loadSimulatedReceipt(txId, { cwd: ws }))).toBe("RECEIPT_AMBIGUOUS_CONFLICT");
  });

  it("T-A45 · a snapshot without lineage resolves by its recomputed contentHash, through the resolver and the CLI façade", async () => {
    const state: any = {
      schema: "hardkas.localnetState.v1",
      hardkasVersion: "0.12.0-rc.23",
      version: "1.0.0-alpha",
      networkId: asNetworkId("simnet"),
      mode: "simulator",
      daaScore: "42",
      createdAt: "2026-09-25T00:00:00.000Z",
      accounts: [{ address: "kaspasim:qqbob", name: "bob" }],
      utxos: [{ id: `${"cd".repeat(32)}:1`, address: "kaspasim:qqbob", amountSompi: "5", spent: false, createdAtDaaScore: "1" }]
    };
    await saveLocalnetState(state, path.join(ws, ".hardkas", "localnet", "state.json"));
    const snapshots = await store.queryArtifacts({ schema: "hardkas.snapshot.v1" });
    expect(snapshots).toHaveLength(1);
    const snapshot: any = snapshots[0];
    expect(snapshot.artifactId).toBeUndefined();

    const r = await resolveArtifact(ws, { artifact: snapshot.contentHash });
    expect(r.artifact.schema).toBe("hardkas.snapshot.v1");
    expect(r.authScope).toBe("FULL");
    const h = await resolveArtifactHandle(snapshot.contentHash, ws);
    expect(h.artifactId).toBe(snapshot.contentHash);
    expect(h.resolvedBy).toBe("artifactId");
  });
});
