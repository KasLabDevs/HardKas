import { Hardkas } from "@hardkas/sdk";

async function main() {
  const sdk = await Hardkas.create({ network: "simulated", autoBootstrap: true });

  // Typical backend flow: receive a plan from frontend, verify it, sign it
  const plan = await sdk.tx.plan({ from: "bob", to: "alice", amount: "5" });
  await sdk.artifacts.write(plan);

  // Backend verifies the deterministic intent BEFORE touching keys
  const isValid = await sdk.artifacts.verify(plan);
  if (!isValid) throw new Error("Invalid artifact format");

  const signed = await sdk.tx.sign(plan, "bob");
  await sdk.artifacts.write(signed);
  await sdk.tx.simulate(signed);

  console.log("Backend service flow completed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
