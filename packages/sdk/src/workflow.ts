import { Hardkas } from "./index.js";
import { WorkflowArtifact, HARDKAS_VERSION, submitOutcomeOf } from "@hardkas/artifacts";
import { HardkasError, deterministicCompare, rethrowWithLedgerEffect, type LedgerFailureEffect } from "@hardkas/core";
import { HardkasSchemas } from "@hardkas/artifacts";

/**
 * EVENT-LEDGER-2 final closeout (A1) · what a `tx.send` / `tx.simulate` result had already done, for a ledger failure
 * raised by a step's writes after it: a simulated execution, or a broadcast with the outcome its submit result records.
 */
function effectOf(res: any): LedgerFailureEffect {
  const artifact = res?.submission ?? res?.receipt;
  const simulated = res?.simulated === true || artifact?.mode === "simulator";
  return {
    operation: simulated ? "simulated-execution" : "broadcast",
    outcome: simulated ? "executed" : submitOutcomeOf(artifact?.submitResult),
    txId: typeof artifact?.txId === "string" ? artifact.txId : undefined,
    artifactId: typeof artifact?.contentHash === "string" ? artifact.contentHash : undefined,
    artifactPath: typeof res?.receiptPath === "string" ? res.receiptPath : undefined
  };
}

export interface WorkflowRunOptions {
  steps: Array<{
    type: string;
    [key: string]: any;
  }>;
  dryRun?: boolean;
}

/** The step types this runtime executes; anything else is refused before the first step runs. */
const EXECUTED_STEP_TYPES = ["simulate-failure", "script", "network.switch", "tx.plan", "tx.simulate", "tx.send"] as const;

export class HardkasWorkflow {
  constructor(private readonly sdk: Hardkas) {}

  /**
   * SURFACE-TRUTH-1A (ST-I3, ST-I4): the whole definition is checked before any step runs. Returns the first step the
   * runtime refuses, with its typed error, or undefined.
   * - an unknown step type (it used to fall through every branch and be recorded as `success`);
   * - `network.switch` to a network other than the one the workflow runs on (it used to be recorded as `success` while
   *   the steps after it kept running on the old network); a switch to mainnet keeps answering with the mainnet policy;
   * - a `script` step under containment (agent mode, `dryRun`, a policy without network): the script runs arbitrary code
   *   in this process with every Node global, so neither the dry run nor the network policy applies to it.
   */
  private refusedStep(options: WorkflowRunOptions): { step: WorkflowRunOptions["steps"][number]; error: HardkasError } | undefined {
    for (const step of options.steps) {
      try {
        if (!(EXECUTED_STEP_TYPES as readonly string[]).includes(step.type)) {
          throw new HardkasError(
            "WORKFLOW_STEP_UNKNOWN",
            `Workflow step type '${String(step.type)}' is not one this runtime executes (${EXECUTED_STEP_TYPES.join(", ")}); nothing ran.`
          );
        }
        if (step.type === "network.switch") {
          const target = step.args?.network || step.network;
          if (target === "mainnet") {
            this.sdk.enforcePolicy("mainnet", "Workflow requested network switch to mainnet");
          }
          if (target !== this.sdk.network) {
            throw new HardkasError(
              "WORKFLOW_STEP_UNSUPPORTED",
              `network.switch cannot move a running workflow from '${String(this.sdk.network)}' to '${String(target)}': the steps after it would still run on '${String(this.sdk.network)}'. Run the workflow on the network it needs; nothing ran.`
            );
          }
        }
        if (step.type === "script" && (this.sdk.mode === "agent" || options.dryRun === true || this.sdk.policy.allowNetwork === false)) {
          throw new HardkasError(
            "WORKFLOW_SCRIPT_REFUSED",
            "A script step runs arbitrary code in this process, outside the agent policy, the dry run and the network policy, so it is refused under any of them; nothing ran."
          );
        }
      } catch (e: unknown) {
        return { step, error: e instanceof HardkasError ? e : new HardkasError("WORKFLOW_STEP_INVALID", e instanceof Error ? e.message : String(e)) };
      }
    }
    return undefined;
  }

