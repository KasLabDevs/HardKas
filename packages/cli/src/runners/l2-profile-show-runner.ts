import { resolveL2Profile } from "@hardkas/l2";
import { loadHardkasConfig } from "@hardkas/config";

export interface L2ProfileShowOptions {
  name?: string;
  network?: string;
  url?: string;
  chainId?: string | number;
  json?: boolean;
}

export async function runL2ProfileShow(options: L2ProfileShowOptions): Promise<void> {
  const loaded = await loadHardkasConfig();
  const name = options.name || options.network;

  const profile = resolveL2Profile({
    name,
    userProfiles: loaded.config.l2?.networks,
    cliOverrides: {
      ...(options.url !== undefined ? { url: options.url } : {}),
      ...(options.chainId !== undefined ? { chainId: options.chainId } : {})
    }
  });

  if (options.json) {
    console.log(JSON.stringify(profile, null, 2));
    return;
  }

  console.log("L2 profile");
  console.log("");
  console.log(`Name:        ${profile.name}`);
  console.log(`Source:      ${profile.source}`);
  console.log(`Display:     ${profile.displayName}`);
  console.log(`Type:        ${profile.type}`);
  console.log(`Settlement:  ${profile.settlementLayer === "kaspa" ? "Kaspa L1" : profile.settlementLayer}`);
  console.log(`Execution:   ${profile.executionLayer === "evm" ? "EVM L2" : profile.executionLayer}`);
  console.log(`Chain ID:    ${profile.chainId || "unknown"}`);
  console.log(`RPC URL:     ${profile.rpcUrl || "unknown"}`);
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
