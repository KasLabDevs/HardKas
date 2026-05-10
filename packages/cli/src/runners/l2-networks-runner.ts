import { listL2Profiles } from "@hardkas/l2";

export interface L2NetworksOptions {
  json?: boolean;
}

export async function runL2Networks(options: L2NetworksOptions = {}): Promise<void> {
  const profiles = listL2Profiles();

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

  for (const p of profiles) {
    const bridge = p.security.bridgePhase;
    const exit = p.security.trustlessExit ? "yes" : "no";
    console.log(`${p.name.padEnd(8)} ${p.displayName.padEnd(8)} ${p.type.padEnd(18)} gas: ${p.gasToken.padEnd(8)} bridge: ${bridge.padEnd(8)} trustless exit: ${exit}`);
  }
}
