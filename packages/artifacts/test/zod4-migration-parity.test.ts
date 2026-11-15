import { describe, it, expect } from "vitest";
import type { RuntimeContext } from "@hardkas/core";
import { createTxPlanArtifact } from "../src/index.js";
import { validateArtifactSchema, verifyArtifactIntegritySync } from "../src/verify.js";
import {
  BaseArtifactSchema,
  SilverSpendV1Schema,
  TxObservationSchema,
  TxSubmissionSchema,
  ZkExecutionEvidenceSchema
} from "../src/schemas.js";

// zod 3 → 4 (GHSA-mrhx-c7xc-m3w5). What a schema accepts or refuses stays what it was under zod 3, except two cases
// zod 4 refuses on purpose and HardKAS keeps refusing: a number that is not finite (JSON `1e999` parses to Infinity)
// and an integer field holding an integer above 2^53 − 1 (JSON cannot carry it exactly). No HardKAS writer produces
// either. Each case is refused as ARTIFACT_SCHEMA_INVALID by the verifier.

const ctx: RuntimeContext = {
  clock: { now: () => 1_700_000_000_000 },
  random: { next: () => 0.42 },
  ids: { execution: () => "exec_parity", workflow: () => "wf_parity" },
  telemetry: {} as any,
  workflowId: "wf_parity",
  assumptionLevel: "local-parity"
};

function plan(): any {
  const artifact: any = createTxPlanArtifact({
    networkId: "simnet" as any,
    mode: "localnet",
    from: { input: "a", address: "kaspasim:a" },
    to: { input: "b", address: "kaspasim:b" },
    amountSompi: 100_000n,
    plan: {
      inputs: [{ outpoint: { transactionId: "ab".repeat(32), index: 0 }, address: "kaspasim:a", amountSompi: 200_000n }],
      outputs: [{ address: "kaspasim:b", amountSompi: 100_000n }],
      estimatedFeeSompi: 10n,
      estimatedMass: 100n,
      feeSompi: 10n,
      mass: 100n,
      changeSompi: 0n
    } as any,
    ctx
  });
  return JSON.parse(JSON.stringify(artifact));
}

const schemaIssues = (artifact: unknown) =>
  verifyArtifactIntegritySync(artifact, { strict: true }).issues.filter((i) => i.code === "ARTIFACT_SCHEMA_INVALID");

describe("zod 4 · accept/refuse parity with zod 3", () => {
  it("a plan written by HardKAS is schema-valid", () => {
    expect(validateArtifactSchema(plan())).toMatchObject({ status: "VALID" });
  });

  it("a missing field is still reported as 'Required' (the text artifact verify, tx sign and tx send print)", () => {
    const p = plan();
    delete p.planId;
    const issues = schemaIssues(p);
    expect(issues.map((i) => i.message)).toContain("planId: Required");
    expect(validateArtifactSchema(p).errors).toContain("planId: Required");
  });

  it("refused as before zod 4: a non-finite number (JSON 1e999) is ARTIFACT_SCHEMA_INVALID", () => {
    const text = JSON.stringify(plan()).replace('"index":0', '"index":1e999');
    const p = JSON.parse(text);
    expect(p.inputs[0].outpoint.index).toBe(Infinity);
    expect(validateArtifactSchema(p).status).toBe("INVALID");
    expect(schemaIssues(p).map((i) => i.path)).toContain("inputs.0.outpoint.index");
    expect(verifyArtifactIntegritySync(p, { strict: true }).ok).toBe(false);
    expect(BaseArtifactSchema.shape.hashVersion.safeParse(-Infinity).success).toBe(false);
  });

  it("refused under zod 4: an integer field above 2^53 − 1 is refused (2^53 − 1 is still accepted)", () => {
    const sigOps = SilverSpendV1Schema.shape.sigOpCount;
    expect(sigOps.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(true);
    expect(sigOps.safeParse(2 ** 53).success).toBe(false);
    expect(sigOps.safeParse(2 ** 60).success).toBe(false);
    const outputIndex = ZkExecutionEvidenceSchema.shape.funding.shape.outputIndex;
    expect(outputIndex.safeParse(2 ** 53).success).toBe(false);
    const p = plan();
    p.inputs[0].outpoint.index = 2 ** 60; // a plain number field (not .int()) keeps accepting it, as under zod 3
    expect(validateArtifactSchema(p).status).toBe("VALID");
  });

  it("an ISO date-time without seconds is accepted, as zod 3 accepted it; an offset or an impossible date is not", () => {
    const createdAt = BaseArtifactSchema.shape.createdAt;
    for (const ok of ["2026-01-01T10:30Z", "2026-01-01T10:30:00Z", "2024-02-29T23:59:59.123456789Z"]) expect(createdAt.safeParse(ok).success, ok).toBe(true);
    for (const bad of ["2026-01-01T10:30:00+01:00", "2023-02-29T00:00:00Z", "2026-01-01T24:00:00Z", "2026-01-01 10:30:00Z", "2026-01-01T10:30:00"]) expect(createdAt.safeParse(bad).success, bad).toBe(false);
    const p = plan();
    p.createdAt = "2026-01-01T10:30Z";
    expect(validateArtifactSchema(p).status).toBe("VALID");
  });

  it("an observation's evidence entry without params is accepted, as zod 3 accepted it", () => {
    const evidence = TxObservationSchema.shape.evidence.element;
    expect(evidence.safeParse({ method: "getMempoolEntry", responseDigest: "ab".repeat(32) }).success).toBe(true);
    expect(evidence.safeParse({ method: "getMempoolEntry", params: { a: 1 }, responseDigest: "ab".repeat(32) }).success).toBe(true);
  });

  it("a discriminated union still refuses an unknown discriminator and an unknown key in a strict object", () => {
    const fee = TxSubmissionSchema.shape.fee;
    expect(fee.safeParse({ status: "guessed", reason: "x" }).success).toBe(false);
    expect(fee.safeParse({ status: "insufficient-evidence", reason: "x" }).success).toBe(true);
    const preflight = TxSubmissionSchema.shape.preflight;
    expect(preflight.safeParse({ inputs: 1, scope: "observer-local", guarantee: "g" }).success).toBe(true);
    expect(preflight.safeParse({ inputs: 1, scope: "observer-local", guarantee: "g", extra: 1 }).success).toBe(false);
  });
});
