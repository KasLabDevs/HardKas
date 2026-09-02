import { Hardkas } from "@hardkas/sdk";
import fs from "fs";
import { spawn } from "child_process";

async function main() {
  console.log("=== Phase 9: Cross-Process Concurrency Orchestrator ===");

  if (fs.existsSync("cross-process-utxo.txt")) fs.unlinkSync("cross-process-utxo.txt");
  if (fs.existsSync("cross-process-sync.txt")) fs.unlinkSync("cross-process-sync.txt");

  const hk = await Hardkas.create({
    network: "simnet",
    autoBootstrap: true,
    policy: { allowPublic: true },
    rpc: { url: "ws://127.0.0.1:18210" }
  });

  const alice = await hk.accounts.resolve("alice");
  const bob = await hk.accounts.resolve("bob");

  console.log(`[Orchestrator] Connected to Node. DAA: ${(await hk.rpc.getBlockDagInfo()).virtualDaaScore}`);
  console.log(`[Orchestrator] Funding bob with exactly 1 UTXO (5 KAS)...`);
  
  const fundIntent = await hk.tx.plan({ from: alice, amount: "5 KAS", to: bob });
  const fundSigned = await hk.tx.sign(fundIntent, alice);
  const fundResult = await hk.tx.send(fundSigned);
  
  console.log(`[Orchestrator] Waiting 5 seconds for Bob to receive UTXO...`);
  await new Promise(r => setTimeout(r, 5000));
  fs.writeFileSync("cross-process-utxo.txt", "READY");

  await hk.rpc.close();

  console.log(`[Orchestrator] Spawning Process A and B...`);
  const procA = spawn("npx.cmd", ["tsx", "w3-cross-process-A.ts"], { stdio: "inherit", shell: true });
  const procB = spawn("npx.cmd", ["tsx", "w3-cross-process-B.ts"], { stdio: "inherit", shell: true });

  console.log(`[Orchestrator] Waiting 5 seconds for them to plan and sign...`);
  await new Promise(r => setTimeout(r, 5000));

  console.log(`[Orchestrator] SENDING SYNC SIGNAL NOW!`);
  fs.writeFileSync("cross-process-sync.txt", "GO");

  await new Promise(r => {
    let done = 0;
    procA.on("close", () => { done++; if(done === 2) r(null); });
    procB.on("close", () => { done++; if(done === 2) r(null); });
  });

  console.log(`[Orchestrator] Both processes finished. Cleaning up...`);
  fs.unlinkSync("cross-process-utxo.txt");
  fs.unlinkSync("cross-process-sync.txt");
  console.log(`[Orchestrator] Done.`);
}

main();
