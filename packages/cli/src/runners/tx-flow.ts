import { 
  runTxPlan 
} from "./tx-plan-runner.js";
import { 
  runTxSign 
} from "./tx-sign-runner.js";
import { 
  runTxSend, 
  TxSendRunnerResult 
} from "./tx-send-runner.js";
import { 
  TxPlanArtifact, 
  SignedTxArtifact, 
  writeArtifact 
} from "@hardkas/artifacts";
import { HardkasConfig } from "@hardkas/config";
import { coreEvents, createEventEnvelope } from "@hardkas/core";
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
    from, to, amount, network, config, url, feeRate,
    planOnly, sign, send, yes,
    outDir, name,
    allowMainnetSigning,
    workspaceRoot
  } = input;

  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.open({ cwd: workspaceRoot || process.cwd() });
  const actualOutDir = outDir || sdk.workspace.artifactsDir;
  if (!fs.existsSync(actualOutDir)) {
    fs.mkdirSync(actualOutDir, { recursive: true });
  }

  // Validation
  if (planOnly && (sign || send)) {
    throw new Error("--plan-only cannot be combined with --sign or --send.");
  }

  const shouldSign = sign || send;
  const shouldSend = send;

  const workflowId = crypto.randomUUID() as any;
  let globalOffset = 0;

  coreEvents.emit(createEventEnvelope({
    kind: "workflow.started",
    domain: "workflow",
    workflowId,
    correlationId: workflowId,
    networkId: (network || config.defaultNetwork || "simnet") as any,
    payload: { workflowId, network: (network || config.defaultNetwork || "simnet") as any },
    sequenceNumber: 1,
    globalOffset: globalOffset++,
    sourceSubsystem: "cli:tx-flow"
  }));

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
    const planArtifact = await runTxPlan({
      from, to, amount, 
      networkId: flowResult.networkId, 
      feeRate, config, 
      ...(url ? { url } : {})
    });
    
    flowResult.mode = planArtifact.mode;
    flowResult.networkId = planArtifact.networkId;
    flowResult.steps.plan = { status: "ok", artifact: planArtifact };

    coreEvents.emit(createEventEnvelope({
      kind: "workflow.plan.created",
      domain: "workflow",
      workflowId,
      correlationId: workflowId,
      networkId: planArtifact.networkId as any,
      payload: { planId: planArtifact.artifactId as any, network: planArtifact.networkId as any, amountSompi: BigInt(planArtifact.amountSompi) },
      sequenceNumber: 2,
      globalOffset: globalOffset++,
      sourceSubsystem: "cli:tx-flow",
      artifactId: planArtifact.artifactId as any
    }));

    if (actualOutDir) {
      const planPath = await saveArtifact(planArtifact, actualOutDir, name, "plan", from, to, amount);
      flowResult.steps.plan.artifactPath = planPath;

      coreEvents.emit(createEventEnvelope({
        kind: "artifact.written",
        domain: "workflow",
        workflowId,
        correlationId: workflowId,
        networkId: planArtifact.networkId as any,
        payload: { artifactId: planArtifact.artifactId as any, path: planPath },
        sequenceNumber: 3,
        globalOffset: globalOffset++,
        sourceSubsystem: "cli:tx-flow",
        artifactId: planArtifact.artifactId as any
      }));
    }

    if (planOnly) {
      flowResult.result = "planned-only";
      coreEvents.emit(createEventEnvelope({
        kind: "workflow.completed",
        domain: "workflow",
        workflowId,
        correlationId: workflowId,
        networkId: flowResult.networkId as any,
        payload: { workflowId },
        sequenceNumber: 8,
        globalOffset: globalOffset++,
        sourceSubsystem: "cli:tx-flow"
      }));
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
        ...(allowMainnetSigning !== undefined ? { allowMainnetSigning } : {})
      });

      flowResult.steps.sign = { status: "ok", artifact: signedArtifact };
      flowResult.result = "signed";

      coreEvents.emit(createEventEnvelope({
        kind: "workflow.signed",
        domain: "workflow",
        workflowId,
        correlationId: workflowId,
        networkId: signedArtifact.networkId as any,
        payload: { signedId: signedArtifact.artifactId as any, planId: planArtifact.artifactId as any },
        sequenceNumber: 4,
        globalOffset: globalOffset++,
        sourceSubsystem: "cli:tx-flow",
        artifactId: signedArtifact.artifactId as any
      }));

      if (actualOutDir) {
        const signedPath = await saveArtifact(signedArtifact, actualOutDir, name, "signed", from, to, amount);
        flowResult.steps.sign.artifactPath = signedPath;
        
        coreEvents.emit(createEventEnvelope({
          kind: "artifact.written",
          domain: "workflow",
          workflowId,
          correlationId: workflowId,
          networkId: signedArtifact.networkId as any,
          payload: { artifactId: signedArtifact.artifactId as any, path: signedPath },
          sequenceNumber: 5,
          globalOffset: globalOffset++,
          sourceSubsystem: "cli:tx-flow",
          artifactId: signedArtifact.artifactId as any
        }));
      }

      // 3. Send
      if (shouldSend) {
        if (!yes) {
          flowResult.steps.send = { status: "blocked", reason: "--yes is required to broadcast" };
          flowResult.result = "signed";
          flowResult.ok = false;
        } else {
          const sendResult = await runTxSend({
            signedArtifact,
            config,
            ...(url ? { url } : {})
          });
          
          if (actualOutDir && sendResult.receipt) {
            const receiptPath = await saveArtifact(sendResult.receipt, actualOutDir, name, "receipt", from, to, amount);
            sendResult.receiptPath = receiptPath;

            coreEvents.emit(createEventEnvelope({
              kind: "workflow.receipt",
              domain: "workflow",
              workflowId,
              correlationId: workflowId,
              networkId: sendResult.receipt.networkId as any,
              payload: { txId: sendResult.receipt.txId as any, status: sendResult.receipt.status as any },
              sequenceNumber: 6,
              globalOffset: globalOffset++,
              sourceSubsystem: "cli:tx-flow",
              artifactId: sendResult.receipt.artifactId as any
            }));
            
            coreEvents.emit(createEventEnvelope({
              kind: "artifact.written",
              domain: "workflow",
              workflowId,
              correlationId: workflowId,
              networkId: sendResult.receipt.networkId as any,
              payload: { artifactId: sendResult.receipt.artifactId as any, path: receiptPath },
              sequenceNumber: 7,
              globalOffset: globalOffset++,
              sourceSubsystem: "cli:tx-flow",
              artifactId: sendResult.receipt.artifactId as any
            }));
          }
          
          flowResult.steps.send = { status: "ok", artifact: sendResult };
          flowResult.result = "broadcast";
        }
      }
    } else {
       flowResult.steps.sign = { status: "skipped", reason: "re-run with --sign to create a signed artifact" };
       flowResult.steps.send = { status: "skipped", reason: "re-run with --send --yes to broadcast" };
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
    fileName = `${timestamp}-${sanitizedFrom}-to-${sanitizedTo}-${amount}.${suffix}.json`;
  }

  const fullPath = path.join(outDir, fileName);
  await writeArtifact(fullPath, artifact);
  return fullPath;
}
