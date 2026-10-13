import { UI } from "../ui.js";
import { runTxFlow } from "./tx-flow.js";
import { loadHardkasConfig } from "@hardkas/config";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

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

  const flowInput: any = {
    ...options,
    amount: options.amount,
    from: options.from,
    to: options.to,
    send: true,
    feeRate: "1",
    config: loaded.config
  };
  if (options.workspaceRoot) flowInput.workspaceRoot = options.workspaceRoot;

  const result = await runTxFlow(flowInput);

  // CLI-CONTRACT-2A: "submitted" is said only when the send step ran and produced a receipt. The flow refuses to
  // broadcast without consent ("--yes is required to broadcast") and this command passes none, so until that is decided
  // (DEV-TX-SEND-NETWORK-1) the truthful answer is a typed failure: nothing was sent, whatever was planned or signed.
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
    console.log(`\nTransaction submitted.`);
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
