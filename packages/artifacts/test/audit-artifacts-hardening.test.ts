import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { ProjectArtifactStore } from "../src/store.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../src/canonical.js";
import { createTxPlanArtifact } from "../src/tx-plan.js";
import { createSimulatedSignedTxArtifact } from "../src/signed-tx.js";
import { verifyArtifactSemantics } from "../src/verify.js";

const ctx = {
  ...systemRuntimeContext,
  clock: { ...systemRuntimeContext.clock, now: () => 1_700_000_000_000 }
};

describe("Priority 5 · Artifacts hardening (bigint round-trip, SELF_PARENT, parent integrity)", () => {
  let ws: string;

  beforeEach(async () => {
    ws = await fs.mkdtemp(path.join(os.tmpdir(), "hk-artifacts-audit-"));
  });

  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
  });

  it("refuses to publish an artifact with raw bigint whose persisted JSON hash diverges from contentHash", async () => {
    const store = new ProjectArtifactStore(ws);
    const body: any = {
      schema: "hardkas.txPlan",
      hardkasVersion: "0.13.0-rc.3",
      version: "1.0.0-alpha",
      hashVersion: CURRENT_HASH_VERSION,
      networkId: "simnet",
      mode: "simulator",
      amountSompi: 1000n,
      from: { address: "kaspa:sim_alice" },
      to: { address: "kaspa:sim_bob" },
      inputs: [],
      outputs: [],
      estimatedMass: "100",
      estimatedFeeSompi: "10"
    };
    body.contentHash = calculateContentHash(body, CURRENT_HASH_VERSION);

    await expect(store.publishArtifact(body)).rejects.toMatchObject({
      code: expect.stringMatching(/ARTIFACT_.*HASH_MISMATCH/)
    });
  });

  it("emits SELF_PARENT in verifyArtifactSemantics even when parent is not separately supplied", () => {
    const plan = createTxPlanArtifact({
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
      }
    }) as any;
    const selfId = plan.contentHash;
    const selfParented = {
      ...plan,
      lineage: {
        artifactId: selfId,
        lineageId: selfId,
        rootArtifactId: selfId,
        parentArtifactId: selfId,
        sequence: 2
      }
    };

    const nonStrict = verifyArtifactSemantics(selfParented, { strict: false });
    expect(nonStrict.ok).toBe(false);
    expect(nonStrict.issues.some((i) => i.code === "SELF_PARENT")).toBe(true);

    const strict = verifyArtifactSemantics(selfParented, { strict: true });
    expect(strict.ok).toBe(false);
    expect(strict.issues.some((i) => i.code === "SELF_PARENT")).toBe(true);
  });

  it("verifies parent integrity (contentHash) recursively during strict verifyArtifactSemantics", () => {
    const plan = createTxPlanArtifact({
      ctx,
      networkId: asNetworkId("simnet") as any,
      mode: "simulator",
      from: { input: "alice", address: "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw", accountName: "alice" },
      to: { input: "bob", address: "kaspasim:qzgh3e6qqe6jfevf0dc652uszm0lnhvhzmasga5lka4kcl5udget5065p52eh" },
      amountSompi: 500_000_000_000n,
      plan: {
        inputs: [
          {
            outpoint: { transactionId: "ab".repeat(32), index: 0 },
            amountSompi: 1_000_000_000_000n,
            address: "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw",
            scriptPublicKey: "000020dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659ac"
          }
        ],
        outputs: [{ address: "kaspasim:qzgh3e6qqe6jfevf0dc652uszm0lnhvhzmasga5lka4kcl5udget5065p52eh", amountSompi: 500_000_000_000n }],
        change: { address: "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw", amountSompi: 499_999_796_400n },
        estimatedFeeSompi: 203_600n,
        estimatedMass: 2036n
      }
    });
    const signed = createSimulatedSignedTxArtifact(plan, plan.from.address, ctx);

    // Control: untampered parent passes
    const valid = verifyArtifactSemantics(structuredClone(signed), {
      strict: true,
      enforceMetadata: false,
      clock: ctx.clock,
      resolveArtifact: (id) => (id === plan.contentHash ? structuredClone(plan) : null)
    });
    expect(valid.ok, JSON.stringify(valid.issues)).toBe(true);

    // Corrupt a semantic/economic-neutral authenticated field in parent without updating its contentHash
    const tamperedParent: any = structuredClone(plan);
    tamperedParent.status = "compromised";

    const invalid = verifyArtifactSemantics(structuredClone(signed), {
      strict: true,
      enforceMetadata: false,
      clock: ctx.clock,
      resolveArtifact: (id) => (id === plan.contentHash ? tamperedParent : null)
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.issues.some((i) => i.code === "REFERENCE_HASH_MISMATCH")).toBe(true);
  });
});
