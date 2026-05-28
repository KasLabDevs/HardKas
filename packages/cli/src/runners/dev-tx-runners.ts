import { UI } from "../ui.js";
import { runTxFlow } from "./tx-flow.js";
import { loadHardkasConfig } from "@hardkas/config";

export async function runDevTxSend(options: { from?: string; to?: string; amount?: string }) {
  const loaded = await loadHardkasConfig();
  const network = "simnet"; // force simnet for dev tx send

  if (!options.from || !options.to || !options.amount) {
    UI.error("Missing required arguments. Usage: hardkas dev tx send --from <alias> --to <address> --amount <kas>");
    return;
  }

  const result = await runTxFlow({
    ...options,
    amount: options.amount,
    from: options.from,
    to: options.to,
    send: true,
    feeRate: "1",
    config: loaded.config
  });

  const sendResult = result.steps.send;
  const artifactId = sendResult?.artifact?.receipt?.lineage?.artifactId || sendResult?.artifact?.txId || "unknown";

  const planId = (result.steps.plan as any)?.artifact?.artifactId || (result.steps.plan as any)?.artifact?.txId || "unknown";
  const signId = (result.steps.sign as any)?.artifact?.artifactId || (result.steps.sign as any)?.artifact?.txId || "unknown";

  console.log(`\nTransaction submitted.`);
  console.log(`\nArtifacts:`);
  console.log(`  plan_${planId.substring(0,8)}...`);
  console.log(`  signed_${signId.substring(0,8)}...`);
  if (sendResult?.artifact?.txId) {
    console.log(`  receipt_${sendResult.artifact.txId.substring(0,8)}...`);
  }

  UI.printNextSteps([
    `hardkas why ${artifactId}`,
    "hardkas dev last --replay",
    "hardkas status"
  ]);
}
