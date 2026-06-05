import { runTxPlan } from "./tx-plan-runner.js";
import { runTxSign } from "./tx-sign-runner.js";
import { runTxSend, TxSendRunnerResult } from "./tx-send-runner.js";
import {
  TxPlanArtifact,
  SignedTxArtifact,
  writeArtifact,
  calculateContentHash,
  HARDKAS_VERSION
} from "@hardkas/artifacts";
import { HardkasConfig } from "@hardkas/config";
import {
  coreEvents,
  createEventEnvelope,
  asEventSequence,
  asArtifactId,
  asWorkflowId,
  asCorrelationId,
  asNetworkId,
  asTxId
} from "@hardkas/core";
import crypto from "node:crypto";
import path from "path";
import fs from "fs";

export interface TxFlowInput {
  from: string;
  to: string;
  amount: string;
  network?: string;
  config: HardkasConfig;
  url?: string;
  feeRate: string;
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

  const { Hardkas } = await import("@hardkas/sdk");
  let sdk: any = null;
  let actualOutDir: string;
  try {
    sdk = await Hardkas.open({ cwd: workspaceRoot || process.cwd() });
    actualOutDir = outDir || sdk.workspace.artifactsDir;
  } catch {
    // SDK not available (e.g. standalone CLI install) — use default artifacts dir
    const cwd = workspaceRoot || process.cwd();
    actualOutDir = outDir || path.join(cwd, ".hardkas", "artifacts");
  }
  if (!fs.existsSync(actualOutDir)) {
    fs.mkdirSync(actualOutDir, { recursive: true });
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

  const intentPayload = {
    type: "hardkas.workflow.intent",
    schemaVersion: "v1",
    workflowSpec: [
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
      network: network || config.defaultNetwork || "simnet"
    },
    runtimeVersion: HARDKAS_VERSION,
    workspaceSchemaVersion: "hardkas.workflow.v1"
  };

  const intentHash = calculateContentHash(intentPayload);
  const workflowId = asWorkflowId(`wf_${intentHash.slice(0, 16)}`);
  let globalOffset = 0;

  const netId = asNetworkId(network || config.defaultNetwork || "simnet");

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

  const flowResult: TxFlowResult = {
    ok: true,
    networkId: network || config.defaultNetwork || "simnet",
    mode: "unknown",
    steps: {
      plan: { status: "skipped" },
      sign: { status: "skipped" },
      send: { status: "skipped" }
    },
    result: "planned-only"
  };

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
      // Security guard: require --yes for real signing if we are in a flow that intended to --send
      if (shouldSend && !yes && planArtifact.mode !== "simulated") {
        flowResult.steps.sign = {
          status: "blocked",
          reason: "--yes is required before signing/sending a real transaction flow."
        };
        flowResult.steps.send = { status: "blocked", reason: "sign blocked" };
        flowResult.result = "planned-only";
        flowResult.ok = false;
        return flowResult;
      }

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
          const sendResult = await runTxSend({
            signedArtifact,
            config,
            ...(url ? { url } : {}),
            ...(workspaceRoot ? { workspaceRoot } : {})
          });

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

            const receiptId = asArtifactId(sendResult.receipt.txId);
            const receiptNetId = asNetworkId(sendResult.receipt.networkId);

            const statusMap: Record<string, "accepted" | "finalized" | "failed"> = {
              pending: "accepted",
              submitted: "accepted",
              accepted: "accepted",
              confirmed: "finalized",
              failed: "failed"
            };

            coreEvents.emit(
              createEventEnvelope({
                kind: "workflow.receipt",
                domain: "workflow",
                workflowId,
                correlationId: asCorrelationId(workflowId),
                networkId: receiptNetId,
                payload: {
                  txId: asTxId(sendResult.receipt.txId),
                  status: statusMap[sendResult.receipt.status] || "failed"
                },
                sequenceNumber: asEventSequence(6),
                globalOffset: globalOffset++,
                sourceSubsystem: "cli:tx-flow",
                artifactId: receiptId
              })
            );

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
    const msg = error instanceof Error ? error.message : String(error);
    // Find where it failed
    if (flowResult.steps.plan.status !== "ok") {
      flowResult.steps.plan = { status: "error", error: msg };
    } else if (shouldSign && flowResult.steps.sign.status !== "ok") {
      flowResult.steps.sign = { status: "error", error: msg };
    } else if (shouldSend && flowResult.steps.send.status !== "ok") {
      flowResult.steps.send = { status: "error", error: msg };
    }
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
    fs.mkdirSync(outDir, { recursive: true });
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
    await sdk.artifacts.write(artifact, { outputDir: outDir, fileName });
  } else {
    // Fallback: write artifact directly without SDK
    fs.writeFileSync(fullPath, JSON.stringify(artifact, null, 2), "utf-8");
  }
  return fullPath;
}
