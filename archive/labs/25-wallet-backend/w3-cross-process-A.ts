import { Hardkas } from "@hardkas/sdk";
import fs from "fs";

async function main() {
  const hk = await Hardkas.create({
    network: "simnet",
    autoBootstrap: true,
    policy: { allowPublic: true },
    rpc: { url: "ws://127.0.0.1:18210" }
  });

  const alice = await hk.accounts.resolve("alice");
  const bob = await hk.accounts.resolve("bob");

  // Read the shared UTXO outpoint from a file to ensure both processes target the same funded bob
  const outpoint = fs.readFileSync("cross-process-utxo.txt", "utf-8").trim();
  console.log(`[Process A] Targeting UTXO: ${outpoint}`);

  console.log(`[Process A] Planning 2 KAS to Alice...`);
  const intentA = await hk.tx.plan({ from: bob, amount: "2 KAS", to: alice });
  
  const selectedA = intentA.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
  console.log(`[Process A] Selected outpoints:`, selectedA);

  console.log(`[Process A] Signing...`);
  const signedA = await hk.tx.sign(intentA, bob);

  console.log(`[Process A] Waiting for sync signal to send concurrently...`);
  // Wait for signal file
  while (!fs.existsSync("cross-process-sync.txt")) {
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`[Process A] Submitting to REAL node...`);
  try {
    const result = await hk.tx.send(signedA);
    console.log(`[Process A] ACCEPTED! Receipt: ${result.txId}`);
  } catch (e: any) {
    console.log(`[Process A] REJECTED! Error: ${e.message}`);
  }

  await hk.rpc.close();
}

main();
