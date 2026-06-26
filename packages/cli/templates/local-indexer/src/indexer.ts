import { Hardkas } from "@hardkas/sdk";

async function main() {
  const sdk = await Hardkas.create({ autoBootstrap: true });

  console.log("Funding alice...");
  await sdk.localnet.fund("kaspa:sim_alice", { amount: "100" });

  console.log("Executing transaction...");
  const plan = await sdk.tx.plan({
    from: "alice",
    to: "kaspa:sim_bob",
    amount: "10"
  });
  const signed = await sdk.tx.sign(plan, "alice");
  await sdk.tx.simulate(signed);

  console.log("\n--- Querying Local Projection ---");
  // Syncing is automatic during localnet operations, but you can explicitly resync if needed:
  // await sdk.query.sync();

  const balance = await sdk.accounts.balance("kaspa:sim_bob");
  console.log(`Bob's balance via indexer: ${balance.sompi} sompi`);
  
  console.log("Indexer query complete!");
}

main().catch(console.error);
