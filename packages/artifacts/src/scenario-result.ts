import { HardkasSchemas } from "@hardkas/core";
import { ARTIFACT_VERSION } from "./schemas.js";
import type { ScenarioResult } from "./schemas.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "./canonical.js";
import { HARDKAS_VERSION } from "./constants.js";

// First contact · E03/E07 — the ONE producer of `hardkas.scenarioResult.v1`.
// Scenario runs (`@hardkas/testing/scenarios`) and custom tasks (`hardkas task`)
// used to write ad-hoc JSON with no hashVersion and no contentHash (and, for
// scenarios, `mode: "agent"`, which is not an execution mode). Since Wave 1.1 (N3)
// the writer refuses such bodies and the verifier/indexer flag them as corrupt.
// This producer seals a v5 artifact the way every other producer does: declare
// the hash version, then hash the finished body once.

export type ScenarioResultMode = "simulator" | "localnet" | "rpc" | "l2-rpc";

/**
 * TASK-EVIDENCE-UNBOUND-1 (D-TEU-1/D-TEU-2): what a package of this run may be presented as, sealed with the verdict.
 * `none` — the run wrote nothing (an explicitly empty package); `artifacts` — it wrote artifacts and claims no payment;
 * `payment` — it broadcast these payments, each named by its submission (the verifier then requires each payment's
 * lineage — plan ← signed ← submission — to close inside the package). A claim is never a proof of chain inclusion.
 */
export type ScenarioEvidenceClaim =
  | { kind: "none" }
  | { kind: "artifacts" }
  | { kind: "payment"; payments: Array<{ txId: string; submissionArtifactId: string }> };

export interface ScenarioResultInput {
  scenarioName: string;
  status: "passed" | "failed";
  networkId: string;
  mode: ScenarioResultMode;
  artifactsGenerated?: string[];
  /** Defaults to `none` for a run that names no artifact and `artifacts` otherwise (never `payment` by default). */
  evidenceClaim?: ScenarioEvidenceClaim;
  error?: { code: string; message: string; component?: string; recoverable?: boolean };
  /** Free, authenticated context (e.g. `{ kind: "task", taskName, args, result }`). */
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

/** Maps a HardKAS network name to the execution mode that produced the run. */
export function scenarioModeForNetwork(networkId: string | undefined): ScenarioResultMode {
  if (!networkId || networkId === "simulated") return "simulator";
  if (networkId === "simnet" || networkId === "simnet-1" || networkId === "devnet") return "localnet";
  return "rpc";
}

export function createScenarioResultArtifact(input: ScenarioResultInput): ScenarioResult {
  const named = [...(input.artifactsGenerated ?? [])];
  const evidenceClaim: ScenarioEvidenceClaim = input.evidenceClaim ?? (named.length === 0 ? { kind: "none" } : { kind: "artifacts" });
  const body: Record<string, unknown> = {
    schema: HardkasSchemas.ScenarioResultV1,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    networkId: input.networkId,
    mode: input.mode,
    scenarioName: input.scenarioName,
    status: input.status,
    artifactsGenerated: named,
    evidenceClaim,
    ...(input.error ? { error: input.error } : {}),
    claims: { mainnet: false, testnet: false, production: false },
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
  body.contentHash = calculateContentHash(body, CURRENT_HASH_VERSION);
  return body as unknown as ScenarioResult;
}
