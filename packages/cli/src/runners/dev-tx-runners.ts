import { UI } from "../ui.js";
import { runTxFlow } from "./tx-flow.js";
import { loadHardkasConfig } from "@hardkas/config";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import type { HardkasConfig } from "@hardkas/config";

/**
 * ESCALÓN 3 · P3: where `dev tx send` runs — the workspace's resolved target, local when it is the simulated ledger or
 * a local simnet (the networks `tx send` sends to without confirmation). `status` suggests the command only then.
 */
export async function devTxSendTarget(config: HardkasConfig): Promise<{ local: boolean; networkId: string }> {
  const { resolveWorkspaceExecution } = await import("@hardkas/config");
  const resolved = resolveWorkspaceExecution({ config });
  const local = resolved.execution.mode === "simulator" || resolved.networkId === "simulated" || resolved.networkId === "simnet";
  return { local, networkId: resolved.networkId };
}

export async function runDevTxSend(options: {
  from?: string;
  to?: string;
  amount?: string;
  workspaceRoot?: string;
  quiet?: boolean;
}) {
  // CLI-CONTRACT-2A: a usage error is a typed failure of the run (it used to be a red line followed by exit 0).
  if (!options.from || !options.to || !options.amount) {
    throw new HardkasCliError(
      "TX_SEND_USAGE",
      "Missing required arguments. Usage: hardkas dev tx send --from <alias> --to <address> --amount <kas>",
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }

  const loaded = await loadHardkasConfig(
    options.workspaceRoot ? { cwd: options.workspaceRoot } : {}
  );

  // ESCALÓN 3 · P3: the command never sent anything. It ran the `tx send` flow without the consent that flow requires
  // ("--yes is required to broadcast"), so every run ended in TX_SEND_NOT_EXECUTED. It now applies the confirmation
  // policy of `tx send`: the simulated ledger and a local simnet need no confirmation, and the flow runs with it. Any
  // other network needs the explicit confirmation of `hardkas tx send … --yes`, which this quick command does not take:
  // it refuses before anything is planned (DEV-TX-SEND-NETWORK-1).
  const target = await devTxSendTarget(loaded.config);
  if (!target.local) {
    throw new HardkasCliError(
      "DEV_TX_SEND_NETWORK_NOT_LOCAL",
      `'dev tx send' runs only on the simulated ledger or a local simnet; this workspace targets ${target.networkId}. Nothing was planned, signed or sent.`,
      {
        exitCode: HardkasExitCode.POLICY_DENIED,
        suggestion: `hardkas tx send --from ${options.from} --to ${options.to} --amount ${options.amount} --yes`,
        context: { network: target.networkId }
      }
    );
  }

  const flowInput: any = {
    ...options,
    amount: options.amount,
    from: options.from,
    to: options.to,
    send: true,
    yes: true, // the confirmation policy of `tx send`: none is required on the simulated ledger or a local simnet
    feeRate: "1",
    config: loaded.config
  };
  if (options.workspaceRoot) flowInput.workspaceRoot = options.workspaceRoot;

  const result = await runTxFlow(flowInput);

  // CLI-CONTRACT-2A: "submitted" is said only when the send step ran and produced a receipt; a flow whose send step did
  // not run is a typed failure: nothing was sent, whatever was planned or signed.
  const sendStep = result.steps.send;
  const erroredStep = (["plan", "sign", "send"] as const).find((k) => result.steps[k]?.status === "error");
  if (result.result !== "broadcast" || sendStep?.status !== "ok") {
    const reason = erroredStep
      ? `${erroredStep} step failed: ${result.steps[erroredStep].error ?? "no error message"}`
      : (sendStep?.reason ?? sendStep?.error ?? "the send step did not run");
    const code = erroredStep && result.steps[erroredStep].code ? result.steps[erroredStep].code! : "TX_SEND_NOT_EXECUTED";
    throw new HardkasCliError(
      code,
      `'dev tx send' did not broadcast (${reason}). Nothing was sent.`,
      { exitCode: HardkasExitCode.RUNTIME_FAILURE }
    );
  }
  if (!result.ok) {
    throw new HardkasCliError(
      "TX_SEND_FAILED",
      `'dev tx send' failed after the send step ran: ${sendStep.error ?? "no error message"}`,
      { exitCode: HardkasExitCode.RUNTIME_FAILURE }
    );
  }

  const sendResult = sendStep;
  // as `tx send`: a send the node (or the simulated ledger) did not accept is a failure, never "submitted"
  if (sendResult.artifact && sendResult.artifact.accepted === false) {
    const { notAcceptedFailure } = await import("./next-steps.js");
    const failure = notAcceptedFailure(sendResult.artifact.receipt, sendResult.artifact.txId);
    throw new HardkasCliError(failure.code, failure.message, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  }
  const simulated = result.mode === "simulator";
  // IC-5′.11: the canonical identity of the receipt; never the txId.
  const artifactId =
    sendResult?.artifact?.receipt?.contentHash ||
    sendResult?.artifact?.receipt?.lineage?.artifactId ||
    "unknown";

  const planId =
    (result.steps.plan as any)?.artifact?.planId ||
    (result.steps.plan as any)?.artifact?.artifactId ||
    (result.steps.plan as any)?.artifact?.txId ||
    "unknown";
  const signId =
    (result.steps.sign as any)?.artifact?.signedId ||
    (result.steps.sign as any)?.artifact?.artifactId ||
    (result.steps.sign as any)?.artifact?.txId ||
    "unknown";

  if (!options.quiet) {
    console.log(
      simulated
        ? `\nTransaction executed on the simulated ledger (local simulated execution; nothing was broadcast).`
        : `\nTransaction submitted to the node.`
    );
    console.log(`\nArtifacts:`);
    console.log(`  plan_${planId.substring(0, 8)}...`);
    console.log(`  signed_${signId.substring(0, 8)}...`);
    if (sendResult?.artifact?.txId) {
      console.log(`  receipt_${sendResult.artifact.txId.substring(0, 8)}...`);
    }

    const wsSuffix = options.workspaceRoot ? ` --workspace ${options.workspaceRoot}` : "";

    UI.printNextSteps([
      `hardkas why ${artifactId}${wsSuffix}`,
      `hardkas dev last --replay${wsSuffix}`,
      `hardkas status${wsSuffix}`
    ]);
  }
}
