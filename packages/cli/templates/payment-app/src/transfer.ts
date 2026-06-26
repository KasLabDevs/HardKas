import { Hardkas } from "@hardkas/sdk";

async function main() {
  const sdk = await Hardkas.create({ autoBootstrap: true });

  console.log("Funding alice with 100 KAS...");
  await sdk.localnet.fund("kaspa:sim_alice", { amount: "100" });

  console.log("Planning 10 KAS transfer from Alice to Bob...");
  const plan = await sdk.tx.plan({
    from: "alice",
    to: "kaspa:sim_bob",
    amount: "10"
  });

  console.log("Signing...");
  const signed = await sdk.tx.sign(plan, "alice");

  console.log("Executing transaction...");
  const { receipt } = await sdk.tx.simulate(signed);

  console.log(`Success! Receipt TxId: ${receipt.txId}`);
}

main().catch(console.error);
