import { createJiti } from "jiti";
import fs from "fs";
import path from "path";

async function run() {
  const jitiOptions = {
    alias: {
      "@hardkas/sdk":
        "C:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/packages/sdk/src/index.ts"
    }
  };
  const jiti = createJiti(import.meta.url, jitiOptions);

  const tmpPath = "C:/Users/jrodr/AppData/Local/Temp/test_config.ts";
  fs.writeFileSync(
    tmpPath,
    'import { defineHardkasConfig } from "@hardkas/sdk"; export default defineHardkasConfig({ defaultNetwork: "simulated", networks: { simulated: { kind: "simulated" } } });'
  );

  try {
    const result = await jiti.import(tmpPath);
    console.log("Result:", result);
  } catch (err) {
    console.error("Error importing:", err);
  }
}

run();
