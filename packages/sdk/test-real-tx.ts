import { Hardkas } from "@hardkas/sdk";
import { resolveHardkasAccountAddress } from "@hardkas/accounts";

async function main() {
  const sdk = new Hardkas({ network: "simnet" });
  
  console.log("Checking Alice balance...");
  const aliceBal = await sdk.accounts.balance("alice", { profile: "toccata-v2" });
  console.log("Alice Balance:", aliceBal);

  console.log("Checking Bob balance...");
  const bobBalBefore = await sdk.accounts.balance("bob", { profile: "toccata-v2" });
  console.log("Bob Balance Before:", bobBalBefore);

  console.log("Planning transaction: Alice -> Bob (1 KAS)");
  const plan = await sdk.tx.plan({
    to: "bob",
    amount: "1",
    profile: "toccata-v2"
  }, {
    from: "alice"
  });
  console.log("Transaction planned successfully. ID:", plan.id);

  console.log("Signing transaction...");
  const signed = await sdk.tx.sign(plan);
  console.log("Transaction signed successfully.");

  console.log("Sending transaction to localnet...");
  const receipt = await sdk.tx.send(signed, { profile: "toccata-v2" });
  console.log("Transaction sent successfully! TXID:", receipt.transactionId);

  // Wait a moment for mempool processing
  console.log("Waiting 2 seconds...");
  await new Promise(r => setTimeout(r, 2000));

  console.log("Checking Bob balance after...");
  const bobBalAfter = await sdk.accounts.balance("bob", { profile: "toccata-v2" });
  console.log("Bob Balance After:", bobBalAfter);

  if (bobBalAfter.balanceSompi > bobBalBefore.balanceSompi) {
    console.log("SUCCESS: Transaction went through and balance updated.");
    process.exit(0);
  } else {
    console.log("ERROR: Balance did not update!");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
