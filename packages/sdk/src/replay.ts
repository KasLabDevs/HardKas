import fs from "node:fs";
import path from "node:path";
import {
  verifyArtifactIntegrity,
  writeArtifact,
  ProjectArtifactStore
} from "@hardkas/artifacts";
import { deterministicCompare } from "@hardkas/core";
import type { Hardkas } from "./index.js";
import { HardkasSchemas } from "@hardkas/artifacts";

export interface ReplayVerifyOptions {
  path?: string;
  workflowId?: string;
}

export interface ReplayVerifyResult {
  passed: boolean;
  artifactsScanned: number;
  lineage: "valid" | "invalid";
  determinism: "verified" | "failed";
  contamination: "clean" | "contaminated";
  report: any;
  error?: string;
  /**
   * Wave 7 · REPLAY-MODE-1: machine-readable classification code populated
   * when the SDK deliberately declines to execute a replay. Currently used
   * for `REPLAY_MODE_UNSUPPORTED` (real-node/localnet receipts) — see the
   * mode guard inside `HardkasReplay.verify`. Absent on ordinary passes /
   * divergences so existing consumers that only read `passed` and `error`
   * keep working unchanged.
   */
  code?: string;
}

// Wave 7 · REPLAY-MODE-1: replay execution is implemented for simulator-mode
// receipts only. Other modes (real-node "localnet", etc.) require consensus
// replay infrastructure that HardKAS does not currently provide; attempting
// to run them through `applySimulatedPlan` produces a misleading
// simulator-vs-real receipt diff rather than any honest signal. The SDK
// therefore fail-closes at this boundary with `REPLAY_MODE_UNSUPPORTED`.
const REPLAY_SUPPORTED_MODES = new Set<string>(["simulator"]);

export class HardkasReplay {
  constructor(private sdk: Hardkas) {}

