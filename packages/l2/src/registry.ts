import { L2NetworkProfile, BUILTIN_L2_PROFILES } from "./profiles.js";
import { HARDKAS_VERSION } from "@hardkas/artifacts";

export function getBuiltInL2Profiles(): readonly L2NetworkProfile[] {
  return BUILTIN_L2_PROFILES;
}

export function listL2Profiles(): readonly L2NetworkProfile[] {
  // Currently only built-in, but could be extended to load from config
  return BUILTIN_L2_PROFILES;
}

export function getL2Profile(name: string): L2NetworkProfile | null {
  return listL2Profiles().find(p => p.name === name) || null;
}

export function validateL2Profile(profile: any): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!profile || typeof profile !== "object") {
    return { ok: false, errors: ["Profile must be an object"] };
  }

  if (profile.schema !== "hardkas.l2Profile.v1") {
    errors.push(`Invalid schema: expected 'hardkas.l2Profile.v1', got '${profile.schema}'`);
  }

  if (typeof profile.hardkasVersion !== "string") {
    errors.push("Missing or invalid hardkasVersion");
  }

  if (!profile.name || typeof profile.name !== "string") {
    errors.push("Missing or invalid name");
  }

  if (profile.type !== "evm-based-rollup") {
    errors.push(`Invalid type: expected 'evm-based-rollup', got '${profile.type}'`);
  }

  if (profile.settlementLayer !== "kaspa") {
    errors.push(`Invalid settlementLayer: expected 'kaspa', got '${profile.settlementLayer}'`);
  }

  if (profile.executionLayer !== "evm") {
    errors.push(`Invalid executionLayer: expected 'evm', got '${profile.executionLayer}'`);
  }

  if (!profile.gasToken || typeof profile.gasToken !== "string") {
    errors.push("Missing or invalid gasToken");
  }

  if (profile.security) {
    if (profile.security.bridgePhase === "zk") {
      // trustlessExit can be true or false in ZK phase
    } else {
      if (profile.security.trustlessExit === true) {
        errors.push("Security invariant violation: trustlessExit must be false when bridgePhase is not 'zk'");
      }
    }

    if (!Array.isArray(profile.security.notes) || profile.security.notes.length === 0) {
      errors.push("Security notes must not be empty");
    }
  } else {
    errors.push("Missing security assumptions");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function assertValidL2Profile(profile: any): L2NetworkProfile {
  const { ok, errors } = validateL2Profile(profile);
  if (!ok) {
    throw new Error(`Invalid L2 profile:\n${errors.map(e => `  - ${e}`).join("\n")}`);
  }
  return profile as L2NetworkProfile;
}
