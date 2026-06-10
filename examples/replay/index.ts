import { Hardkas } from "@hardkas/sdk";

async function main() {
  const sdk = await Hardkas.create({ network: "simulated", autoBootstrap: true });

  const plan = await sdk.tx.plan({ from: "bob", to: "alice", amount: "1" });
  await sdk.artifacts.write(plan);
  const signed = await sdk.tx.sign(plan, "bob");
  await sdk.artifacts.write(signed);
  const sim = await sdk.tx.simulate(signed);
  if (sim.receipt) await sdk.artifacts.write(sim.receipt);
  if (sim.trace) await sdk.artifacts.write(sim.trace);
  await sdk.query.sync();

  // Replay reconstructs the exact state and proves equivalence
  const replayResult = await sdk.replay.verify(sim.receipt);
  if (replayResult && replayResult.valid === false) {
    throw new Error("Replay failed! Determinism broken.");
  }

  console.log("Replay verification successful.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
