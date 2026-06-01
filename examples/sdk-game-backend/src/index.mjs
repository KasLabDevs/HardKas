import { Hardkas } from "@hardkas/sdk";

async function run() {
  const hardkas = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    logger: console
  });

  console.log("Game Backend initialized.");
  console.log("Funding player1...");
  await hardkas.accounts.fund("player1");
  console.log("Funding gameVault...");
  await hardkas.accounts.fund("gameVault");

  console.log("Player1 buys an item for 15 KAS...");
  const buyPlan = await hardkas.tx.plan({ from: "player1", to: "gameVault", amount: 15 });
  const buySigned = await hardkas.tx.sign(buyPlan);
  const buyReceipt = await hardkas.tx.send(buySigned);
  
  console.log(`Purchase recorded! txId: ${buyReceipt.txId}`);

  console.log("Game rewards Player1 with 5 KAS...");
  const rewardPlan = await hardkas.tx.plan({ from: "gameVault", to: "player1", amount: 5 });
  const rewardSigned = await hardkas.tx.sign(rewardPlan);
  const rewardReceipt = await hardkas.tx.send(rewardSigned);

  console.log(`Reward granted! txId: ${rewardReceipt.txId}`);
  
  const p1Balance = await hardkas.accounts.balance("player1");
  console.log(`Player1 balance is now: ${p1Balance.formatted} KAS`);
}

run().catch(console.error);
