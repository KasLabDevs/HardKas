import { Hardkas } from "@hardkas/sdk";
import fs from "fs";
import path from "path";

async function main() {
  const result: any = {
    status: "started",
    events: [],
    errors: []
  };

  try {
    const sdk = await Hardkas.create({ network: "simulated", autoBootstrap: true });
    
    // 1. Initial Balances
    const aliceBal1 = await sdk.accounts.balance("alice");
    result.events.push({ step: "alice_initial_balance", sompi: aliceBal1.sompi.toString() });

    // 2. Alice -> Bob (10 KAS)
    const plan1 = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    const signed1 = await sdk.tx.sign(plan1, "alice");
    const sim1 = await sdk.tx.simulate(signed1);
    
    result.events.push({ step: "alice_to_bob_simulated", txId: sim1.receipt?.txId });

    // Wait for the query store to sync the new UTXOs
    await sdk.query.sync();

    // 3. Bob -> Carol (5 KAS)
    const bobBal = await sdk.accounts.balance("bob");
    result.events.push({ step: "bob_balance_before_send", sompi: bobBal.sompi.toString() });

    const plan2 = await sdk.tx.plan({ from: "bob", to: "carol", amount: "5" });
    const signed2 = await sdk.tx.sign(plan2, "bob");
    const sim2 = await sdk.tx.simulate(signed2);

    result.events.push({ step: "bob_to_carol_simulated", txId: sim2.receipt?.txId });

    // 4. Final Balances
    await sdk.query.sync();
    const carolBal = await sdk.accounts.balance("carol");
    result.events.push({ step: "carol_final_balance", sompi: carolBal.sompi.toString() });

    // 5. Verify the lineage of the final receipt
    if (sim2.receipt) {
      const verification = await sdk.replay.verify(sim2.receipt);
      result.events.push({ step: "receipt_verification", ok: verification.ok });
    }

    result.status = "success";
  } catch (err: any) {
    result.status = "error";
    result.errors.push({
      message: err.message,
      code: err.code || "UNKNOWN",
      stack: err.stack
    });
  }

  const outDir = path.join(process.cwd(), "runs", "latest");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));

  console.log(JSON.stringify(result, null, 2));
  
  if (result.status === "error") process.exit(1);
}

main().catch(console.error);
