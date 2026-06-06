import { Hardkas } from "@hardkas/sdk";
import { formatSompi } from "@hardkas/core";

async function run() {
  console.log("=== Starting Real Node Full Lifecycle ===");
  const sdk = await Hardkas.create({
    cwd: process.cwd(),
    network: "simnet",
    autoBootstrap: true,
  });

  const alice = await sdk.accounts.resolve("alice");
  const bob = await sdk.accounts.resolve("bob");
  if (!alice || !bob) throw new Error("Missing alice or bob dev accounts");

  console.log(`Alice: ${alice.address}`);
  console.log(`Bob: ${bob.address}`);

  // 1. Sync
  console.log("\n[1] Syncing node state...");
  console.log("sdk.query keys:", Object.keys(sdk.query), sdk.query.sync ? "has sync" : "no sync");
  console.log("sdk.query proto keys:", Object.getOwnPropertyNames(Object.getPrototypeOf(sdk.query)));
  await sdk.query.sync();
  let aliceBal = await sdk.accounts.balance("alice");
  console.log(`Alice initial balance: ${aliceBal.formatted}`);

  // 2. Dirty Alice (create 5 small UTXOs if she has enough balance)
  console.log("\n[2] Dirtying Alice (creating dust UTXOs)...");
  if (aliceBal.sompi > 5000n) {
    for (let i = 0; i < 5; i++) {
      const p = await sdk.tx.plan({ from: "alice", to: "alice", amount: "1000" });
      const s = await sdk.tx.sign(p, "alice");
      await sdk.tx.send(s);
    }
    console.log("Waiting for dust transactions to settle...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    await sdk.query.sync();
  }

  const utxos = await sdk.query.findUtxosByAddress(alice.address);
  console.log(`Alice UTXOs count: ${utxos.length}`);

  // 3. Consolidate
  if (utxos.length > 1) {
    console.log("\n[3] Consolidating Alice...");
    const { execSync } = await import("child_process");
    // Run CLI consolidate directly using current tsx / pnpm workspace
    execSync(`npx @hardkas/cli accounts consolidate alice --target-utxos 1 --yes`, { stdio: "inherit" });
    
    console.log("Waiting for consolidation to settle...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    await sdk.query.sync();
    
    const newUtxos = await sdk.query.findUtxosByAddress(alice.address);
    console.log(`Alice UTXOs after consolidation: ${newUtxos.length}`);
  } else {
    console.log("\n[3] Skipping consolidation, Alice already has 1 UTXO.");
  }

  // 4. Plan
  console.log("\n[4] Planning Tx Alice -> Bob");
  const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "500" });
  console.log(`Plan ID: ${plan.planId}`);

  // 5. Sign
  console.log("\n[5] Signing Tx...");
  const signed = await sdk.tx.sign(plan, "alice");
  console.log(`Signed ID: ${signed.signedId}`);

  // 6. Send
  console.log("\n[6] Sending Tx to Real Node...");
  const receipt = await sdk.tx.send(signed);
  console.log(`Sent! TxId: ${receipt.txId}`);

  // 7. Wait & Receipt
  console.log("\n[7] Waiting for Network Acceptance...");
  await new Promise(resolve => setTimeout(resolve, 1500));
  await sdk.query.sync();
  
  const status = await sdk.query.getTransactionStatus(receipt.txId);
  console.log(`Status: ${status}`);

  // 8. Replay Verify
  console.log("\n[8] Replay Verify...");
  // Re-fetch the receipt artifact from storage to ensure we verify the persisted one
  const persistedReceipt = await sdk.artifacts.read(receipt.receiptId);
  const verifyResult = await sdk.tx.verify(persistedReceipt);
  console.log(`Replay verify OK? ${verifyResult.ok}`);
  if (!verifyResult.ok) {
      console.log(`Verification failed:`, verifyResult.mismatches);
  }

  console.log("\n=== FULL LIFECYCLE COMPLETE ===");
}

run().catch(console.error);
