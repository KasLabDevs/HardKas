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
    
    const recipients = ["bob", "carol", "dave", "eve", "frank"];
    
    for (const recipient of recipients) {
      try {
        const plan = await sdk.tx.plan({ from: "alice", to: recipient, amount: "1" });
        const signed = await sdk.tx.sign(plan, "alice");
        const sim = await sdk.tx.simulate(signed);
        
        result.events.push({ step: `pay_${recipient}`, ok: true, txId: sim.receipt?.txId });
        
        // Let's intentionally NOT sync the query store between rapid-fire transactions
        // and see if the SDK correctly chains UTXOs in memory or via the backend.
      } catch (err: any) {
        result.events.push({ step: `pay_${recipient}`, ok: false, error: err.message });
      }
    }

    // Now sync
    await sdk.query.sync();

    // Verify all balances
    for (const recipient of recipients) {
      const bal = await sdk.accounts.balance(recipient);
      result.events.push({ step: `balance_${recipient}`, sompi: bal.sompi.toString() });
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
