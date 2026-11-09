import { resolveL2Profile, L2BridgeAssumptions, L2NetworkProfile } from "@hardkas/l2";
import { HARDKAS_VERSION } from "@hardkas/artifacts";
import { loadHardkasConfig } from "@hardkas/config";
import { HardkasSchemas } from "@hardkas/artifacts";

export interface L2BridgeOptions {
  network?: string;
  url?: string;
  json?: boolean;
}

export async function runL2BridgeStatus(options: L2BridgeOptions): Promise<void> {
  const loaded = await loadHardkasConfig();
  const profile = resolveL2Profile({
    name: options.network,
    userProfiles: loaded.config.l2?.networks,
    cliOverrides: {
      ...(options.url !== undefined ? { url: options.url } : {})
    }
  });

  const assumptions = mapProfileToAssumptions(profile);

  if (options.json) {
    console.log(JSON.stringify(assumptions, null, 2));
    return;
  }

  console.log(`${profile.displayName} bridge status (${profile.source}; static assumptions, not observed)`);
  console.log("");
  console.log(`Network:        ${assumptions.l2Network}`);
  console.log(`Bridge phase:   ${assumptions.bridgePhase}`);
  console.log(`Trustless exit: ${assumptions.trustlessExit ? "yes" : "no"}`);
  console.log(`Risk:           ${assumptions.riskProfile}`);
  console.log("");
  console.log("Custody:");
  console.log(`  ${assumptions.custodyModel}`);
  console.log("");
  console.log("Exit model:");
  console.log(`  ${assumptions.exitModel}`);
  console.log("");
  console.log("Warnings:");
  for (const note of assumptions.notes) {
    console.log(`  - ${note}`);
  }
}

export async function runL2BridgeAssumptions(options: L2BridgeOptions): Promise<void> {
  const loaded = await loadHardkasConfig();
  const profile = resolveL2Profile({
    name: options.network,
    userProfiles: loaded.config.l2?.networks,
    cliOverrides: {
      ...(options.url !== undefined ? { url: options.url } : {})
    }
  });

  const assumptions = mapProfileToAssumptions(profile);

  if (options.json) {
    console.log(JSON.stringify(assumptions, null, 2));
    return;
  }

  console.log(`${profile.displayName} bridge assumptions (${profile.source})`);
  console.log("");
  console.log("Bridge security phases:");
  console.log("  pre-ZK: stronger trust assumptions / non-trustless exit");
  console.log("  MPC:    threshold committee trust assumptions");
  console.log("  ZK:     validity-proof based exit; trustless only once a proof-based withdrawal path is live");
  console.log("");
  console.log("Current configured phase:");
  console.log(`  ${assumptions.bridgePhase}`);
  console.log("");
  console.log("Trustless exit:");
  console.log(`  ${assumptions.trustlessExit ? "yes" : "no"}`);
}

function mapProfileToAssumptions(profile: L2NetworkProfile): L2BridgeAssumptions {
  return {
    schema: HardkasSchemas.L2BridgeAssumptionsV1,
    hardkasVersion: HARDKAS_VERSION,
    l2Network: profile.name,
    bridgePhase: profile.security.bridgePhase,
    trustlessExit: profile.security.trustlessExit,
    custodyModel: profile.security.custodyModel,
    // RC1-R2 (D5): keyed on the profile's own trustlessExit, never on the phase name: a ZK phase alone does not make an
    // exit trustless (packages/l2/src/bridge.ts), and these are static assumptions, not observations
    exitModel: profile.security.trustlessExit
      ? "This profile declares a trustless exit (a static assumption, not observed): verify the deployed proof-based withdrawal path before relying on it."
      : "No trustless exit: that needs a deployed, working proof-based withdrawal path, and a ZK proof system alone is not enough (static assumption, not observed).",
    riskProfile: profile.security.riskProfile,
    notes: profile.security.notes,
    updatedAt: new Date().toISOString()
  };
}

