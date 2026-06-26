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
    // 1. Initializing with mainnet when allowPublic is false should be blocked
    await expectError("mainnet_init", async () => {
      await Hardkas.create({ network: "mainnet", autoBootstrap: true });
    });

    // 2. We'll init with simulated for the rest of the tests
    const sdk = await Hardkas.create({ network: "simulated", autoBootstrap: true });

    // 3. Modifying an artifact to point to mainnet and attempting to write it
    await expectError("mainnet_plan", async () => {
      const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
      (plan as any).networkId = "mainnet";
      await sdk.artifacts.write(plan as any);
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
