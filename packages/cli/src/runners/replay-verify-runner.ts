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
      const code = e?.code || "ARTIFACT_INPUT_UNRECOGNIZED";
      const message = e?.message || `Could not resolve '${effectivePath}'`;

      if (options.json) {
        const { getOutput } = await import("../output.js");
        getOutput().writeJson({
          schemaVersion: HardkasSchemas.ReplayVerifyV1,
          workspace: options.path,
          artifacts: 0,
          lineage: "invalid",
          determinism: "verified",
          contamination: "clean",
          result: "input_rejected",
          targetTxId: "unknown",
          deterministic: true,
          error: { code, message }
        });
      }

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

  if (options.json) {
    // Wave 7 · propagate the SDK's machine-readable code when present so
    // programmatic consumers can react without regex-scraping the message.
    const envelope: any = {
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
    if (result.code) envelope.code = result.code;
    if (result.error && result.code) envelope.message = result.error;
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    UI.causality(`Replay Verification: ${path.basename(targetDir)}`, {
      "Execution Scope": "local deterministic replay",
      Workspace: options.path,
      "Artifacts Replayed": String(result.artifactsScanned),
      "Lineage Integrity": result.lineage,
      "Deterministic Execution": result.determinism,
      "Network Contamination": result.contamination,
      Status: finalStatus,
      Result: result.passed ? "PASS" : "FAIL"
    });
  }

  if (!result.passed) {
    // Wave 7 · REPLAY-MODE-1: preserve the typed unsupported-mode code
    // through the CLI envelope. The general `result.error → new Error(...)`
    // path below still wraps into UNKNOWN_ERROR (that is DEF-18, which
    // remains OPEN); this narrow branch ensures the unsupported-mode
    // classification specifically is not mangled.
    if (result.code === "REPLAY_MODE_UNSUPPORTED") {
      throw new HardkasCliError(
        "REPLAY_MODE_UNSUPPORTED",
        result.error ||
          "Replay execution for this receipt mode is not supported.",
        { exitCode: 1 }
      );
    }
    if (result.error) {
      throw new Error(`Failed to perform replay verification: ${result.error}`);
    }
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
}
