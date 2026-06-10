import { Hardkas } from "@hardkas/sdk";

async function run() {
  const hardkas = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    logger: console
  });

  const employees = ["alice", "carol", "dave"];
  console.log("Funding payroll account (bob)...");
  await hardkas.accounts.fund("bob");

  console.log(`Executing payroll for ${employees.length} employees...`);

  for (const employee of employees) {
    console.log(`Paying ${employee} 10 KAS...`);
    const plan = await hardkas.tx.plan({ from: "bob", to: employee, amount: 10 });
    const signed = await hardkas.tx.sign(plan);
    const receipt = await hardkas.tx.send(signed);
    console.log(` -> Paid! Receipt: ${receipt.artifactId}`);
  }

  console.log("Payroll complete.");
  const bobBalance = await hardkas.accounts.balance("bob");
  console.log(`Bob remaining balance: ${bobBalance.formatted} KAS`);
}

run().catch(console.error);
