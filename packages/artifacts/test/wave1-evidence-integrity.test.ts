import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  createTxPlanArtifact,
  TxPlanSchema
} from "../src/index.js";
import type { RuntimeContext } from "@hardkas/core";

// Sentinel domain — see wave0 tests. Wave 1 uses distinct sentinel values.
const SENTINEL_WORKFLOW = "wf_wave1_sentinel";
const SENTINEL_ASSUMPTION = "local-wave1-sentinel";

function mkCtx(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    clock: { now: () => 1_700_000_000_000 },
    random: { next: () => 0.42 },
    ids: { execution: () => "exec_sentinel", workflow: () => "wf_sentinel" },
    telemetry: {} as any,
    workflowId: SENTINEL_WORKFLOW,
    assumptionLevel: SENTINEL_ASSUMPTION,
    ...overrides
  };
}

function mkBuilderPlan(): any {
  return {
    inputs: [],
    outputs: [{ address: "kaspasim:alice-out", amountSompi: 100_000n }],
    estimatedFeeSompi: 10n,
    estimatedMass: 100n,
    feeSompi: 10n,
    mass: 100n,
    changeSompi: 0n
  };
}

describe("DEF-7 · plannerAuthority projection into TxPlan artifact", () => {
  it("KASPA_WASM_GENERATOR from planner ctx is projected verbatim into the artifact", () => {
    const ctx = mkCtx({
      plannerAuthority: "KASPA_WASM_GENERATOR",
      plannerAuthorityDetail: "kaspa-wasm@2.0.1-sentinel"
    });
    const artifact = createTxPlanArtifact({
      networkId: "simnet" as any,
      mode: "localnet",
      from: { input: "alice", address: "kaspasim:from", accountName: "alice" },
      to: { input: "bob", address: "kaspasim:to" },
      amountSompi: 100_000n,
      plan: mkBuilderPlan(),
      ctx
    });
    expect((artifact as any).plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    expect((artifact as any).plannerAuthorityDetail).toBe("kaspa-wasm@2.0.1-sentinel");
  });

  it("SYNTHETIC_SIMULATOR from planner ctx is projected verbatim (labels do not upgrade)", () => {
    const ctx = mkCtx({
      plannerAuthority: "SYNTHETIC_SIMULATOR",
      plannerAuthorityDetail: "hardkas.simulator/legacy@internal"
    });
    const artifact = createTxPlanArtifact({
      networkId: "simnet" as any,
      mode: "simulator",
      from: { input: "sim-alice", address: "kaspa:sim_alice", accountName: "alice" },
      to: { input: "sim-bob", address: "kaspa:sim_bob" },
      amountSompi: 1n,
      plan: mkBuilderPlan(),
      ctx
    });
    expect((artifact as any).plannerAuthority).toBe("SYNTHETIC_SIMULATOR");
    expect((artifact as any).plannerAuthorityDetail).toBe(
      "hardkas.simulator/legacy@internal"
    );
  });

  it("absence stays absence — an artifact from ctx without plannerAuthority does NOT synthesize one", () => {
    const ctx = mkCtx({}); // no plannerAuthority in ctx
    const artifact = createTxPlanArtifact({
      networkId: "simnet" as any,
      mode: "localnet",
      from: { input: "a", address: "kaspasim:a" },
      to: { input: "b", address: "kaspasim:b" },
      amountSompi: 100_000n,
      plan: mkBuilderPlan(),
      ctx
    });
    expect("plannerAuthority" in (artifact as any)).toBe(false);
    expect("plannerAuthorityDetail" in (artifact as any)).toBe(false);
  });

  it("plannerAuthority roundtrips through JSON disk + read + schema parse", () => {
    const ctx = mkCtx({
      plannerAuthority: "KASPA_WASM_GENERATOR",
      plannerAuthorityDetail: "kaspa-wasm@2.0.1-sentinel"
    });
    const artifact = createTxPlanArtifact({
      networkId: "simnet" as any,
      mode: "localnet",
      from: { input: "a", address: "kaspasim:a" },
      to: { input: "b", address: "kaspasim:b" },
      amountSompi: 100_000n,
      plan: mkBuilderPlan(),
      ctx
    });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-wave1-"));
    const p = path.join(dir, "plan.json");
    fs.writeFileSync(p, JSON.stringify(artifact, null, 2), "utf-8");

    // Fresh read
    const loaded = JSON.parse(fs.readFileSync(p, "utf-8"));
    expect(loaded.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    expect(loaded.plannerAuthorityDetail).toBe("kaspa-wasm@2.0.1-sentinel");

    // Schema parse preserves the fields
    const parsed = TxPlanSchema.parse(loaded);
    expect(parsed.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    expect(parsed.plannerAuthorityDetail).toBe("kaspa-wasm@2.0.1-sentinel");
  });

  it("TxPlanSchema rejects unknown plannerAuthority values (closed enum)", () => {
    const bad = {
      plannerAuthority: "FABRICATED_UPSTREAM_LOOK_ALIKE"
    };
    // Full schema parse would fail on many missing required fields — we validate the
    // enum specifically by asserting the plannerAuthority discriminator rejects an
    // unknown value.
    const enumField = (TxPlanSchema.shape as any).plannerAuthority;
    const res = enumField.safeParse(bad.plannerAuthority);
    expect(res.success).toBe(false);
  });
});

describe("DEF-1 · historical rc.22-era plans without plannerAuthority remain valid (additive)", () => {
  it("a plan artifact WITHOUT plannerAuthority still passes TxPlanSchema validation", () => {
    const artifact = createTxPlanArtifact({
      networkId: "simnet" as any,
      mode: "localnet",
      from: { input: "a", address: "kaspasim:a" },
      to: { input: "b", address: "kaspasim:b" },
      amountSompi: 100_000n,
      plan: mkBuilderPlan(),
      ctx: mkCtx({}) // no plannerAuthority
    });
    // Force schema validation to prove backward compat.
    const parsed = TxPlanSchema.parse(artifact);
    expect(parsed.plannerAuthority).toBeUndefined();
    expect(parsed.plannerAuthorityDetail).toBeUndefined();
  });
});
