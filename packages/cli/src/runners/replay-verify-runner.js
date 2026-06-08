import { UI } from "../ui.js";
import path from "node:path";
import { ReplayVerificationError } from "../cli-errors.js";
export async function runReplayVerify(options) {
    const { Hardkas } = await import("@hardkas/sdk");
    const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
    const effectivePath = options.path || undefined;
    const targetDir = effectivePath
        ? sdk.workspace.resolvePath(effectivePath)
        : options.workspaceRoot;
    const verifyOptions = {};
    if (effectivePath) {
        verifyOptions.path = effectivePath;
    }
    const result = await sdk.replay.verify(verifyOptions);
    // Map result to requested literal status
    let finalStatus = "diverged";
    if (result.passed) {
        finalStatus = "passed";
    }
    else if (result.error?.includes("unsupported") ||
        result.error?.includes("not a workflow artifact")) {
        finalStatus = "unsupported";
    }
    else if (result.lineage === "invalid" ||
        result.error?.includes("not found") ||
        result.error?.includes("missing")) {
        finalStatus = "missing_dependency";
    }
    else if (result.determinism === "failed") {
        // If the cryptography/integrity failed
        finalStatus = "non_deterministic";
    }
    else {
        // Standard semantic divergence
        finalStatus = "diverged";
    }
    if (options.json) {
        console.log(JSON.stringify({
            schemaVersion: "hardkas.replayVerify.v1",
            workspace: options.path,
            artifacts: result.artifactsScanned,
            lineage: result.lineage,
            determinism: result.determinism,
            contamination: result.contamination,
            result: finalStatus,
            targetTxId: result.report?.txId || "unknown",
            deterministic: result.determinism === "verified"
        }, null, 2));
    }
    else {
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
//# sourceMappingURL=replay-verify-runner.js.map