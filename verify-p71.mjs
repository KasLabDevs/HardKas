import { Hardkas } from "./packages/sdk/dist/index.js";
import { resetLocalnetState } from "./packages/localnet/dist/index.js";
import { WalletToolkit } from "./packages/toolkit/dist/index.js";

async function main() {
  console.log("=== P71 Verification App ===");
  const cwd = process.cwd();

  // Reset localnet to have deterministic initial balance for "alice"
  await resetLocalnetState({ cwd, initialBalanceSompi: 100_000_000_000n });

  // Open the SDK against the simulated environment
  const hardkas = await Hardkas.open({ cwd, network: "simulated", autoBootstrap: true });

  console.log("\n[1] fees.estimate");
  const fee = await hardkas.fees.estimate({ priority: "normal" });
  console.log("Fee estimation:", fee);

  console.log("\n[2] wallet.watch");
  // Open the WalletToolkit for Alice
  const wallet = WalletToolkit.open("alice", { rpc: hardkas.rpc });
  try { await wallet.create(); } catch (e) {} // Ensure wallet exists
  
  const sub = await wallet.watch("transaction", (evt) => {
    console.log("Watch Event Received:", evt);
  });
  console.log("Watch subscription successful:", !!sub);

  console.log("\n[3] tx.send & tx.waitForConfirmation");
  const plan = await hardkas.tx.plan({
    from: "alice",
    to: "bob",
    amount: "10"
  });

  const signed = await hardkas.tx.sign(plan, "alice");
  
  console.log("Sending transaction...");
  const simResult = await hardkas.tx.simulate(signed);
  const receiptTxId = simResult.receipt ? simResult.receipt.txId : simResult; 
  console.log("Receipt TXID:", receiptTxId);

  console.log("\nWaiting for confirmation...");
  const confResult = await hardkas.tx.waitForConfirmation(receiptTxId, { maxAttempts: 5, pollIntervalMs: 500 });
  console.log("Confirmation Result:", confResult);

  console.log("\n[4] wallet.history");
  // Wait a bit to ensure async indexer caught up
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const history = await wallet.history();
  const entriesCount = Array.isArray(history) ? history.length : history?.entries?.length ?? 0;
  console.log("History entries count:", entriesCount);

  // Clean up watch
  if (sub && sub.unwatch) {
    await sub.unwatch();
  } else if (sub && sub.unsubscribe) {
    await sub.unsubscribe();
  }
}

main().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