  /**
   * Verifies the deterministic artifact lineage of a transaction replay
   * against the mathematically reconstructed localnet state.
   */
  async verify(
    targetOrOptions?:
      | string
      | { schema?: string; artifactId?: string }
      | ReplayVerifyOptions,
    options?: ReplayVerifyOptions
  ): Promise<ReplayVerifyResult> {
    const throwOnInvalid = (options as any)?.throwOnInvalid !== false;
    let opts: ReplayVerifyOptions = options || {};

    if (typeof targetOrOptions === "string") {
      opts.path = targetOrOptions;
    } else if (targetOrOptions && "artifactId" in targetOrOptions) {
      opts.path = (targetOrOptions as any).artifactId;
    } else if (targetOrOptions) {
      opts = { ...opts, ...(targetOrOptions as ReplayVerifyOptions) };
    }

    const store = new ProjectArtifactStore(this.sdk.workspace.root);

    let plan: any;
    let receipt: any;
    let verifyErrorMsg: string | undefined;
    let report: any = null;
    let artifactCount = 0;
    let lineageOk = true;
    let determinismOk = true;
    let contaminationOk = true;

    const isContaminated = (artifact: any): boolean => {
      if (
        artifact.networkId &&
        artifact.networkId !== "simnet" &&
        artifact.networkId !== "simulated"
      ) {
        const str = JSON.stringify(artifact);
        if (str.includes("kaspa:sim_")) {
          return true;
        }
      }
      return false;
    };

    if (opts.workflowId) {
      // Legacy workflow logic...
      verifyErrorMsg = "Workflow Replay via ID not supported in v4 lineage model. Pass the receipt ID directly.";
      lineageOk = false;
      determinismOk = false;
    } else if (opts.path) {
      try {
        const idOrPath = opts.path;
        const lineage = await store.resolveLineage(idOrPath);

        if (lineage.length === 0) {
           throw new Error(`Could not resolve lineage for ID/Path: ${idOrPath}`);
        }

        artifactCount = lineage.length;

        for (const item of lineage) {
          if (isContaminated(item)) contaminationOk = false;
          const integrity = await verifyArtifactIntegrity(item);
          if (!integrity.ok) determinismOk = false;

          if (item.schema === HardkasSchemas.TxPlan) plan = item;
          if (item.schema === HardkasSchemas.TxReceipt) receipt = item;
        }

        if (!plan) throw new Error("Lineage is missing a TxPlan artifact.");
        if (!receipt) throw new Error("Lineage is missing a TxReceipt artifact.");

      } catch (err: unknown) {
        verifyErrorMsg = ((err instanceof Error) ? err.message : String(err));
        lineageOk = false;
      }

      // Wave 7 · REPLAY-MODE-1: after lineage resolution + receipt identity
      // are established, gate any execution on receipt.mode. Real-node modes
      // (currently only "localnet") are not supported by the simulator-based
      // replay engine; return a structured unsupported result BEFORE calling
      // loadOrCreateLocalnetState / reconstructStateAtDaa / verifyReplay /
      // applySimulatedPlan. This preserves lineage/integrity signal while
      // fail-closing on the execution boundary.
      if (
        !verifyErrorMsg &&
        receipt &&
        typeof receipt.mode === "string" &&
        !REPLAY_SUPPORTED_MODES.has(receipt.mode)
      ) {
        const observedMode = receipt.mode;
        const supportedModes = Array.from(REPLAY_SUPPORTED_MODES).join(", ");
        return {
          passed: false,
          artifactsScanned: artifactCount,
          lineage: lineageOk ? "valid" : "invalid",
          determinism: determinismOk ? "verified" : "failed",
          contamination: contaminationOk ? "clean" : "contaminated",
          report: null,
          error:
            `Replay execution for receipt mode "${observedMode}" is not ` +
            `supported; current replay execution supports ${supportedModes}-mode receipts only.`,
          code: "REPLAY_MODE_UNSUPPORTED"
        };
      }

      if (!verifyErrorMsg && plan && receipt) {
        try {
          const { resolveExecutionTarget } = await import("@hardkas/config");
          const target = receipt.execution || resolveExecutionTarget({ config: this.sdk.config.config, network: receipt.networkId as string }).target;

          const { assertExecutionCompatibility } = await import("@hardkas/core");
          assertExecutionCompatibility({
            operation: "replay",
            target,
            artifact: { execution: plan.execution },
            receipt: { execution: receipt.execution }
          });

          const { loadOrCreateLocalnetState, reconstructStateAtDaa, verifyReplay } =
            await import("@hardkas/localnet");
          const { systemRuntimeContext } = await import("@hardkas/core");

          let state = await loadOrCreateLocalnetState({ cwd: this.sdk.workspace.root });

          if (receipt.mode === "simulator" && receipt.daaScore) {
            const receiptDaa = BigInt(receipt.daaScore);
            const targetDaa = receiptDaa - 1n;
            state = reconstructStateAtDaa(state, targetDaa);
          }

          report = verifyReplay(state, plan, receipt, systemRuntimeContext);

          const reportFilename = `${new Date().toISOString().replace(/:/g, "-")}-${receipt.txId}.replay.json`;
          const reportPath = path.join(this.sdk.workspace.artifactsDir, reportFilename);
          await this.sdk.artifacts.write(report as any, { outputDir: this.sdk.workspace.artifactsDir, fileName: reportFilename });
        } catch (err: unknown) {
          verifyErrorMsg = `Replay execution failed: ${((err instanceof Error) ? err.message : String(err))}`;
        }
      }
    } else {
      verifyErrorMsg = "No receipt ID provided for replay verification";
      lineageOk = false;
    }

    const invariantsOk = report ? report.invariantsOk : false;
    const passed =
      lineageOk && determinismOk && contaminationOk && invariantsOk && !verifyErrorMsg;

    return {
      passed,
      artifactsScanned: artifactCount,
      lineage: lineageOk ? "valid" : "invalid",
      determinism: determinismOk ? "verified" : "failed",
      contamination: contaminationOk ? "clean" : "contaminated",
      report,
      ...(verifyErrorMsg ? { error: verifyErrorMsg } : {})
    };
  }
}
