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
}

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
