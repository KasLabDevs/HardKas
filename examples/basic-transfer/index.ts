import { Hardkas } from "@hardkas/sdk";

async function main() {
  const sdk = await Hardkas.create({ network: "simulated", autoBootstrap: true });

  // 1. Declare intent
  const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
  await sdk.artifacts.write(plan);

  // 2. Sign deterministic artifact
  const signed = await sdk.tx.sign(plan, "alice");
  await sdk.artifacts.write(signed);

  // 3. Execute and capture receipt
  const sim = await sdk.tx.simulate(signed);
  if (sim.receipt) await sdk.artifacts.write(sim.receipt);
  if (sim.trace) await sdk.artifacts.write(sim.trace);
  await sdk.query.sync();

  // 4. Cryptographically prove equivalence
  await sdk.replay.verify(sim.receipt);
  console.log("Basic transfer completed and verified.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
