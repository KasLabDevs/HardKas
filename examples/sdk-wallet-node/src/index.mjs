import { Hardkas } from "@hardkas/sdk";

async function run() {
  console.log("Starting Wallet Node...");
  
  // Create SDK instance with autoBootstrap to initialize .hardkas/ in simulated mode
  const hardkas = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    logger: console
  });

  const accounts = await hardkas.accounts.list();
  console.log("Accounts:", accounts);

  console.log("Funding bob...");
  await hardkas.accounts.fund("bob");

  const bobBalance = await hardkas.accounts.balance("bob");
  console.log("Bob balance:", bobBalance.formatted, "KAS");

  console.log("Sending 5 KAS from bob to alice...");
  const plan = await hardkas.tx.plan({ from: "bob", to: "alice", amount: 5 });
  const signed = await hardkas.tx.sign(plan);
  const receipt = await hardkas.tx.send(signed);

  console.log("Transaction sent! Receipt ID:", receipt.artifactId);

  console.log("Verifying replay determinism...");
  const replayReport = await hardkas.replay.verify(receipt.artifactId);
  console.log("Replay Passed:", replayReport.passed);
  console.log("Artifacts Scanned:", replayReport.artifactsScanned);
}

run().catch(console.error);
