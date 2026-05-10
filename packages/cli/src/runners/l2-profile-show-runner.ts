import { getL2Profile } from "@hardkas/l2";

export interface L2ProfileShowOptions {
  name: string;
  json?: boolean;
}

export async function runL2ProfileShow(options: L2ProfileShowOptions): Promise<void> {
  const profile = getL2Profile(options.name);

  if (!profile) {
    throw new Error(`L2 profile '${options.name}' not found.`);
  }

  if (options.json) {
    console.log(JSON.stringify(profile, null, 2));
    return;
  }

  console.log("L2 profile");
  console.log("");
  console.log(`Name:        ${profile.name}`);
  console.log(`Display:     ${profile.displayName}`);
  console.log(`Type:        ${profile.type}`);
  console.log(`Settlement:  ${profile.settlementLayer === "kaspa" ? "Kaspa L1" : profile.settlementLayer}`);
  console.log(`Execution:   ${profile.executionLayer === "evm" ? "EVM L2" : profile.executionLayer}`);
  console.log(`Gas token:   ${profile.gasToken}`);
  console.log(`Bridge:      ${profile.security.bridgePhase}`);
  console.log(`Trustless exit: ${profile.security.trustlessExit ? "yes" : "no"}`);
  console.log(`Risk:        ${profile.security.riskProfile}`);

  if (profile.security.notes && profile.security.notes.length > 0) {
    console.log("");
    console.log("Notes:");
    for (const note of profile.security.notes) {
      console.log(`  - ${note}`);
    }
  }
}
