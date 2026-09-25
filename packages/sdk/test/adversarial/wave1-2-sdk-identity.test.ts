import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../../src/index.js";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  createSimulatedTxReceipt,
  ProjectArtifactStore
} from "@hardkas/artifacts";
import { systemRuntimeContext } from "@hardkas/core";

// Wave 1.2 · SDK surface of IC-5′ (Q3-II):
//   read(string) accepts only a contained path or a 64-hex artifactId; labels → NAMESPACE_REQUIRED;
//   read({ plan | signed | tx | workflow }) are the typed namespaces (tx never returns a signed);
//   the cache is a memo of the cold resolver, keyed only by artifactId (S1, S2: warm ≡ cold ≡ restart);
//   persisted references (policy/profile/assumption) are artifactIds, never labels, never a raw fallback;
//   N5: idempotency is keyed by the executed artifact's identity, never by txId or an unauthenticated status;
//   N6: workflow runs resolve through the `workflow` namespace, warm and cold.

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e: any) {
    return e?.code ?? `ERR:${e?.message}`;
  }
};

function sealedPolicy(decision: "ALLOW" | "DENY") {
  const p: any = {
    schema: "hardkas.policy.v1",
    hardkasVersion: "0.12.0-rc.23",
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simnet",
    mode: "simulator",
    createdAt: "2026-09-25T00:00:00.000Z",
    decision,
    rules: []
  };
  p.contentHash = calculateContentHash(p, CURRENT_HASH_VERSION);
  return p;
}

