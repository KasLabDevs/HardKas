import { runTxPlan } from "./tx-plan-runner.js";
import { runTxSign } from "./tx-sign-runner.js";
import { runTxSend, TxSendRunnerResult } from "./tx-send-runner.js";
import {
  TxPlanArtifact,
  SignedTxArtifact,
  writeArtifact,
  deriveWorkflowId,
  submitOutcomeOf,
  HARDKAS_VERSION
} from "@hardkas/artifacts";
import { HardkasConfig } from "@hardkas/config";
import {
  coreEvents,
  createEventEnvelope,
  isEventLedgerAppendFailure,
  rethrowWithLedgerEffect,
  asEventSequence,
  asArtifactId,
  asWorkflowId,
  asCorrelationId,
  asNetworkId,
  asTxId,
  type LedgerFailureEffect
} from "@hardkas/core";
import crypto from "node:crypto";
import path from "path";
import fs from "fs";
import { HardkasSchemas, ensureDirRespectingStore, writeFileRespectingStore } from "@hardkas/artifacts";

export interface TxFlowInput {
  from: string;
  to: string;
  amount: string;
  network?: string;
  config: HardkasConfig;
  url?: string;
  feeRate?: string;
  provider?: string;

  planOnly?: boolean;
  sign?: boolean;
  send?: boolean;
  yes?: boolean;

  outDir?: string;
  name?: string;

  allowMainnetSigning?: boolean;
  workspaceRoot?: string;
}

export interface TxFlowStepResult<T> {
  status: "ok" | "skipped" | "blocked" | "error";
  artifact?: T;
  artifactPath?: string;
  error?: string;
  reason?: string;
  /** EVENT-LEDGER-2 final closeout (A1): the typed code of the step's error, when it has one. */
  code?: string;
  /** What the flow had already sent or executed when the step failed (a ledger failure, or any failure after the send). */
  effect?: LedgerFailureEffect;
}

/** EVENT-LEDGER-2 final closeout (A1) · what a send step that ran did: a broadcast (with its recorded outcome) or a simulated execution. */
function sendEffectOf(sent: TxSendRunnerResult): LedgerFailureEffect {
  const receipt: any = sent.receipt;
  const broadcast = receipt?.schema === HardkasSchemas.TxSubmissionV1;
  return {
    operation: broadcast ? "broadcast" : "simulated-execution",
    outcome: broadcast ? submitOutcomeOf(receipt?.submitResult) : "executed",
    txId: sent.txId,
    artifactId: typeof receipt?.contentHash === "string" ? receipt.contentHash : undefined,
    artifactPath: sent.receiptPath
  };
}

export interface TxFlowResult {
  ok: boolean;
  networkId: string;
  mode: string;
  steps: {
    plan: TxFlowStepResult<TxPlanArtifact>;
    sign: TxFlowStepResult<SignedTxArtifact>;
    send: TxFlowStepResult<TxSendRunnerResult>;
  };
  result: "planned-only" | "signed" | "broadcast" | "not-broadcast";
}

/**
 * Orchestrates the full transaction workflow: plan -> sign -> send.
 */
export async function runTxFlow(input: TxFlowInput): Promise<TxFlowResult> {
  // RESOURCE-LIFECYCLE-1 (RL-I1/RL-I3): the SDK the flow opens is released whatever the flow ends with.
  const opened: { sdk?: { close(): Promise<void> } } = {};
  try {
    return await txFlow(input, opened);
  } finally {
    await opened.sdk?.close();
  }
}