  /**
   * Executes a sequence of declarative steps and returns a definitive WorkflowArtifact.
   */
  public async run(options: WorkflowRunOptions): Promise<WorkflowArtifact> {
    const { calculateContentHash, CURRENT_HASH_VERSION, deriveWorkflowId } = await import("@hardkas/artifacts");

    // IC-7.4: the single workflowId derivation over the run's typed intent (a
    // domain digest, IC-1′.7; never the artifact's own hash, IC-1′.5).
    const workflowId = deriveWorkflowId({
      kind: "steps",
      steps: options.steps,
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
    });

    const artifactSteps: WorkflowArtifact["steps"] = [];
    const producedArtifacts: string[] = [];
    const parentArtifacts: string[] = [];

    // generationId is mapped via time for now since it's the simplest universal clock we have without the dev-server
    const generationStart = Date.now().toString(); // hardkas-determinism-allow: ambient start generation clock

    let status: "completed" | "failed" = "completed";
    let errorEnvelope: WorkflowArtifact["errorEnvelope"] = undefined;

    let lastPlan: any = null;
    let lastSigned: any = null;
    // Wave 1.2 · IC-5′.6/.8: a dry run persists nothing, so the in-memory plan is
    // handed to simulate/send explicitly; it is accepted only if its recomputed
    // identity is the signed artifact's authenticated parent.
    const parentHint = (signed: any): { plan?: any } =>
      lastPlan && signed?.lineage?.parentArtifactId === lastPlan.contentHash ? { plan: lastPlan } : {};

    // Wave 1.3 security review B2: a real `send()` RECORDS a rejected submit
    // (txSubmission.v1, submitResult.accepted = false) and returns
    // `submitted: false`; the step must fail, never be recorded as success.
    // The simulator path of `send()` also reports `submitted: false` (nothing is
    // broadcast by design) together with `simulated: true`; that is not a rejection.
    const assertBroadcastAccepted = (res: any): void => {
      if (res && res.submitted === false && res.simulated !== true) {
        const submissionId = res.submission?.contentHash ?? res.artifactId ?? "unknown";
        const reason = res.submission?.submitResult?.error ?? "no reason returned";
        // EVENT-LEDGER-2 final closeout (decision 2): a submit call that failed without an answer is not a rejection
        if (submitOutcomeOf(res.submission?.submitResult) === "unknown") {
          const txId = typeof res.txId === "string" && /^[0-9a-f]{64}$/.test(res.txId) ? res.txId : undefined;
          throw new HardkasError(
            "TX_SUBMISSION_OUTCOME_UNKNOWN",
            `The outcome of the submission is unknown: the submit call failed without an answer from the node (${reason}), ` +
              `which may have received the transaction. The attempt was recorded as ${submissionId}; check the transaction` +
              `${txId ? ` ('hardkas tx status ${txId}')` : ""} before sending it again.`
          );
        }
        throw new HardkasError(
          "TX_SUBMISSION_REJECTED",
          `The node did not accept the transaction (${reason}); the submission was recorded as ${submissionId}.`
        );
      }
    };

    const stepsResults: Record<string, any> = {};

    // SURFACE-TRUTH-1A: a definition with a refused step fails as a whole, before any step runs.
    const refused = this.refusedStep(options);
    if (refused) {
      const at = new Date().toISOString(); // hardkas-determinism-allow: refusal timestamp
      status = "failed";
      errorEnvelope = { code: refused.error.code, message: refused.error.message, redacted: false };
      artifactSteps.push({ type: refused.step.type, status: "failed", startedAt: at, completedAt: at, error: refused.error.message });
    }

    // Real Execution Routing
    for (const step of refused ? [] : options.steps) {
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
                const produced = await this.sdk.tx.plan({ ...opts, workflowId });
                // EVIDENCE-TRUST-1 (D2): the plan handed on is exactly the stored one (an identity published before is kept)
                const plan = (await this.sdk.artifacts.write(produced, { dryRun: options.dryRun ?? false })).artifact ?? produced;
                const planRecord = plan as unknown as Record<string, string>;
                const id = planRecord.contentHash || planRecord.artifactId || plan.planId;
                if (id) producedArtifacts.push(id);
                lastPlan = plan;
                return plan;
              },
              sign: async (plan: any, account?: any) => {
                const producedSigned = await this.sdk.tx.sign(plan, account);
                const signed =
                  (await this.sdk.artifacts.write(producedSigned, { dryRun: options.dryRun ?? false })).artifact ?? producedSigned;
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
                const sent: any =
                  this.sdk.network === "simulated"
                    ? await this.sdk.tx.simulate(signed, parentHint(signed))
                    : await this.sdk.tx.send(signed, parentHint(signed));
                assertBroadcastAccepted(sent);
                const storedReceipt = (
                  await this.sdk.artifacts
                    .write(sent.receipt, { dryRun: options.dryRun ?? false })
                    .catch((e: unknown) => rethrowWithLedgerEffect(e, effectOf(sent)))
                ).artifact;
                const res = storedReceipt ? { ...sent, receipt: storedReceipt } : sent;
                const receiptRecord = res.receipt as unknown as Record<string, string>;
                const id =
                  receiptRecord.contentHash ||
                  receiptRecord.artifactId ||
                  receiptRecord.txId;
                if (id) producedArtifacts.push(id);
                return res;
              },
              simulate: async (signed: any) => {
                const simulated: any = await this.sdk.tx.simulate(signed, parentHint(signed));
                const storedReceipt = (
                  await this.sdk.artifacts
                    .write(simulated.receipt, { dryRun: options.dryRun ?? false })
                    .catch((e: unknown) => rethrowWithLedgerEffect(e, effectOf(simulated)))
                ).artifact;
                const res = storedReceipt ? { ...simulated, receipt: storedReceipt } : simulated;
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
          const producedPlan = await this.sdk.tx.plan({
            from: step.args?.from || step.from,
            to: step.args?.to || step.to,
            amount: step.args?.amount || step.amount,
            workflowId
          });
          // EVIDENCE-TRUST-1 (D2): carry on with exactly the stored copy
          lastPlan = (await this.sdk.artifacts.write(producedPlan, { dryRun: options.dryRun ?? false })).artifact ?? producedPlan;
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

          const producedSigned = await this.sdk.tx.sign(lastPlan);
          lastSigned = (await this.sdk.artifacts.write(producedSigned, { dryRun: options.dryRun ?? false })).artifact ?? producedSigned;
          const signedRecord = lastSigned as unknown as Record<string, string>;
          const signedId =
            signedRecord.contentHash || signedRecord.artifactId || lastSigned.signedId;
          if (signedId) producedArtifacts.push(signedId);

          if (step.type === "tx.simulate") {
            const simulated = await this.sdk.tx.simulate(lastSigned, parentHint(lastSigned));
            const producedReceipt = simulated.receipt;
            const receipt =
              (
                await this.sdk.artifacts
                  .write(producedReceipt, { dryRun: options.dryRun ?? false })
                  .catch((e: unknown) => rethrowWithLedgerEffect(e, effectOf(simulated)))
              ).artifact ?? producedReceipt;
            const receiptRecord = receipt as unknown as Record<string, string>;
            producedArtifactId =
              receiptRecord.contentHash || receiptRecord.artifactId || receiptRecord.txId;
            if (producedArtifactId) producedArtifacts.push(producedArtifactId);
            result = receipt;
          } else {
            const sendResult: any =
              this.sdk.network === "simulated"
                ? await this.sdk.tx.simulate(lastSigned, parentHint(lastSigned))
                : await this.sdk.tx.send(lastSigned, parentHint(lastSigned));
            assertBroadcastAccepted(sendResult);
            const receipt =
              (
                await this.sdk.artifacts
                  .write(sendResult.receipt, { dryRun: options.dryRun ?? false })
                  .catch((e: unknown) => rethrowWithLedgerEffect(e, effectOf(sendResult)))
              ).artifact ?? sendResult.receipt;
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
      } catch (e: any) {
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

    const isSimulated =
      this.sdk.network === "simulated" ||
      this.sdk.config.config.networks?.[this.sdk.network]?.kind === "simulated";
    const networkConfig = this.sdk.config.config.networks?.[this.sdk.network];
    const executionMode = isSimulated ? "simulator" : (networkConfig?.kind === "kaspa-node" ? "localnet" : "rpc");

    const artifact: any = {
      schema: HardkasSchemas.WorkflowV1,
      version: "1.0.0-alpha",
      hardkasVersion: HARDKAS_VERSION,
      networkId: this.sdk.network,
      mode: executionMode,
      // N6 / IC-7.3–5: a version-5 artifact; its identity is the recomputed
      // contentHash (resolvable by `{ artifact }`), its workflowId is a
      // correlation label (resolvable by `{ workflow }`); no artifactId copy.
      hashVersion: CURRENT_HASH_VERSION,
      createdAt: new Date().toISOString(), // hardkas-determinism-allow: workflow artifact creation timestamp
      workflowId,
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

    artifact.contentHash = calculateContentHash(artifact, CURRENT_HASH_VERSION);

    if (!options.dryRun) {
      this.sdk.enforcePolicy("mutation", "Workflow Runtime saving artifact");
      await this.sdk.artifacts.write(artifact, {
        fileName: `workflow.v1-${workflowId}.json`
      });
    }

    return artifact as WorkflowArtifact;
  }
}
