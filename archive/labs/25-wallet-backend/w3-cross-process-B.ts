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

  const outpoint = fs.readFileSync("cross-process-utxo.txt", "utf-8").trim();
  console.log(`[Process B] Targeting UTXO: ${outpoint}`);

  console.log(`[Process B] Planning 3 KAS to Alice...`);
  const intentB = await hk.tx.plan({ from: bob, amount: "3 KAS", to: alice });
  
  const selectedB = intentB.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
  console.log(`[Process B] Selected outpoints:`, selectedB);

  console.log(`[Process B] Signing...`);
  const signedB = await hk.tx.sign(intentB, bob);

  console.log(`[Process B] Waiting for sync signal to send concurrently...`);
  while (!fs.existsSync("cross-process-sync.txt")) {
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`[Process B] Submitting to REAL node...`);
  try {
    const result = await hk.tx.send(signedB);
    console.log(`[Process B] ACCEPTED! Receipt: ${result.txId}`);
  } catch (e: any) {
    console.log(`[Process B] REJECTED! Error: ${e.message}`);
  }

  await hk.rpc.close();
}

main();