async function txFlow(input: TxFlowInput, opened: { sdk?: { close(): Promise<void> } }): Promise<TxFlowResult> {
  const {
    from,
    to,
    amount,
    network,
    config,
    url,
    feeRate,
    planOnly,
    sign,
    send,
    yes,
    outDir,
    name,
    allowMainnetSigning,
    workspaceRoot
  } = input;

  // Resolve effective network from execution contract
  const resolvedNetwork = (() => {
    if (network) return network;
    const exec = config.execution as any;
    if (exec?.default && exec?.targets?.[exec.default]?.network) {
      return exec.targets[exec.default].network;
    }
    return config.defaultNetwork || "simnet";
  })();

  const { Hardkas } = await import("@hardkas/sdk");
  let sdk: any = null;
  let actualOutDir: string;
  try {
    sdk = await Hardkas.open({ cwd: workspaceRoot || process.cwd() });
    opened.sdk = sdk;
    actualOutDir = outDir || sdk.workspace.artifactsDir;
  } catch {
    // SDK not available (e.g. standalone CLI install) — use default artifacts dir
    const cwd = workspaceRoot || process.cwd();
    actualOutDir = outDir || path.join(cwd, ".hardkas", "artifacts");
  }
  if (!fs.existsSync(actualOutDir)) {
    await ensureDirRespectingStore(actualOutDir); // through the store's gate when it is the store (ARTIFACT-MUTATION-1)
  }

  // Validation
  if (planOnly && (sign || send)) {
    throw new Error("--plan-only cannot be combined with --sign or --send.");
  }

  const shouldSign = sign || send;
  const shouldSend = send;

  const configExt = config as HardkasConfig & {
    policy?: {
      allowNetwork?: boolean;
      allowMainnet?: boolean;
      allowExternalWallet?: boolean;
      requireDryRun?: boolean;
    };
    mode?: string;
  };

  // IC-7.4: the single workflowId derivation over the flow's typed intent.
  const workflowId = asWorkflowId(deriveWorkflowId({
    kind: "steps",
    steps: [
      {
        type: "tx.flow",
        from,
        to,
        amount,
        network,
        feeRate,
        planOnly,
        sign,
        send
      }
    ],
    normalizedInputs: {
      from,
      to,
      amount,
      feeRate
    },
    parentArtifacts: [],
    policySnapshot: {
      allowNetwork: configExt.policy?.allowNetwork ?? true,
      allowMainnet: configExt.policy?.allowMainnet ?? false,
      allowExternalWallet: configExt.policy?.allowExternalWallet ?? false,
      requireDryRun: configExt.policy?.requireDryRun ?? false
    },
    capabilitySnapshot: {
      mode: configExt.mode ?? "developer",
      network: resolvedNetwork
    },
    runtimeVersion: HARDKAS_VERSION,
    workspaceSchemaVersion: HardkasSchemas.WorkflowV1
  }));
  let globalOffset = 0;

  const netId = asNetworkId(resolvedNetwork);

  // EVENT-LEDGER-2 final closeout (A1): until the send step runs, a ledger failure of a flow that was to send says that
  // nothing was sent (or executed, in the simulator); once it ran, the failure names what it did (sendEffectOf).
  let sendOperation: LedgerFailureEffect["operation"] = resolvedNetwork === "simulated" ? "simulated-execution" : "broadcast";
  const notPerformed = (): LedgerFailureEffect => ({ operation: sendOperation, outcome: "not-performed" });

  try {
    coreEvents.emit(
      createEventEnvelope({
        kind: "workflow.started",
        domain: "workflow",
        workflowId,
        correlationId: asCorrelationId(workflowId),
        networkId: netId,
        payload: { workflowId, network: netId },
        sequenceNumber: asEventSequence(1),
        globalOffset: globalOffset++,
        sourceSubsystem: "cli:tx-flow"
      })
    );
  } catch (e: unknown) {
    if (shouldSend) rethrowWithLedgerEffect(e, notPerformed());
    throw e;
  }

  const flowResult: TxFlowResult = {
    ok: true,
    networkId: resolvedNetwork,
    mode: "unknown",
    steps: {
      plan: { status: "skipped" },
      sign: { status: "skipped" },
      send: { status: "skipped" }
    },
    result: "planned-only"
  };

  // the step a failure belongs to (a step's own announcements included), and what the send step returned once it ran
  let current: "plan" | "sign" | "send" = "plan";
  let sendResult: TxSendRunnerResult | undefined;

  try {
    // 1. Plan
    const planInput: any = {
      from,
      to,
      amount,
      networkId: flowResult.networkId,
      feeRate,
      config,
      ...(url ? { url } : {})
    };
    if (workspaceRoot) planInput.workspaceRoot = workspaceRoot;

    const planArtifact = await runTxPlan(planInput);
    sendOperation = planArtifact.mode === "simulator" ? "simulated-execution" : "broadcast";

    flowResult.mode = planArtifact.mode;
    flowResult.networkId = planArtifact.networkId;
    flowResult.steps.plan = { status: "ok", artifact: planArtifact };

    const planId = asArtifactId(planArtifact.planId);
    const planNetId = asNetworkId(planArtifact.networkId);

    coreEvents.emit(
      createEventEnvelope({
        kind: "workflow.plan.created",
        domain: "workflow",
        workflowId,
        correlationId: asCorrelationId(workflowId),
        networkId: planNetId,
        payload: {
          planId,
          network: planNetId,
          amountSompi: BigInt(planArtifact.amountSompi)
        },
        sequenceNumber: asEventSequence(2),
        globalOffset: globalOffset++,
        sourceSubsystem: "cli:tx-flow",
        artifactId: planId
      })
    );

    if (actualOutDir) {
      const planPath = await saveArtifact(
        sdk,
        planArtifact,
        actualOutDir,
        name,
        "plan",
        from,
        to,
        amount
      );
      flowResult.steps.plan.artifactPath = planPath;

      coreEvents.emit(
        createEventEnvelope({
          kind: "artifact.written",
          domain: "workflow",
          workflowId,
          correlationId: asCorrelationId(workflowId),
          networkId: planNetId,
          payload: { artifactId: planId, path: planPath },
          sequenceNumber: asEventSequence(3),
          globalOffset: globalOffset++,
          sourceSubsystem: "cli:tx-flow",
          artifactId: planId
        })
      );
    }

    if (planOnly) {
      flowResult.result = "planned-only";
      coreEvents.emit(
        createEventEnvelope({
          kind: "workflow.completed",
          domain: "workflow",
          workflowId,
          correlationId: asCorrelationId(workflowId),
          networkId: asNetworkId(flowResult.networkId),
          payload: { workflowId },
          sequenceNumber: asEventSequence(8),
          globalOffset: globalOffset++,
          sourceSubsystem: "cli:tx-flow"
        })
      );
      return flowResult;
    }

    // 2. Sign
    if (shouldSign) {
      // Security guard: require --yes for real signing if we are in a flow that intended to --send.
      // #7: a simulator plan is `mode: "simulator"` (the old `"simulated"` matched nothing, so the
      // guard also stopped simulator flows that gave no `yes`; every CLI caller passes it).
      if (shouldSend && !yes && planArtifact.mode !== "simulator") {
        flowResult.steps.sign = {
          status: "blocked",
          reason: "--yes is required before signing/sending a real transaction flow."
        };
        flowResult.steps.send = { status: "blocked", reason: "sign blocked" };
        flowResult.result = "planned-only";
        flowResult.ok = false;
        return flowResult;
      }

      current = "sign";
      const signedArtifact = await runTxSign({
        planArtifact,
        config,
        ...(allowMainnetSigning !== undefined ? { allowMainnetSigning } : {}),
        ...(workspaceRoot ? { workspaceRoot } : {})
      });

      flowResult.steps.sign = { status: "ok", artifact: signedArtifact };
      flowResult.result = "signed";

      const signedId = asArtifactId(signedArtifact.signedId);
      const signedNetId = asNetworkId(signedArtifact.networkId);

      coreEvents.emit(
        createEventEnvelope({
          kind: "workflow.signed",
          domain: "workflow",
          workflowId,
          correlationId: asCorrelationId(workflowId),
          networkId: signedNetId,
          payload: { signedId, planId: planId },
          sequenceNumber: asEventSequence(4),
          globalOffset: globalOffset++,
          sourceSubsystem: "cli:tx-flow",
          artifactId: signedId
        })
      );

      if (actualOutDir) {
        const signedPath = await saveArtifact(
          sdk,
          signedArtifact,
          actualOutDir,
          name,
          "signed",
          from,
          to,
          amount
        );
        flowResult.steps.sign.artifactPath = signedPath;

        coreEvents.emit(
          createEventEnvelope({
            kind: "artifact.written",
            domain: "workflow",
            workflowId,
            correlationId: asCorrelationId(workflowId),
            networkId: signedNetId,
            payload: { artifactId: signedId, path: signedPath },
            sequenceNumber: asEventSequence(5),
            globalOffset: globalOffset++,
            sourceSubsystem: "cli:tx-flow",
            artifactId: signedId
          })
        );
      }

      // 3. Send
      if (shouldSend) {
        if (!yes) {
          flowResult.steps.send = {
            status: "blocked",
            reason: "--yes is required to broadcast"
          };
          flowResult.result = "signed";
          flowResult.ok = false;
        } else {
          current = "send";
          sendResult = await runTxSend({
            signedArtifact,
            config,
            ...(url ? { url } : {}),
            ...(workspaceRoot ? { workspaceRoot } : {})
          });
          // the send step ran: whatever fails after this point fails after a broadcast or an execution
          flowResult.result = "broadcast";

          if (actualOutDir && sendResult.receipt) {
            const receiptPath = await saveArtifact(
              sdk,
              sendResult.receipt,
              actualOutDir,
              name,
              "receipt",
              from,
              to,
              amount
            );
            sendResult.receiptPath = receiptPath;

            // IC-5′.11: events carry the canonical identity, the txId is labelled as such.
            const receiptId = asArtifactId((sendResult.receipt as any).contentHash ?? sendResult.receipt.txId);
            const receiptNetId = asNetworkId(sendResult.receipt.networkId);

            // R-iii / IC-2′.8: the event status is decided from an authenticated
            // outcome only (a submission's result or a FULL-scope receipt's status).
            const { sendOutcome } = await import("./next-steps.js");
            const outcome = sendOutcome(sendResult.receipt);
            const eventStatus: "accepted" | "finalized" | "failed" = !outcome.decided || !outcome.accepted
              ? "failed"
              : outcome.kind === "receipt" && outcome.status === "confirmed"
                ? "finalized"
                : "accepted";
            // EVENT-LEDGER-2 final closeout (decision 2): a submission whose outcome is unknown (the submit call failed
            // without an answer) has no receipt status to announce — "failed" would read as a rejection; its submission
            // artifact is still announced below
            const outcomeUnknown = sendEffectOf(sendResult).outcome === "unknown";

            if (!outcomeUnknown) {
              coreEvents.emit(
                createEventEnvelope({
                  kind: "workflow.receipt",
                  domain: "workflow",
                  workflowId,
                  correlationId: asCorrelationId(workflowId),
                  networkId: receiptNetId,
                  payload: {
                    txId: asTxId(sendResult.receipt.txId),
                    status: eventStatus
                  },
                  sequenceNumber: asEventSequence(6),
                  globalOffset: globalOffset++,
                  sourceSubsystem: "cli:tx-flow",
                  artifactId: receiptId
                })
              );
            }

            coreEvents.emit(
              createEventEnvelope({
                kind: "artifact.written",
                domain: "workflow",
                workflowId,
                correlationId: asCorrelationId(workflowId),
                networkId: receiptNetId,
                payload: { artifactId: receiptId, path: receiptPath },
                sequenceNumber: asEventSequence(7),
                globalOffset: globalOffset++,
                sourceSubsystem: "cli:tx-flow",
                artifactId: receiptId
              })
            );
          }

          flowResult.steps.send = { status: "ok", artifact: sendResult };
          flowResult.result = "broadcast";
          // F3: the send step ran, but a submission the node rejected is a failed flow (`tx send` reports it as
          // "rejected" from the send artifact itself)
          if (sendResult.accepted === false) flowResult.ok = false;
        }
      }
    } else {
      flowResult.steps.sign = {
        status: "skipped",
        reason: "re-run with --sign to create a signed artifact"
      };
      flowResult.steps.send = {
        status: "skipped",
        reason: "re-run with --send --yes to broadcast"
      };
    }
  } catch (error) {
    flowResult.ok = false;
    // EVENT-LEDGER-2 final closeout (A1): the error is reported on the step it belongs to (its announcements included),
    // with its typed code, what the flow had already sent or executed, and what that step had produced — never as a
    // generic step error that reads as "nothing was sent"
    const done = sendResult ? sendEffectOf(sendResult) : undefined;
    // nothing was sent while the send step had not started; inside it, only the effect the SDK named is reported
    const beforeTheSend = shouldSend && current !== "send";
    let failure: unknown = error;
    if (isEventLedgerAppendFailure(error) && (done || beforeTheSend)) {
      try {
        rethrowWithLedgerEffect(error, done ?? notPerformed());
      } catch (named) {
        failure = named;
      }
    }
    const msg = failure instanceof Error ? failure.message : String(failure);
    const code = typeof (failure as any)?.code === "string" ? ((failure as any).code as string) : undefined;
    const effect: LedgerFailureEffect | undefined = (failure as any)?.metadata?.effect ?? done;
    const entry = { status: "error" as const, error: msg, ...(code ? { code } : {}), ...(effect ? { effect } : {}) };
    const kept = <T>(step: TxFlowStepResult<T>) => ({
      ...(step.artifact ? { artifact: step.artifact } : {}),
      ...(step.artifactPath ? { artifactPath: step.artifactPath } : {})
    });
    if (current === "plan") flowResult.steps.plan = { ...kept(flowResult.steps.plan), ...entry };
    else if (current === "sign") flowResult.steps.sign = { ...kept(flowResult.steps.sign), ...entry };
    else flowResult.steps.send = { ...(sendResult ? { artifact: sendResult } : {}), ...entry };
  }

  return flowResult;
}

