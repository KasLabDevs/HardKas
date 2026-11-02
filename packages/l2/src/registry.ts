import {
  L2NetworkProfile,
  BUILTIN_L2_PROFILES,
  L2UserNetworkConfig,
  L2NetworkEnvironment,
  AMBIGUOUS_L2_PROFILE_NAMES,
  DEFAULT_L2_PROFILE_NAME
} from "./profiles.js";
import { HARDKAS_VERSION } from "@hardkas/artifacts";
import { L2SafetyError } from "./errors.js";
import { parseUserChainId } from "./hex.js";
import {
  assertEndpointConsistentWithProfile,
  isMainnetNetwork,
  KNOWN_MAINNET_CHAIN_IDS
} from "./network-guard.js";

export function listL2Profiles(
  userProfiles?: Record<string, L2UserNetworkConfig>
): L2NetworkProfile[] {
  const profiles: L2NetworkProfile[] = [...BUILTIN_L2_PROFILES];

  if (userProfiles) {
    for (const [name, config] of Object.entries(userProfiles)) {
      const existingIndex = profiles.findIndex((p) => p.name === name);
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

function assertNotAmbiguous(
  name: string,
  userProfiles?: Record<string, L2UserNetworkConfig>
): void {
  const candidates = AMBIGUOUS_L2_PROFILE_NAMES[name];
  // A user-defined profile with that exact name is explicit (its chain ID decides the guard).
  if (candidates && !(userProfiles && name in userProfiles)) {
    throw new L2SafetyError(
      "L2_PROFILE_AMBIGUOUS",
      `L2 profile name '${name}' is ambiguous. Choose one explicitly: ${candidates.join(", ")} (or 'local' for Anvil).`,
      { name, candidates }
    );
  }
}

export function getL2Profile(
  name: string,
  userProfiles?: Record<string, L2UserNetworkConfig>
): L2NetworkProfile | null {
  assertNotAmbiguous(name, userProfiles);
  return listL2Profiles(userProfiles).find((p) => p.name === name) || null;
}

export function resolveL2Profile(args: {
  name?: string | undefined;
  userProfiles?: Record<string, L2UserNetworkConfig> | undefined;
  cliOverrides?:
    | {
        url?: string | undefined;
        rpcUrl?: string | undefined;
        chainId?: number | string | undefined;
        [key: string]: unknown;
      }
    | undefined;
}): L2NetworkProfile {
  // No name -> the local profile. A missing name must never select a remote or mainnet network.
  const name = args.name || DEFAULT_L2_PROFILE_NAME;
  const profile = getL2Profile(name, args.userProfiles);

  if (!profile) {
    const available = listL2Profiles(args.userProfiles)
      .map((p) => `${p.name} (${p.source})`)
      .join(", ");
    throw new Error(`L2 profile '${name}' not found. Available profiles: ${available}`);
  }

  if (
    args.cliOverrides?.rpcUrl &&
    args.cliOverrides?.url &&
    args.cliOverrides.rpcUrl !== args.cliOverrides.url
  ) {
    throw new Error("Conflict: Both --rpc-url and --url provided with different values.");
  }
  const urlOverride = args.cliOverrides?.rpcUrl || args.cliOverrides?.url;

  let chainId = profile.chainId;
  if (args.cliOverrides?.chainId !== undefined) {
    const overridden = parseUserChainId(args.cliOverrides.chainId, "--chain-id");
    if (profile.chainId !== undefined && overridden !== profile.chainId) {
      // A chain ID override must not silently re-point a profile to another network.
      throw new L2SafetyError(
        "L2_CHAIN_ID_MISMATCH",
        `--chain-id ${overridden} conflicts with profile '${profile.name}' (chain ID ${profile.chainId}). ` +
          "Define a separate profile in hardkas.config instead.",
        { profile: profile.name, expected: profile.chainId, actual: overridden }
      );
    }
    chainId = overridden;
  }

  const resolved: L2NetworkProfile = {
    ...profile,
    ...(urlOverride ? { rpcUrl: urlOverride, endpoint: { status: "user-supplied" as const } } : {}),
    ...(chainId !== undefined ? { chainId } : {})
  };

  if (resolved.rpcUrl) {
    assertEndpointConsistentWithProfile(resolved, resolved.rpcUrl);
  }

  return assertValidL2Profile(resolved);
}

function mapUserConfigToProfile(
  name: string,
  config: L2UserNetworkConfig
): L2NetworkProfile {
  const bridgePhase = config.bridgePhase || "pre-zk";
  const trustlessExit = config.trustlessExit ?? false;

  // Known mainnet chain IDs are mainnet whatever the config says.
  const environment: L2NetworkEnvironment = isMainnetNetwork(config.chainId)
    ? "mainnet"
    : (config.environment ?? "unknown");

  return {
    schema: "hardkas.l2Profile.v1",
    hardkasVersion: HARDKAS_VERSION,
    source: "user-config",
    name,
    displayName: name,
    type: "evm-based-rollup",
    family: config.kind === "igra" ? "igra" : "custom",
    environment,
    settlementLayer: "kaspa",
    executionLayer: "evm",
    gasToken:
      config.nativeCurrency?.symbol ||
      (config.kind === "igra" || !config.kind ? "iKAS" : "ETH"),
    nativeTokenDecimals: config.nativeCurrency?.decimals || 18,
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    ...(config.explorerUrl ? { explorerUrl: config.explorerUrl } : {}),
    endpoint: { status: "user-supplied" },
    writePolicy:
      environment === "mainnet"
        ? "requires-explicit-mainnet-authorization"
        : environment === "deprecated"
          ? "disabled"
          : "allowed",
    ...(config.feePolicy ? { feePolicy: config.feePolicy } : {}),
    security: {
      bridgePhase,
      trustlessExit,
      custodyModel: "User-defined bridge custody.",
      riskProfile: "unknown",
      notes: ["User-defined network from config"]
    }
  } as L2NetworkProfile;
}

const ENVIRONMENTS = ["local", "testnet", "mainnet", "deprecated", "unknown"];
const WRITE_POLICIES = ["allowed", "requires-explicit-mainnet-authorization", "disabled"];

export function validateL2Profile(profile: any): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!profile || typeof profile !== "object") {
    return { ok: false, errors: ["Profile must be an object"] };
  }

  if (profile.schema !== "hardkas.l2Profile.v1") {
    errors.push(
      `Invalid schema: expected 'hardkas.l2Profile.v1', got '${profile.schema}'`
    );
  }

  if (profile.chainId !== undefined) {
    if (!Number.isSafeInteger(profile.chainId) || profile.chainId <= 0) {
      errors.push(`Invalid chainId: ${String(profile.chainId)}`);
    }
  }

  if (!ENVIRONMENTS.includes(profile.environment)) {
    errors.push(`Invalid environment: ${String(profile.environment)}`);
  }
  if (!WRITE_POLICIES.includes(profile.writePolicy)) {
    errors.push(`Invalid writePolicy: ${String(profile.writePolicy)}`);
  }

  const mainnet =
    profile.environment === "mainnet" ||
    (typeof profile.chainId === "number" && KNOWN_MAINNET_CHAIN_IDS.has(profile.chainId));
  if (mainnet && profile.environment !== "mainnet") {
    errors.push(
      `Security invariant violation: chain ID ${profile.chainId} is a mainnet but environment is '${profile.environment}'.`
    );
  }
  if (mainnet && profile.writePolicy === "allowed") {
    errors.push(
      "Security invariant violation: a mainnet profile cannot have writePolicy 'allowed'."
    );
  }

  if (profile.security) {
    if (
      profile.security.bridgePhase !== "zk" &&
      profile.security.trustlessExit === true
    ) {
      errors.push(
        `Security invariant violation: trustlessExit=true is only allowed when bridgePhase='zk'. Current phase: ${profile.security.bridgePhase}`
      );
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
    throw new L2SafetyError(
      "L2_PROFILE_INVALID",
      `Invalid L2 profile:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
      { errors }
    );
  }
  return profile as L2NetworkProfile;
}
