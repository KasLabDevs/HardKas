import { Hardkas } from "@hardkas/sdk";

async function main() {
  const sdk = await Hardkas.create({ autoBootstrap: true });

  console.log("Funding sender...");
  await sdk.localnet.fund("kaspa:sim_sender", { amount: "100" });
  await sdk.localnet.fund("kaspa:sim_sender", { amount: "100" });
  await sdk.localnet.fund("kaspa:sim_sender", { amount: "100" });

  const receivers = ["kaspa:sim_receiver1", "kaspa:sim_receiver2", "kaspa:sim_receiver3"];
  
  console.log(`Starting batch payments to ${receivers.length} receivers...`);

  for (const receiver of receivers) {
    const plan = await sdk.tx.plan({
      from: "sender",
      to: receiver,
      amount: "50"
    });
    const signed = await sdk.tx.sign(plan, "sender");
    const { receipt } = await sdk.tx.simulate(signed);
    
    console.log(`Sent 50 KAS to ${receiver}. TxId: ${receipt.txId}`);
  }

  console.log("Batch complete!");
}

main().catch(console.error);
