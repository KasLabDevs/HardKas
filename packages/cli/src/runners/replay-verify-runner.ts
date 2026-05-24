import { UI } from "../ui.js";
import path from "node:path";
import { ReplayVerificationError } from "../cli-errors.js";
import { Hardkas } from "@hardkas/sdk";

export interface ReplayVerifyOptions {
  path: string;
  json?: boolean;
  workspaceRoot: string;
}

export async function runReplayVerify(options: ReplayVerifyOptions) {
  const { Hardkas } = await import("@hardkas/sdk");
  const rootSdk = await Hardkas.open({ cwd: options.workspaceRoot });
  const targetDir = rootSdk.workspace.resolvePath(options.path);
  
  // Initialize SDK pointed at the target replay workspace
  const sdk = await Hardkas.open({ cwd: targetDir });

  // Delegate entirely to SDK Replay macro
  const result = await sdk.replay.verify({ path: "." });

  if (options.json) {
    console.log(JSON.stringify({
      workspace: options.path,
      artifacts: result.artifactsScanned,
      lineage: result.lineage,
      determinism: result.determinism,
      contamination: result.contamination,
      result: result.passed ? "PASS" : "FAIL"
    }, null, 2));
  } else {
    UI.causality(
      `Replay Verification: ${path.basename(targetDir)}`,
      {
        "Execution Scope": "local deterministic replay",
        "Workspace": options.path,
        "Artifacts Replayed": String(result.artifactsScanned),
        "Lineage Integrity": result.lineage,
        "Deterministic Execution": result.determinism,
        "Network Contamination": result.contamination,
        "Result": result.passed ? "PASS" : "FAIL"
      }
    );
  }

  if (!result.passed) {
    if (result.error) {
      throw new Error(`Failed to perform replay verification: ${result.error}`);
    }
    throw new ReplayVerificationError(result.report || {
      schema: "hardkas.replayReport.v1",
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
    });
  }
}
