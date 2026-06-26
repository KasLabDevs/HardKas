import { Hardkas } from "./index.js";
import { WorkflowArtifact, HARDKAS_VERSION } from "@hardkas/artifacts";
import { HardkasError, deterministicCompare } from "@hardkas/core";
import { HardkasSchemas } from "@hardkas/artifacts";

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
    const { calculateContentHash } = await import("@hardkas/artifacts");

    const intentPayload = {
      type: HardkasSchemas.WorkflowIntent,
      schemaVersion: "v1",
      workflowSpec: options.steps,
      normalizedInputs: {},
      parentArtifacts: [], // In v1, workflows do not accept explicit parent inputs yet
      policySnapshot: {
        allowNetwork: this.sdk.policy.allowNetwork,
        allowMainnet: this.sdk.policy.allowPublic,
        allowExternalWallet: this.sdk.policy.allowExternalWallet,
        requireDryRun: this.sdk.policy.requireDryRun
      },
      capabilitySnapshot: {
        mode: this.sdk.mode,
        network: this.sdk.network
      },
      runtimeVersion: HARDKAS_VERSION,
      workspaceSchemaVersion: HardkasSchemas.WorkflowV1
    };

    const intentHash = calculateContentHash(intentPayload);
    const workflowId = `wf_${intentHash.slice(0, 16)}`;

    const artifactSteps: WorkflowArtifact["steps"] = [];
    const producedArtifacts: string[] = [];
    const parentArtifacts: string[] = [];

    // generationId is mapped via time for now since it's the simplest universal clock we have without the dev-server
    const generationStart = Date.now().toString(); // hardkas-determinism-allow: ambient start generation clock

    let status: "completed" | "failed" = "completed";
    let errorEnvelope: WorkflowArtifact["errorEnvelope"] = undefined;

    let lastPlan: any = null;
    let lastSigned: any = null;

    const stepsResults: Record<string, any> = {};

    // Real Execution Routing
    for (const step of options.steps) {
      const startedAt = new Date().toISOString(); // hardkas-determinism-allow: step start timestamp
      try {
        if (step.type === "simulate-failure") {
          if (this.sdk.mode === "agent") {
            throw new HardkasError(
              "POLICY_DENIED",
              "simulate-failure is strictly prohibited in agent mode"
            );
          }
          throw new HardkasError("MOCKED_FAIL", "Simulated failure for contract tests");
        }

        let producedArtifactId: string | undefined = undefined;
        let result: any = undefined;

        if (step.type === "script") {
          const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
          const fn = new AsyncFunction("ctx", "steps", step.script);

          const scriptCtx = {
            tx: {
              plan: async (opts: any) => {
                if (this.sdk.network !== "simulated") {
                  this.sdk.enforcePolicy(
                    "network",
                    "Workflow script requested transaction planning"
                  );
                }
                const plan = await this.sdk.tx.plan({ ...opts, workflowId });
                await this.sdk.artifacts.write(plan, { dryRun: options.dryRun ?? false });
                const planRecord = plan as unknown as Record<string, string>;
                const id = planRecord.contentHash || planRecord.artifactId || plan.planId;
                if (id) producedArtifacts.push(id);
                lastPlan = plan;
                return plan;
              },
              sign: async (plan: any, account?: any) => {
                const signed = await this.sdk.tx.sign(plan, account);
                await this.sdk.artifacts.write(signed, {
                  dryRun: options.dryRun ?? false
                });
                const signedRecord = signed as unknown as Record<string, string>;
                const id =
                  signedRecord.contentHash || signedRecord.artifactId || signed.signedId;
                if (id) producedArtifacts.push(id);
                lastSigned = signed;
                return signed;
              },
              send: async (signed: any) => {
                this.sdk.enforcePolicy(
                  "mutation",
                  "Workflow script requested real broadcast"
                );
                const res =
                  this.sdk.network === "simulated"
                    ? await this.sdk.tx.simulate(signed)
                    : await this.sdk.tx.send(signed);
                await this.sdk.artifacts.write(res.receipt, {
                  dryRun: options.dryRun ?? false
                });
                const receiptRecord = res.receipt as unknown as Record<string, string>;
                const id =
                  receiptRecord.contentHash ||
                  receiptRecord.artifactId ||
                  receiptRecord.txId;
                if (id) producedArtifacts.push(id);
                return res;
              },
              simulate: async (signed: any) => {
                const res = await this.sdk.tx.simulate(signed);
                await this.sdk.artifacts.write(res.receipt, {
                  dryRun: options.dryRun ?? false
                });
                const receiptRecord = res.receipt as unknown as Record<string, string>;
                const id =
                  receiptRecord.contentHash ||
                  receiptRecord.artifactId ||
                  receiptRecord.txId;
                if (id) producedArtifacts.push(id);
                return res;
              }
            },
            sdk: this.sdk
          };

          result = await fn(scriptCtx, stepsResults);
        } else if (step.type === "network.switch") {
          const targetNetwork = step.args?.network || step.network;
          if (targetNetwork === "mainnet") {
            this.sdk.enforcePolicy(
              "mainnet",
              "Workflow requested network switch to mainnet"
            );
          }
        } else if (step.type === "tx.plan") {
          if (this.sdk.network !== "simulated") {
            this.sdk.enforcePolicy("network", "Workflow requested transaction planning");
          }
          lastPlan = await this.sdk.tx.plan({
            from: step.args?.from || step.from,
            to: step.args?.to || step.to,
            amount: step.args?.amount || step.amount,
            workflowId
          });
          await this.sdk.artifacts.write(lastPlan, { dryRun: options.dryRun ?? false });
          const planRecord = lastPlan as unknown as Record<string, string>;
          producedArtifactId =
            planRecord.contentHash || planRecord.artifactId || lastPlan.planId;
          if (producedArtifactId) producedArtifacts.push(producedArtifactId);
          result = lastPlan;
        } else if (step.type === "tx.simulate" || step.type === "tx.send") {
          if (!lastPlan)
            throw new Error("Cannot sign or send without a prior tx.plan step");

          if (step.type === "tx.send") {
            this.sdk.enforcePolicy(
              "mutation",
              "Workflow requested real broadcast via tx.send"
            );
          }

          lastSigned = await this.sdk.tx.sign(lastPlan);
          await this.sdk.artifacts.write(lastSigned, { dryRun: options.dryRun ?? false });
          const signedRecord = lastSigned as unknown as Record<string, string>;
          const signedId =
            signedRecord.contentHash || signedRecord.artifactId || lastSigned.signedId;
          if (signedId) producedArtifacts.push(signedId);

          if (step.type === "tx.simulate") {
            const { receipt } = await this.sdk.tx.simulate(lastSigned);
            await this.sdk.artifacts.write(receipt, { dryRun: options.dryRun ?? false });
            const receiptRecord = receipt as unknown as Record<string, string>;
            producedArtifactId =
              receiptRecord.contentHash || receiptRecord.artifactId || receiptRecord.txId;
            if (producedArtifactId) producedArtifacts.push(producedArtifactId);
            result = receipt;
          } else {
            const { receipt } =
              this.sdk.network === "simulated"
                ? await this.sdk.tx.simulate(lastSigned)
                : await this.sdk.tx.send(lastSigned);
            await this.sdk.artifacts.write(receipt, { dryRun: options.dryRun ?? false });
            const receiptRecord = receipt as unknown as Record<string, string>;
            producedArtifactId =
              receiptRecord.contentHash || receiptRecord.artifactId || receiptRecord.txId;
            if (producedArtifactId) producedArtifacts.push(producedArtifactId);
            result = receipt;
          }
        }

        if (step.id) {
          stepsResults[step.id] = { result };
        }

        const stepRecord: any = {
          type: step.type,
          status: "success",
          startedAt,
          completedAt: new Date().toISOString() // hardkas-determinism-allow: step completion timestamp
        };
        if (producedArtifactId) stepRecord.producedArtifactId = producedArtifactId;
        artifactSteps.push(stepRecord);
      } catch (e: unknown) {
        status = "failed";
        errorEnvelope = {
          code: ((e as any).code) || "WORKFLOW_STEP_FAILED",
          message: ((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)),
          redacted: false
        };
        artifactSteps.push({
          type: step.type,
          status: "failed",
          startedAt,
          completedAt: new Date().toISOString(), // hardkas-determinism-allow: step failed timestamp
          error: ((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e))
        });
        break; // Stop execution on first failure
      }
    }

    const executionMode = this.sdk.network === "simulated" ? "simulated" : "real";

    const artifact: any = {
      schema: HardkasSchemas.WorkflowV1,
      version: "1.0.0-alpha",
      hardkasVersion: HARDKAS_VERSION,
      networkId: this.sdk.network,
      mode: executionMode,
      createdAt: new Date().toISOString(), // hardkas-determinism-allow: workflow artifact creation timestamp
      workflowId,
      artifactId: workflowId,
      status,
      steps: artifactSteps,
      parentArtifacts: parentArtifacts.sort(deterministicCompare),
      producedArtifacts: Array.from(new Set(producedArtifacts)).sort(
        deterministicCompare
      ),
      generationRange: {
        start: generationStart,
        end: Date.now().toString() // hardkas-determinism-allow: ambient end generation clock
      },
      policy: {
        allowNetwork: this.sdk.policy.allowNetwork,
        allowMainnet: this.sdk.policy.allowPublic,
        allowExternalWallet: this.sdk.policy.allowExternalWallet,
        requireDryRun: this.sdk.policy.requireDryRun
      }
    };

    if (errorEnvelope) {
      artifact.errorEnvelope = errorEnvelope;
    }

    artifact.contentHash = calculateContentHash(artifact, 1);

    if (!options.dryRun) {
      this.sdk.enforcePolicy("mutation", "Workflow Runtime saving artifact");
      await this.sdk.artifacts.write(artifact, {
        fileName: `workflow.v1-${workflowId}.json`
      });
    }

    return artifact as WorkflowArtifact;
  }
}