async function saveArtifact(
  sdk: any,
  artifact: any,
  outDir: string,
  baseName: string | undefined,
  suffix: string,
  from: string,
  to: string,
  amount: string
): Promise<string> {
  if (!fs.existsSync(outDir)) {
    await ensureDirRespectingStore(outDir);
  }

  let fileName = "";
  if (baseName) {
    fileName = `${baseName}.${suffix}.json`;
  } else {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sanitizedFrom = from.replace(/[^a-z0-9]/gi, "_").substring(0, 10);
    const sanitizedTo = to.replace(/[^a-z0-9]/gi, "_").substring(0, 10);
    const idPart =
      artifact.planId ||
      artifact.signedId ||
      artifact.txId ||
      artifact.contentHash ||
      "unknown";
    fileName = `${timestamp}-${sanitizedFrom}-to-${sanitizedTo}-${amount}-${idPart}.${suffix}.json`;
  }

  const fullPath = path.join(outDir, fileName);
  if (sdk && sdk.artifacts && typeof sdk.artifacts.write === "function") {
    const canonicalRes = await sdk.artifacts.write(artifact);
    if (outDir !== sdk.workspace.artifactsDir || baseName) {
      // EVIDENCE-TRUST-1 (D2): the exported copy is exactly the stored one (an identity published before is kept)
      await sdk.artifacts.write(canonicalRes.artifact ?? artifact, { outputDir: outDir, fileName });
      return path.join(outDir, fileName);
    }
    return canonicalRes.absolutePath;
  } else {
    // Fallback: write artifact directly without SDK (through the store's gate when the path is in the store)
    const data = JSON.stringify(artifact, null, 2);
    await writeFileRespectingStore(fullPath, data, () => fs.writeFileSync(fullPath, data, "utf-8"));
  }
  return fullPath;
}
