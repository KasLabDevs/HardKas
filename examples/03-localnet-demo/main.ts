import { Hardkas } from "@hardkas/sdk";

async function main() {
  console.log("\x1b[35m╔══════════════════════════════╗\x1b[0m");
  console.log("\x1b[35m║         \x1b[1mHardKAS\x1b[0m\x1b[35m              ║\x1b[0m");
  console.log("\x1b[35m║      \x1b[3mLocalnet Demo\x1b[0m\x1b[35m           ║\x1b[0m");
  console.log("\x1b[35m╚══════════════════════════════╝\x1b[0m");
  console.log("");

  try {
    const hardkas = await Hardkas.create();
    
    UI_section("Environment Diagnostics");
    console.log(`\x1b[1mNetwork:\x1b[0m    ${hardkas.network}`);
    console.log(`\x1b[1mRPC Target:\x1b[0m ${(hardkas.rpc as any).rpcUrl}`);
    
    const info = await hardkas.rpc.getInfo();
    console.log(`\x1b[1mStatus:\x1b[0m     \x1b[32mconnected\x1b[0m`);
    console.log(`\x1b[1mDAA Score:\x1b[0m  ${info.virtualDaaScore}`);
    console.log("");

    UI_section("Account States");
    const alice = await hardkas.accounts.resolve("alice");
    const bob = await hardkas.accounts.resolve("bob");

    const aliceBalance = await hardkas.accounts.getBalance("alice");
    const bobBalance = await hardkas.accounts.getBalance("bob");

    console.log(`\x1b[1malice\x1b[0m: ${aliceBalance.formatted} (${alice.address})`);
    console.log(`\x1b[1mbob\x1b[0m:   ${bobBalance.formatted} (${bob.address})`);
    console.log("");

    UI_section("Automated Workflow");
    console.log("\x1b[1m[1/4] Planning:\x1b[0m 25 KAS -> bob");
    const plan = await hardkas.tx.plan({
      from: alice,
      to: bob,
      amount: "25 KAS"
    });
    console.log(`  \x1b[32m✔\x1b[0m Plan built`);

    console.log("\x1b[1m[2/4] Signing...\x1b[0m");
    const signed = await hardkas.tx.sign(plan, alice);
    console.log(`  \x1b[32m✔\x1b[0m Signed with local dev keys`);

    console.log("\x1b[1m[3/4] Sending...\x1b[0m");
    const receipt = await hardkas.tx.send(signed);
    console.log(`  \x1b[32m✔\x1b[0m Broadcast successful`);
    console.log(`  TxID: \x1b[36m${receipt.txId}\x1b[0m`);

    console.log("\x1b[1m[4/4] Confirming...\x1b[0m");
    process.stdout.write("  [░░░░░░░░░░] Polling DAG acceptance...");
    
    const finalized = await hardkas.tx.confirm(receipt.txId, { timeout: 30000 });
    process.stdout.write("\r  [\x1b[32m██████████\x1b[0m] 100% (Finalized)        \n");
    console.log("");

    UI_section("Summary");
    console.log("\x1b[32m✓\x1b[0m \x1b[1mLocalnet demo completed successfully.\x1b[0m");
    console.log(`\x1b[1mReceipt stored in:\x1b[0m .hardkas/receipts/${receipt.txId.substring(0, 8)}...json`);
    console.log("");

    console.log("\x1b[90mNext capability hints:\x1b[0m");
    console.log("\x1b[90m- [ ] Local Explorer will read from .hardkas/receipts\x1b[0m");
    console.log("\x1b[90m- [ ] Query Layer will aggregate this DAG state\x1b[0m");
    console.log("");

    await hardkas.rpc.close();
  } catch (error) {
    console.log("");
    console.error("\x1b[31m✖\x1b[0m \x1b[1mDemo failed\x1b[0m");
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

function UI_section(title: string) {
  console.log(`\x1b[35m# ${title}\x1b[0m`);
  console.log("\x1b[35m" + "-".repeat(title.length + 2) + "\x1b[0m");
}

main();
