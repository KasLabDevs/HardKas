import { Hardkas } from "./packages/sdk/src/index.js";
async function run() {
  const sdk = await Hardkas.create({ autoBootstrap: true, network: "simulated" });
  const alice = await sdk.accounts.resolve("alice");
  console.log("Alice address:", alice.address);
  const bal = await sdk.accounts.getBalance("alice");
  console.log("Alice balance:", bal);
  const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
  console.log("Plan mass:", plan.estimatedMass);
}
run().catch(console.error);
