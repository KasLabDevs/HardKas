import { Hardkas } from "./index.js";
import { WorkflowArtifact, HARDKAS_VERSION } from "@hardkas/artifacts";
import { HardkasError } from "@hardkas/core";

export interface WorkflowRunOptions {
  steps: Array<{
    type: string;
    [key: string]: any;
  }>;
  dryRun?: boolean;
}

export class HardkasWorkflow {
  constructor(private readonly sdk: Hardkas) {}

  /**
   * Executes a sequence of declarative steps and returns a definitive WorkflowArtifact.
   */
  public async run(options: WorkflowRunOptions): Promise<WorkflowArtifact> {
    const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` as any;
    const artifactSteps: WorkflowArtifact["steps"] = [];
    const producedArtifacts: string[] = [];
    const parentArtifacts: string[] = [];
    
    // generationId is mapped via time for now since it's the simplest universal clock we have without the dev-server
    const generationStart = Date.now().toString();
    
    let status: "completed" | "failed" = "completed";
    let errorEnvelope: WorkflowArtifact["errorEnvelope"] = undefined;

    let lastPlan: any = null;
    let lastSigned: any = null;

    // Real Execution Routing
    for (const step of options.steps) {
      const startedAt = new Date().toISOString();
      try {
        if (step.type === "simulate-failure") {
          throw new HardkasError("MOCKED_FAIL", "Simulated failure for contract tests");
        }

        let producedArtifactId: string | undefined = undefined;

        if (step.type === "network.switch") {
          const targetNetwork = step.args?.network || step.network;
          if (targetNetwork === "mainnet") {
            this.sdk.enforcePolicy("mainnet", "Workflow requested network switch to mainnet");
          }
        } else if (step.type === "tx.plan") {
          this.sdk.enforcePolicy("network", "Workflow requested transaction planning");
          lastPlan = await this.sdk.tx.plan({
            from: step.args?.from || step.from,
            to: step.args?.to || step.to,
            amount: step.args?.amount || step.amount
          });
          if (!options.dryRun) {
            await this.sdk.artifacts.write(lastPlan);
          }
          producedArtifactId = lastPlan.artifactId || (lastPlan as any).contentHash;
          if (producedArtifactId) producedArtifacts.push(producedArtifactId);
        } else if (step.type === "tx.simulate" || step.type === "tx.send") {
          if (!lastPlan) throw new Error("Cannot sign or send without a prior tx.plan step");
          
          if (step.type === "tx.send") {
            this.sdk.enforcePolicy("mutation", "Workflow requested real broadcast via tx.send");
          }

          lastSigned = await this.sdk.tx.sign(lastPlan);
          if (!options.dryRun) {
            await this.sdk.artifacts.write(lastSigned);
          }
          const signedId = lastSigned.artifactId || (lastSigned as any).contentHash;
          if (signedId) producedArtifacts.push(signedId);

          if (step.type === "tx.simulate") {
            const { receipt } = await this.sdk.tx.simulate(lastSigned);
            if (!options.dryRun) await this.sdk.artifacts.write(receipt);
            producedArtifactId = (receipt as any).artifactId || (receipt as any).contentHash;
            if (producedArtifactId) producedArtifacts.push(producedArtifactId);
          } else {
            const { receipt } = await this.sdk.tx.send(lastSigned);
            if (!options.dryRun) await this.sdk.artifacts.write(receipt);
            producedArtifactId = (receipt as any).artifactId || (receipt as any).contentHash;
            if (producedArtifactId) producedArtifacts.push(producedArtifactId);
          }
        }

        const stepRecord: any = {
          type: step.type,
          status: "success",
          startedAt,
          completedAt: new Date().toISOString()
        };
        if (producedArtifactId) stepRecord.producedArtifactId = producedArtifactId;
        artifactSteps.push(stepRecord);
      } catch (e: any) {
        console.error("DEBUG WORKFLOW ERROR:", e.stack);
        status = "failed";
        errorEnvelope = {
          code: e.code || "WORKFLOW_STEP_FAILED",
          message: e.message,
          redacted: false
        };
        artifactSteps.push({
          type: step.type,
          status: "failed",
          startedAt,
          completedAt: new Date().toISOString(),
          error: e.message
        });
        break; // Stop execution on first failure
      }
    }

    const executionMode = this.sdk.network === "simulated" ? "simulated" : "real";

    const artifact: any = {
      schema: "hardkas.workflow.v1",
      version: "1.0.0-alpha",
      hardkasVersion: HARDKAS_VERSION,
      networkId: this.sdk.network,
      mode: executionMode,
      createdAt: new Date().toISOString(),
      workflowId,
      artifactId: workflowId,
      status,
      steps: artifactSteps,
      parentArtifacts,
      producedArtifacts,
      generationRange: {
        start: generationStart,
        end: Date.now().toString()
      },
      policy: {
        allowNetwork: this.sdk.policy.allowNetwork,
        allowMainnet: this.sdk.policy.allowMainnet,
        allowExternalWallet: this.sdk.policy.allowExternalWallet,
        requireDryRun: this.sdk.policy.requireDryRun
      }
    };

    if (errorEnvelope) {
      artifact.errorEnvelope = errorEnvelope;
    }

    if (!options.dryRun) {
      this.sdk.enforcePolicy("mutation", "Workflow Runtime saving artifact");
      await this.sdk.artifacts.write(artifact, { fileName: `workflow.v1-${workflowId}.json` });
    }

    return artifact as WorkflowArtifact;
  }
}
