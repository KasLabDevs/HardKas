import { Hardkas } from "@hardkas/sdk";
import fs from "fs";
import path from "path";

async function main() {
  const result: any = {
    status: "started",
    events: [],
    errors: []
  };

  const expectError = async (step: string, fn: () => Promise<any>) => {
    try {
      await fn();
      result.events.push({ step, ok: false, error: "Expected an error but succeeded!" });
    } catch (err: any) {
      result.events.push({
        step,
        ok: true,
        code: err.code || "NO_CODE",
        message: err.message,
        isHardkasError: err.name === "HardkasError" || !!err.code
      });
    }
  };

  try {
    const sdk = await Hardkas.create({ network: "simulated", autoBootstrap: true });

    // 1. Insufficient funds
    await expectError("insufficient_funds", async () => {
      await sdk.tx.plan({ from: "alice", to: "bob", amount: "999999999" }); // 999 million KAS
    });

    // 2. Invalid negative amount
    await expectError("negative_amount", async () => {
      await sdk.tx.plan({ from: "alice", to: "bob", amount: "-10" });
    });

    // 3. Too many decimals
    await expectError("invalid_decimals", async () => {
      await sdk.tx.plan({ from: "alice", to: "bob", amount: "1.123456789" });
    });

    // 4. Wrong signer
    await expectError("wrong_signer", async () => {
      const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
      await sdk.tx.sign(plan, "bob"); // Bob signing Alice's tx
    });

    // 5. Send unsigned (this succeeds, it's a feature for simulation)
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
    await sdk.tx.simulate(plan as any);
    result.events.push({ step: "simulate_plan", ok: true });

    // 6. Send invalid object to simulate
    await expectError("simulate_invalid_object", async () => {
      await sdk.tx.simulate({} as any);
    });

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
