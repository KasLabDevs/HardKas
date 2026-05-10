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
    allowMainnetSigning
  } = input;

  // Validation
  if (planOnly && (sign || send)) {
    throw new Error("--plan-only cannot be combined with --sign or --send.");
  }

  const shouldSign = sign || send;
  const shouldSend = send;

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

    if (outDir) {
      const planPath = await saveArtifact(planArtifact, outDir, name, "plan", from, to, amount);
      flowResult.steps.plan.artifactPath = planPath;
    }

    if (planOnly) {
      flowResult.result = "planned-only";
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

      if (outDir) {
        const signedPath = await saveArtifact(signedArtifact, outDir, name, "signed", from, to, amount);
        flowResult.steps.sign.artifactPath = signedPath;
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
