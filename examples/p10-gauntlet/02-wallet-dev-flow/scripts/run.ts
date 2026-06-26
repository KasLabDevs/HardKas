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
    
    // 1. List accounts
    const accounts = await sdk.accounts.list();
    result.events.push({ step: "list_accounts", count: accounts.length });

    // 2. Resolve known account
    const alice = await sdk.accounts.resolve("alice");
    result.events.push({ step: "resolve_alice", address: alice.address });

    // 3. Resolve unknown account (should throw)
    try {
      await sdk.accounts.resolve("unknown_bob");
      result.events.push({ step: "resolve_unknown", ok: true });
    } catch (err: any) {
      result.events.push({ step: "resolve_unknown", ok: false, error: err.message });
    }

    // 4. Check balances
    const aliceBal = await sdk.accounts.balance("alice");
    result.events.push({ step: "balance_alice", sompi: aliceBal.sompi.toString() });

    // 5. Fund account
    try {
      // Trying to fund from alice to herself (might be an edge case)
      await sdk.accounts.fund("alice", { amount: "10" });
      result.events.push({ step: "fund_alice", ok: true });
    } catch (err: any) {
      result.events.push({ step: "fund_alice", ok: false, error: err.message });
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
