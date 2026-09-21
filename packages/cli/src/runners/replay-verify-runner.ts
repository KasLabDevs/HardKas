import { UI } from "../ui.js";
import path from "node:path";
import { HardkasCliError, ReplayVerificationError } from "../cli-errors.js";
import { Hardkas } from "@hardkas/sdk";
import { HardkasSchemas } from "@hardkas/artifacts";

export interface ReplayVerifyOptions {
  path: string;
  json?: boolean;
  workspaceRoot: string;
}

export async function runReplayVerify(options: ReplayVerifyOptions) {
  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
  const effectivePath = options.path || undefined;
  const targetDir = effectivePath
    ? sdk.workspace.resolvePath(effectivePath)
    : options.workspaceRoot;

  const verifyOptions: any = {};
  if (effectivePath) {
    // Wave 5 · DEF-17: replay verify operates on ONE receipt/artifact
    // (exact artifactId or artifact file path). Resolve the input through
    // the canonical façade before entering the SDK. Directory inputs are
    // rejected here with a typed error rather than being forwarded into
    // the SDK where they surface as an untyped "not found in store" and
    // get double-wrapped as UNKNOWN_ERROR (that separate envelope defect
    // is DEF-18 and remains open).
    const { resolveArtifactHandle } = await import("@hardkas/artifacts");
    try {
      const handle = await resolveArtifactHandle(
        effectivePath,
        options.workspaceRoot
      );
      // Pass the resolved absolute path to the SDK. The SDK's readArtifact
      // treats file paths as direct reads, so this bypasses any legacy
      // substring resolver for the initial lookup while leaving parent
      // lineage walking (which is an internal store operation) untouched.
      verifyOptions.path = handle.path;
    } catch (e: any) {
      // Wave 8 · DEF-18: failure serialization is owned by the top-level
      // renderer. The runner no longer emits a failure JSON envelope here;
      // it throws a typed HardkasCliError that survives the command wrapper
      // and is serialized exactly once by main() / handleError.
      const code = e?.code || "ARTIFACT_INPUT_UNRECOGNIZED";
      const message = e?.message || `Could not resolve '${effectivePath}'`;
      throw new HardkasCliError(code, message, { exitCode: 1 });
    }
  }
  const result = await sdk.replay.verify(verifyOptions);

  // Map result to requested literal status
  let finalStatus:
    | "passed"
    | "diverged"
    | "unsupported"
    | "missing_dependency"
    | "non_deterministic" = "diverged";

  if (result.passed) {
    finalStatus = "passed";
  } else if (result.code === "REPLAY_MODE_UNSUPPORTED") {
    // Wave 7 · REPLAY-MODE-1: machine-readable classification from the SDK
    // takes precedence over the historical string-based fallbacks. Real-node
    // receipts must never be classified as `diverged` / `non_deterministic`
    // — the SDK deliberately did not run execution.
    finalStatus = "unsupported";
  } else if (
    result.error?.includes("unsupported") ||
    result.error?.includes("not a workflow artifact")
  ) {
    finalStatus = "unsupported";
  } else if (
    result.lineage === "invalid" ||
    result.error?.includes("not found") ||
    result.error?.includes("missing")
  ) {
    finalStatus = "missing_dependency";
  } else if (result.determinism === "failed") {
    // If the cryptography/integrity failed
    finalStatus = "non_deterministic";
  } else {
    // Standard semantic divergence
    finalStatus = "diverged";
  }

  // Wave 8 · DEF-18: only SUCCESS emits from the runner. On failure the
  // runner throws a typed error and the top-level renderer serializes the
  // envelope exactly once. This eliminates the previous "runner writes a
  // failure envelope AND throws" dual-ownership that produced the
  // double-JSON-block anomaly observed on the Wave 7 real qualification.
  if (result.passed) {
    if (options.json) {
      const successEnvelope = {
        schemaVersion: HardkasSchemas.ReplayVerifyV1,
        workspace: options.path,
        artifacts: result.artifactsScanned,
        lineage: result.lineage,
        determinism: result.determinism,
        contamination: result.contamination,
        result: finalStatus,
        targetTxId: (result.report?.txId as string) || "unknown",
        deterministic: result.determinism === "verified"
      };
      const { getOutput } = await import("../output.js");
      getOutput().writeJson(successEnvelope);
    } else {
      UI.causality(`Replay Verification: ${path.basename(targetDir)}`, {
        "Execution Scope": "local deterministic replay",
        Workspace: options.path,
        "Artifacts Replayed": String(result.artifactsScanned),
        "Lineage Integrity": result.lineage,
        "Deterministic Execution": result.determinism,
        "Network Contamination": result.contamination,
        Status: finalStatus,
        Result: "PASS"
      });
    }
    return;
  }

  // Failure paths — always throw a typed HardkasCliError. The top-level
  // renderer owns final serialization and exit code.
  if (result.code === "REPLAY_MODE_UNSUPPORTED") {
    throw new HardkasCliError(
      "REPLAY_MODE_UNSUPPORTED",
      result.error ||
        "Replay execution for this receipt mode is not supported.",
      { exitCode: 1 }
    );
  }

  if (result.error) {
    // Wave 8: prefer any SDK-provided machine-readable code. When the SDK
    // gave only a message, classify by the CLI's already-computed
    // `finalStatus`; the previous behaviour of `throw new Error(...)` here
    // is what collapsed typed replay failures into UNKNOWN_ERROR at the
    // outer catch (this contributed to DEF-18 for the divergence branch).
    const code =
      result.code ||
      (finalStatus === "missing_dependency"
        ? "REPLAY_MISSING_DEPENDENCY"
        : finalStatus === "non_deterministic"
          ? "REPLAY_NON_DETERMINISTIC"
          : finalStatus === "unsupported"
            ? "REPLAY_UNSUPPORTED"
            : "REPLAY_FAILED");
    throw new HardkasCliError(code, result.error, { exitCode: 1 });
  }

  // Structured divergence — keep the ReplayVerificationError typed shape
  // so handleError's REPLAY_DIVERGED branch can still render divergence
  // detail on stderr for human consumers.
  throw new ReplayVerificationError(
      result.report || {
        schema: HardkasSchemas.ReplayReportV1,
        txId: "unknown",
        planOk: false,
        receiptOk: false,
        invariantsOk: false,
        checks: {
          workflowDeterministic: "diverged",
          consensusValidation: "unimplemented",
          l2BridgeCorrectness: "unimplemented"
        },
        divergences: [],
        errors: ["Artifact replay verification failed due to diagnostic failures."]
      }
    );
}
