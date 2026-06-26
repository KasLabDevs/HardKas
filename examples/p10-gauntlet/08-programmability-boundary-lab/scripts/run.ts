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

    // 1. Capabilities API
    try {
      const caps = await sdk.capabilitiesApi.get();
      result.events.push({ step: "capabilities", caps });
    } catch (err: any) {
      result.events.push({ step: "capabilities", error: err.message });
    }

    // 2. L2 boundary
    try {
      const l2status = sdk.l2.listProfiles();
      result.events.push({ step: "l2_status", l2status });
    } catch (err: any) {
      result.events.push({ step: "l2_status", error: err.message });
    }

    // 3. Silver
    try {
      const silverDoctor = await sdk.silver.compile({ file: "non-existent.silver" });
      result.events.push({ step: "silver_compile", silverDoctor });
    } catch (err: any) {
      result.events.push({ step: "silver_compile", error: err.message });
    }

    // 4. ZK boundary
    try {
      // Need to import sdk.zk? Wait, sdk.zk might not be exposed on Hardkas facade
      const sdkZk = (sdk as any).zk;
      if (sdkZk) {
        const zkCaps = await sdkZk.capabilities();
        result.events.push({ step: "zk_capabilities", zkCaps });
      } else {
        result.events.push({ step: "zk_capabilities", error: "sdk.zk not exposed" });
      }
    } catch (err: any) {
      result.events.push({ step: "zk_capabilities", error: err.message });
    }

    // 5. vprogs boundary
    try {
      const sdkVprogs = (sdk as any).vprogs;
      if (sdkVprogs) {
        const vprogsStatus = await sdkVprogs.status();
        result.events.push({ step: "vprogs_status", vprogsStatus });
      } else {
        result.events.push({ step: "vprogs_status", error: "sdk.vprogs not exposed" });
      }
    } catch (err: any) {
      result.events.push({ step: "vprogs_status", error: err.message });
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
