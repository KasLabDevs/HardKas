import { Hardkas } from "../../packages/sdk/src/index.ts";
import path from "node:path";

async function run() {
  console.log("Loading HardKAS with local WASM provider (v2.0.1)...");
  
  const sdk = await Hardkas.create({
    cwd: process.cwd(),
    network: "simulated",
    wasm: {
      provider: "local",
      path: path.join(process.cwd(), "vendor", "kaspa-wasm")
    }
  });

  console.log("Checking capabilities...");
  const caps = await sdk.experimental.capabilitiesApi.get();
  
  console.log("WASM Version:", caps.runtimeMatrix?.wasm.version);
  console.log("Transaction V1 Parsing Support:", caps.runtimeMatrix?.wasm.txV1);
  console.log("Transaction V1 Signing Support:", caps.runtimeMatrix?.wasm.signingV1);
  
  if (caps.runtimeMatrix?.wasm.txV1) {
    console.log("✅ WASM v2.x successfully loaded and V1 properties detected!");
  } else {
    console.error("❌ Failed to detect V1 support in WASM bindings.");
    process.exit(1);
  }
}

run().catch(console.error);
