import { runDevTxSend } from "../runners/dev-tx-runners.js";
import { runReplayVerify } from "../runners/replay-verify-runner.js";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { UI } from "../ui.js";

export default async function runReplayFailureRecipe(sandboxRoot: string) {
  UI.info("Generating canonical workflow artifacts...");
  
  await runDevTxSend({
    from: "alice",
    to: "bob",
    amount: "1",
    workspaceRoot: sandboxRoot,
    quiet: true
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  const artifactsDir = path.join(sandboxRoot, ".hardkas", "artifacts");
  if (!fs.existsSync(artifactsDir)) return;
  
  const files = fs.readdirSync(artifactsDir).sort();
  const signedFile = files.find(f => f.startsWith("signed_"));
  const receiptFile = files.find(f => f.startsWith("receipt_"));
  
  if (signedFile) {
    UI.info("Tampering with signed artifact to simulate deterministic divergence...");
    const signedPath = path.join(artifactsDir, signedFile);
    const data = JSON.parse(fs.readFileSync(signedPath, "utf-8"));
    
    // Mutate deterministic field (networkId) to break signature/replay integrity
    data.networkId = "mainnet"; 
    
    fs.writeFileSync(signedPath, JSON.stringify(data, null, 2));
    
    await new Promise(r => setTimeout(r, 1000)); // wait for watcher to pick up the change
  }

  console.log(pc.yellow(pc.bold("\nRecipe completed: replay-failure\n")));
  
  try {
    await runReplayVerify({ path: ".", workspaceRoot: sandboxRoot });
  } catch (e) {
    console.log(`\n${pc.red("Replay diverged or could not be verified.")}`);
    console.log(`${pc.blue("Artifacts remain canonical local truth.")}`);
    console.log(`Inspect lineage and replay details for diagnosis.\n`);
  }

  console.log(pc.bold(`Next:`));
  if (receiptFile) {
    const txId = receiptFile.replace("receipt_", "").replace(".json", "");
    console.log(`hardkas why ${txId} --workspace ${sandboxRoot}`);
    console.log(`hardkas replay verify . --workspace ${sandboxRoot}`);
    console.log(`hardkas artifact inspect ${txId} --workspace ${sandboxRoot}`);
  }
}