describe("Wave 1.2 · SDK identity resolution", () => {
  let ws: string;
  let sdk: Hardkas;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w12-sdk-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("T-S1 · verify(contentHash) and read(contentHash): warm ≡ cold ≡ cleared cache", async () => {
    const policy = sealedPolicy("ALLOW");
    const { contentHash } = await sdk.artifacts.write(policy);

    const warmRead = await sdk.artifacts.read(contentHash);
    const warmVerify = await sdk.artifacts.verify(contentHash, { throwOnInvalid: false });

    const cold = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    const coldRead = await cold.artifacts.read(contentHash);
    const coldVerify = await cold.artifacts.verify(contentHash, { throwOnInvalid: false });

    (sdk.artifacts as any).cache.clear();
    const clearedRead = await sdk.artifacts.read(contentHash);
    const clearedVerify = await sdk.artifacts.verify(contentHash, { throwOnInvalid: false });

    for (const r of [warmRead, coldRead, clearedRead]) expect(r.contentHash).toBe(contentHash);
    for (const v of [warmVerify, coldVerify, clearedVerify]) {
      expect(v.valid ?? v.ok).toBe(true);
      expect(v.authScope).toBe("FULL");
    }
  });

  it("T-S2 · labels and txIds need their namespace; tx never returns the signed; warm ≡ cold", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const signed = await sdk.tx.sign(plan, "alice");
    const sent = await sdk.tx.send(signed, { persist: true });
    const receipt = sent.receipt as any;

    const cold = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    for (const instance of [sdk, cold]) {
      expect(await codeOf(instance.artifacts.read(plan.planId))).toBe("NAMESPACE_REQUIRED");
      expect(await codeOf(instance.artifacts.read(signed.signedId))).toBe("NAMESPACE_REQUIRED");
      expect(await codeOf(instance.artifacts.read(receipt.txId))).toBe("NAMESPACE_REQUIRED");

      expect((await instance.artifacts.read({ plan: plan.planId })).contentHash).toBe(plan.contentHash);
      expect((await instance.artifacts.read({ signed: signed.signedId })).contentHash).toBe(signed.contentHash);
      const byTx = await instance.artifacts.read({ tx: receipt.txId });
      expect(byTx.schema).toBe("hardkas.txReceipt");
      expect(byTx.contentHash).toBe(receipt.contentHash);
      expect((await instance.artifacts.read({ artifact: signed.contentHash })).schema).toBe("hardkas.signedTx");
      expect((await instance.artifacts.read(receipt.contentHash)).contentHash).toBe(receipt.contentHash);
    }

    // The cache is keyed only by artifactId.
    expect(sdk.artifacts.getCached(plan.planId)).toBeUndefined();
    expect(sdk.artifacts.getCached(receipt.txId)).toBeUndefined();
    expect(sdk.artifacts.getCached(plan.contentHash)?.contentHash).toBe(plan.contentHash);
    // send() reports the receipt's canonical identity, and the txId as a txId.
    expect(sent.artifactId).toBe(receipt.contentHash);
    expect(sent.txId).toBe(receipt.txId);
  });

  it("persisted policy references are artifactIds: a label fails closed, an unknown id is REFERENCE_MISSING, no raw fallback", async () => {
    expect(await codeOf(sdk.tx.plan({ from: "alice", to: "bob", amount: "10", policy: "policy-allow" }))).toBe("NAMESPACE_REQUIRED");
    expect(await codeOf(sdk.tx.plan({ from: "alice", to: "bob", amount: "10", policy: "b".repeat(64) }))).toBe("REFERENCE_MISSING");
    const allow = sealedPolicy("ALLOW");
    await sdk.artifacts.write(allow);
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10", policy: allow.contentHash });
    expect((plan as any).policyRefs).toEqual([allow.contentHash]);
  });

  it("T-N5 · a planted receipt with the expected txId and status accepted neither skips execution nor is returned", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const signed = await sdk.tx.sign(plan, "alice");
    const expectedTxId = `simulated-${plan.planId}-tx`;

    // Self-consistent v5 receipt, status accepted, txId as the simulator would label it,
    // but its parent is NOT this signed artifact.
    const planted: any = createSimulatedTxReceipt(plan as any, expectedTxId, systemRuntimeContext, {
      parentArtifact: { contentHash: "f".repeat(64), lineage: { artifactId: "f".repeat(64), lineageId: "f".repeat(64), rootArtifactId: "f".repeat(64), sequence: 2 } },
      sourceSignedId: signed.signedId
    });
    const store = new ProjectArtifactStore(ws);
    await store.writeArtifact(planted);
    (sdk.artifacts as any).cache.clear();

    const first = await sdk.tx.send(signed, { persist: true });
    const firstReceipt = first.receipt as any;
    expect(firstReceipt.contentHash).not.toBe(planted.contentHash);
    expect(firstReceipt.lineage.parentArtifactId).toBe(signed.contentHash);
    expect(first.artifactId).toBe(firstReceipt.contentHash);

    // Second send of the same signed: idempotent on the signed's identity → the real receipt.
    const second = await sdk.tx.send(signed, { persist: true });
    expect((second.receipt as any).contentHash).toBe(firstReceipt.contentHash);
    expect(second.artifactId).toBe(firstReceipt.contentHash);
    expect((second.receipt as any).contentHash).not.toBe(planted.contentHash);
  });

  it("T-N6 · workflow runs resolve through the workflow namespace, warm and cold; the bare id needs the namespace", async () => {
    const run = await sdk.workflow.run({ steps: [{ type: "tx.plan", from: "alice", to: "bob", amount: 5 }] } as any);
    const wfId = run.workflowId;
    expect(await codeOf(sdk.artifacts.read(wfId))).toBe("NAMESPACE_REQUIRED");
    const warm = await sdk.artifacts.read({ workflow: wfId });
    expect(warm.schema).toBe("hardkas.workflow.v1");
    expect(warm.workflowId).toBe(wfId);
    const cold = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    const coldRun = await cold.artifacts.read({ workflow: wfId });
    expect(coldRun.contentHash).toBe(warm.contentHash);
  });

  it("simulate/send resolve the parent plan by lineage.parentArtifactId (store) or an explicit plan whose identity matches", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    const signed = await sdk.tx.sign(plan, "alice");
    (sdk.artifacts as any).cache.clear();
    // Not persisted, not passed: unresolved.
    expect(await codeOf(sdk.tx.simulate(signed))).toMatch(/parent_plan_unresolved/);
    // Passed explicitly with a different identity: refused.
    const other = await sdk.tx.plan({ from: "alice", to: "bob", amount: "11" });
    expect(await codeOf(sdk.tx.simulate(signed, { plan: other } as any))).toBe("PARENT_PLAN_MISMATCH");
    // Passed explicitly with the matching identity: accepted.
    const r = await sdk.tx.simulate(signed, { plan } as any);
    expect((r.receipt as any).lineage.parentArtifactId).toBe(signed.contentHash);
  });
});
