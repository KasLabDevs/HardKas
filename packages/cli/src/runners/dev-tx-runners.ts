import { UI } from "../ui.js";
import { runTxFlow } from "./tx-flow.js";
import { loadHardkasConfig } from "@hardkas/config";

export async function runDevTxSend(options: {
  from?: string;
  to?: string;
  amount?: string;
  workspaceRoot?: string;
  quiet?: boolean;
}) {
  const loaded = await loadHardkasConfig(
    options.workspaceRoot ? { cwd: options.workspaceRoot } : {}
  );
  const network = "simnet"; // force simnet for dev tx send

  if (!options.from || !options.to || !options.amount) {
    UI.error(
      "Missing required arguments. Usage: hardkas dev tx send --from <alias> --to <address> --amount <kas>"
    );
    return;
  }

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

  const sendResult = result.steps.send;
  const artifactId =
    sendResult?.artifact?.receipt?.lineage?.artifactId ||
    sendResult?.artifact?.txId ||
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
