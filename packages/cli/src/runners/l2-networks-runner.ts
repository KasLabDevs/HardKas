import { listL2Profiles } from "@hardkas/l2";
import { loadHardkasConfig } from "@hardkas/config";

export interface L2NetworksOptions {
  json?: boolean;
}

export async function runL2Networks(options: L2NetworksOptions = {}): Promise<void> {
  const loaded = await loadHardkasConfig();
  const profiles = listL2Profiles(loaded.config.l2?.networks);

  if (options.json) {
    console.log(JSON.stringify(profiles, null, 2));
    return;
  }

  console.log("L2 networks");
  console.log("");
  
  if (profiles.length === 0) {
    console.log("No L2 profiles found.");
    return;
  }

  // Header
  console.log(`${"name".padEnd(16)} ${"source".padEnd(14)} ${"type".padEnd(20)} ${"bridge".padEnd(10)} ${"exit"}`);
  console.log("─".repeat(70));

  for (const p of profiles) {
    const bridge = p.security.bridgePhase;
    const exit = p.security.trustlessExit ? "yes" : "no";
    const source = p.source;
    console.log(`${p.name.padEnd(16)} ${source.padEnd(14)} ${p.type.padEnd(20)} ${bridge.padEnd(10)} ${exit}`);
  }
}
