import { L2NetworkProfile, BUILTIN_L2_PROFILES, L2UserNetworkConfig, L2ProfileSource } from "./profiles.js";
import { HARDKAS_VERSION } from "@hardkas/artifacts";

export function listL2Profiles(userProfiles?: Record<string, L2UserNetworkConfig>): L2NetworkProfile[] {
  const profiles: L2NetworkProfile[] = [...BUILTIN_L2_PROFILES];

  if (userProfiles) {
    for (const [name, config] of Object.entries(userProfiles)) {
      const existingIndex = profiles.findIndex(p => p.name === name);
      const profile = mapUserConfigToProfile(name, config);
      
      if (existingIndex !== -1) {
        profiles[existingIndex] = profile;
      } else {
        profiles.push(profile);
      }
    }
  }

  return profiles;
}

export function getL2Profile(name: string, userProfiles?: Record<string, L2UserNetworkConfig>): L2NetworkProfile | undefined {
  return listL2Profiles(userProfiles).find(p => p.name === name);
}

export function resolveL2Profile(args: {
  name?: string | undefined;
  userProfiles?: Record<string, L2UserNetworkConfig> | undefined;
  cliOverrides?: {
    url?: string | undefined;
    rpcUrl?: string | undefined;
    chainId?: number | string | undefined;
    [key: string]: unknown;
  } | undefined;
}): L2NetworkProfile {
  const name = args.name || "igra";
  const profile = getL2Profile(name, args.userProfiles);

  if (!profile) {
    const available = listL2Profiles(args.userProfiles).map(p => `${p.name} (${p.source})`).join(", ");
    throw new Error(`L2 profile '${name}' not found. Available profiles: ${available}`);
  }

  // CLI Overrides
  let rpcUrl = args.cliOverrides?.rpcUrl || args.cliOverrides?.url || profile.rpcUrl;
  
  if (args.cliOverrides?.rpcUrl && args.cliOverrides?.url && args.cliOverrides.rpcUrl !== args.cliOverrides.url) {
    throw new Error("Conflict: Both --rpc-url and --url provided with different values.");
  }

  let chainId = profile.chainId;
  if (args.cliOverrides?.chainId !== undefined) {
    chainId = typeof args.cliOverrides.chainId === "string" 
      ? parseInt(args.cliOverrides.chainId, 10) 
      : (args.cliOverrides.chainId as number);
    
    if (isNaN(chainId)) {
      throw new Error(`Invalid chainId: ${args.cliOverrides.chainId}`);
    }
  }

  const resolved: L2NetworkProfile = {
    ...profile,
    ...(rpcUrl ? { rpcUrl: rpcUrl as string } : {}),
    ...(chainId !== undefined ? { chainId } : {})
  };

  return assertValidL2Profile(resolved);
}

function mapUserConfigToProfile(name: string, config: L2UserNetworkConfig): L2NetworkProfile {
  const bridgePhase = config.bridgePhase || "pre-zk";
  const trustlessExit = config.trustlessExit ?? false;

  return {
    schema: "hardkas.l2Profile.v1",
    hardkasVersion: HARDKAS_VERSION,
    source: "user-config",
    name,
    displayName: name,
    type: "evm-based-rollup",
    settlementLayer: "kaspa",
    executionLayer: "evm",
    gasToken: config.nativeCurrency?.symbol || (config.kind === "igra" || !config.kind ? "iKAS" : "ETH"),
    nativeTokenDecimals: config.nativeCurrency?.decimals || 18,
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    ...(config.explorerUrl ? { explorerUrl: config.explorerUrl } : {}),
    security: {
      bridgePhase,
      trustlessExit,
      custodyModel: "User-defined bridge custody.",
      riskProfile: "unknown",
      notes: ["User-defined network from config"]
    }
  } as L2NetworkProfile;
}

export function validateL2Profile(profile: any): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!profile || typeof profile !== "object") {
    return { ok: false, errors: ["Profile must be an object"] };
  }

  if (profile.schema !== "hardkas.l2Profile.v1") {
    errors.push(`Invalid schema: expected 'hardkas.l2Profile.v1', got '${profile.schema}'`);
  }

  if (profile.security) {
    if (profile.security.bridgePhase !== "zk" && profile.security.trustlessExit === true) {
      errors.push(`Security invariant violation: trustlessExit=true is only allowed when bridgePhase='zk'. Current phase: ${profile.security.bridgePhase}`);
    }
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
