import { runDevTxSend } from "../runners/dev-tx-runners.js";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";

export default async function runTransferRecipe(sandboxRoot: string) {
  // Execute a real transfer workflow: alice -> bob
  await runDevTxSend({
    from: "alice",
    to: "bob",
    amount: "1",
    workspaceRoot: sandboxRoot,
    quiet: true
  });
  
  // Output the minimum WOW message requested
  console.log(pc.green(pc.bold("\nRecipe completed: transfer")));

  // Wait a moment for the artifacts to fully write before reading
  await new Promise(r => setTimeout(r, 500));
  
  const artifactsDir = path.join(sandboxRoot, ".hardkas", "artifacts");
  if (!fs.existsSync(artifactsDir)) return;
  
  const files = fs.readdirSync(artifactsDir).sort();
  const plan = files.find(f => f.includes(".plan.json") || f.startsWith("txPlan_"));
  const signed = files.find(f => f.includes(".signed.json") || f.startsWith("signed_"));
  const receipt = files.find(f => f.includes("receipt_"));

  console.log(`\nArtifacts:`);
  if (plan) console.log(`Plan: ${plan}`);
  if (signed) console.log(`Signed: ${signed}`);
  if (receipt) console.log(`Receipt: ${receipt}`);

  console.log(pc.bold(`\nNext:`));
  console.log(`hardkas dev last --replay --workspace ${sandboxRoot}`);
  if (signed || receipt) {
    const target = receipt || signed;
    const txId = target!.replace("receipt_", "").replace(".json", "");
    console.log(`hardkas why ${txId} --workspace ${sandboxRoot}`);
  }
}
