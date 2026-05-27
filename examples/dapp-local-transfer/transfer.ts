/**
 * HardKAS Example: Local Transfer Workflow
 * 
 * Demonstrates how to execute a transaction purely locally
 * using the high-level dApp client facade.
 */
import { createHardkasClient } from "@hardkas/sdk";

async function main() {
  console.log("Initializing HardKAS client...");
  const client = createHardkasClient({ baseUrl: "http://127.0.0.1:7420" });

  const { data: accounts } = await client.accounts.list();
  if (!accounts || accounts.length < 2) {
    console.error("Need at least 2 accounts to run this demo.");
    process.exit(1);
  }

  const [from, to] = accounts;

  console.log(`\n1. Planning transaction from ${from.name} to ${to.name}`);
  const planRes = await client.tx.plan({
    from: from.address,
    to: to.address,
    amountSompi: "5000000" // 0.05 KAS
  });

  if (!planRes.ok) throw new Error(planRes.error?.message);
  console.log(`✅ Plan generated: ${planRes.data.id}`);

  console.log(`\n2. Signing transaction`);
  const signRes = await client.tx.sign({
    planId: planRes.data.id,
    account: from.name
  });

  if (!signRes.ok) throw new Error(signRes.error?.message);
  console.log(`✅ Signed transaction: ${signRes.data.id}`);

  console.log(`\n3. Sending to localnet`);
  const sendRes = await client.tx.send({
    signedTxId: signRes.data.id
  });

  if (!sendRes.ok) throw new Error(sendRes.error?.message);
  console.log(`✅ Transaction submitted! Receipt: ${sendRes.data.txId}`);

  console.log(`\n4. Explaining resulting artifact`);
  const explainRes = await client.artifacts.explain(sendRes.data.txId);
  console.log(explainRes.data.explanation);
}

main().catch(console.error);
