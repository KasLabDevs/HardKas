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

    // 1. Status of localnet
    try {
      const status = await sdk.localnet.status();
      result.events.push({ step: "localnet_status", ready: status.node.ready });
    } catch (err: any) {
      result.events.push({ step: "localnet_status", error: err.message });
    }

    // 2. Start localnet
    try {
      await sdk.localnet.start({ profile: "simulated" });
      result.events.push({ step: "localnet_start", ok: true });
    } catch (err: any) {
      result.events.push({ step: "localnet_start", error: err.message });
    }

    // 3. Corrupt localnet state (delete localnet.json)
    const stateFile = path.join(sdk.workspace.root, ".hardkas", "localnet", "localnet.json");
    if (fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile);
      result.events.push({ step: "corrupt_localnet", ok: true });
    } else {
      result.events.push({ step: "corrupt_localnet", error: "state file not found" });
    }

    // 4. Try to start again, should recover and create the file
    try {
      await sdk.localnet.start({ profile: "simulated" });
      const exists = fs.existsSync(stateFile);
      result.events.push({ step: "localnet_start_after_corruption", ok: true, stateRecreated: exists });
    } catch (err: any) {
      result.events.push({ step: "localnet_start_after_corruption", error: err.message });
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
