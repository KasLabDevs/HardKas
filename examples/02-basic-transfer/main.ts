import { Hardkas, formatSompi } from "@hardkas/sdk";

async function main() {
  console.log("\x1b[35m╔══════════════════════════════╗\x1b[0m");
  console.log("\x1b[35m║         \x1b[1mHardKAS\x1b[0m\x1b[35m              ║\x1b[0m");
  console.log("\x1b[35m║      \x1b[3mBasic Transfer\x1b[0m\x1b[35m          ║\x1b[0m");
  console.log("\x1b[35m╚══════════════════════════════╝\x1b[0m");
  console.log("");

  try {
    const hardkas = await Hardkas.create();
    
    // Resolve identities
    const alice = await hardkas.accounts.resolve("alice");
    const bob = await hardkas.accounts.resolve("bob");

    console.log("\x1b[1mProfiles:\x1b[0m");
    console.log(`  Sender:    \x1b[36m${alice.name}\x1b[0m (${alice.address})`);
    console.log(`  Recipient: \x1b[36m${bob.name}\x1b[0m (${bob.address})`);
    console.log("");

    const aliceBalance = await hardkas.accounts.getBalance("alice");
    console.log(`\x1b[1mAlice Balance:\x1b[0m ${aliceBalance.formatted}`);
    console.log("");

    // [1/4] Planning
    console.log("\x1b[1m[1/4] Planning:\x1b[0m 10 KAS -> Bob");
    const plan = await hardkas.tx.plan({
      from: alice,
      to: bob,
      amount: "10 KAS"
    });
    console.log(`  \x1b[32m✔\x1b[0m Plan built (ID: ${plan.planId})`);
    console.log(`  Fee: ${plan.estimatedFeeSompi} sompi | Mass: ${plan.estimatedMass}`);
    console.log("");

    // [2/4] Signing
    console.log("\x1b[1m[2/4] Signing...\x1b[0m");
    const signed = await hardkas.tx.sign(plan, alice);
    console.log(`  \x1b[32m✔\x1b[0m Signed with Alice`);
    console.log("");

    // [3/4] Sending
    console.log("\x1b[1m[3/4] Sending...\x1b[0m");
    const receipt = await hardkas.tx.send(signed);
    console.log(`  \x1b[32m✔\x1b[0m Broadcast successful`);
    console.log(`  TxID: \x1b[36m${receipt.txId}\x1b[0m`);
    console.log("");

    // [4/4] Confirming
    console.log("\x1b[1m[4/4] Confirming...\x1b[0m");
    process.stdout.write("  [░░░░░░░░░░] 0% (Submitted)");
    
    // Poll for status
    const finalized = await hardkas.tx.confirm(receipt.txId, { timeout: 30000 });
    
    process.stdout.write("\r  [\x1b[32m██████████\x1b[0m] 100% (Accepted by DAG)\n");
    console.log("");

    console.log("\x1b[32m✓\x1b[0m \x1b[1mTransfer complete!\x1b[0m");
    console.log(`Receipt: \x1b[90m.hardkas/receipts/${receipt.txId.substring(0, 8)}...json\x1b[0m`);
    console.log("");

    const aliceNewBalance = await hardkas.accounts.getBalance("alice");
    console.log(`\x1b[1mAlice New Balance:\x1b[0m ${aliceNewBalance.formatted}`);

    await hardkas.rpc.close();
  } catch (error) {
    console.log("");
    console.error("\x1b[31m✖\x1b[0m \x1b[1mTransfer failed\x1b[0m");
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
