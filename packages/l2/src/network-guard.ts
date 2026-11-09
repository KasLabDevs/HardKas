import { EvmSignerChainMismatchError, L2SafetyError } from "./errors.js";
import { assertValidChainId } from "./hex.js";
import {
  BUILTIN_L2_PROFILES,
  type L2FeePolicy,
  type L2NetworkProfile
} from "./profiles.js";

/**
 * Chain IDs that are always treated as mainnet, whatever the profile is called.
 * 1 = Ethereum mainnet, 38833 = Igra mainnet.
 */
export const KNOWN_MAINNET_CHAIN_IDS: ReadonlySet<number> = new Set([1, 38833]);

/**
 * A network is mainnet if its chain ID is a known mainnet, if the profile says so, or if a
 * built-in mainnet profile uses that chain ID. The profile NAME never matters.
 */
export function isMainnetNetwork(
  chainId: number | undefined,
  profile?: L2NetworkProfile | undefined
): boolean {
  if (profile?.environment === "mainnet") return true;
  if (chainId === undefined) return false;
  if (KNOWN_MAINNET_CHAIN_IDS.has(chainId)) return true;
  return BUILTIN_L2_PROFILES.some((p) => p.environment === "mainnet" && p.chainId === chainId);
}

export interface L2WriteGuardInput {
  /** The chain ID the transaction is (or will be) signed for. */
  readonly chainId: number;
  readonly profile?: L2NetworkProfile | undefined;
  /** Must be exactly `true` to sign/broadcast on mainnet. Never inferred. */
  readonly allowMainnet?: boolean | undefined;
  /** Human-readable operation, for the error message. */
  readonly operation: string;
}

/**
 * Single write gate shared by the SDK (prepare/sign/send/deploy/write) and the CLI
 * (l2 tx build/sign/send). Throws on:
 * - invalid chain ID,
 * - profile write policy "disabled",
 * - chain ID different from the profile's,
 * - mainnet without `allowMainnet === true`.
 */
export function assertL2WriteAllowed(input: L2WriteGuardInput): void {
  const chainId = assertValidChainId(input.chainId);
  const { profile } = input;

  if (profile?.writePolicy === "disabled") {
    throw new L2SafetyError(
      "L2_WRITE_DISABLED",
      `${input.operation} refused: profile '${profile.name}' does not allow signing or broadcasting.`,
      { profile: profile.name, chainId }
    );
  }

  if (profile?.chainId !== undefined && profile.chainId !== chainId) {
    throw new L2SafetyError(
      "L2_CHAIN_ID_MISMATCH",
      `${input.operation} refused: transaction chain ID ${chainId} differs from profile '${profile.name}' chain ID ${profile.chainId}.`,
      { profile: profile.name, expected: profile.chainId, actual: chainId }
    );
  }

  // MAINNET TOTAL LOCKDOWN (owner decision 2026-11-09, @hardkas/core mainnet-policy): an L2 mainnet (Igra mainnet settles
  // on Kaspa mainnet) is never signed for or broadcast to. `allowMainnet: true` / `--allow-mainnet` no longer authorize
  // it: they are kept for compatibility and have no effect.
  if (isMainnetNetwork(chainId, profile)) {
    throw new L2SafetyError(
      "L2_MAINNET_WRITE_BLOCKED",
      `${input.operation} refused: chain ID ${chainId} is a MAINNET network` +
        (profile ? ` (profile '${profile.name}')` : "") +
        ". Mainnet is locked down in HardKAS (no signature, no broadcast, no connection); allowMainnet / --allow-mainnet " +
        "have no effect. Use a local or test network.",
      { chainId, profile: profile?.name, allowMainnetIgnored: input.allowMainnet === true }
    );
  }
}

/**
 * MAINNET TOTAL LOCKDOWN · the read side of the L2 guard: an L2 RPC client bound to a mainnet profile or chain never
 * sends a request (MAINNET_CONNECTION_DISABLED, nothing contacted); an `eth_chainId` answer naming a mainnet chain
 * ends the client (see EvmJsonRpcClient).
 */
export function assertL2ConnectionAllowed(input: { chainId?: number | undefined; profile?: L2NetworkProfile | undefined; operation: string }): void {
  if (!isMainnetNetwork(input.chainId, input.profile)) return;
  throw new L2SafetyError(
    "MAINNET_CONNECTION_DISABLED",
    `${input.operation} refused: chain ID ${input.chainId ?? "?"}` +
      (input.profile ? ` (profile '${input.profile.name}')` : "") +
      " is a MAINNET network. Mainnet connections are disabled in HardKAS, reads included; no flag, option or configuration " +
      "enables them (allowMainnet included). Nothing was contacted.",
    { chainId: input.chainId, profile: input.profile?.name }
  );
}

export function assertChainIdMatches(expected: number, actual: number): void {
  if (expected !== actual) {
    throw new EvmSignerChainMismatchError(expected, actual);
  }
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function isLoopbackUrl(url: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** A local-environment profile must point to a loopback endpoint. */
export function assertEndpointConsistentWithProfile(profile: L2NetworkProfile, url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new L2SafetyError("L2_ENDPOINT_MISMATCH", `Invalid RPC URL: ${url}`, { url });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new L2SafetyError(
      "L2_ENDPOINT_MISMATCH",
      `Unsupported RPC URL scheme '${parsed.protocol}' (expected http or https).`,
      { url }
    );
  }
  if (profile.environment === "local" && !isLoopbackUrl(url)) {
    throw new L2SafetyError(
      "L2_ENDPOINT_MISMATCH",
      `Profile '${profile.name}' is a local network but the RPC URL ${url} is not a loopback address.`,
      { profile: profile.name, url }
    );
  }
}

// ---------------------------------------------------------------------------
// Fee ceilings
// ---------------------------------------------------------------------------

export interface L2FeeLimits {
  readonly maxGasLimit: bigint;
  readonly maxFeePerGasWei: bigint;
  readonly maxTotalFeeWei: bigint;
}

export type L2FeeLimitsInput = Partial<Record<keyof L2FeeLimits, bigint | string>>;

function parsePositiveIntegerLimit(value: bigint | string, field: string): bigint {
  let v: bigint;
  if (typeof value === "bigint") v = value;
  else if (typeof value === "string" && /^[0-9]+$/.test(value)) v = BigInt(value);
  else
    throw new L2SafetyError("L2_FEE_POLICY_REQUIRED", `Invalid fee limit ${field}: ${String(value)}.`, {
      field
    });
  if (v <= 0n) {
    throw new L2SafetyError("L2_FEE_POLICY_REQUIRED", `Fee limit ${field} must be > 0.`, { field });
  }
  return v;
}

/**
 * Resolves fee ceilings: explicit values override the profile's policy field by field.
 * If any ceiling is still missing, signing is refused (no silent default for value-bearing networks).
 */
export function resolveFeeLimits(
  explicit: L2FeeLimitsInput | undefined,
  profilePolicy: L2FeePolicy | undefined
): L2FeeLimits {
  const pick = (k: keyof L2FeeLimits): bigint => {
    const raw = explicit?.[k] ?? profilePolicy?.[k];
    if (raw === undefined) {
      throw new L2SafetyError(
        "L2_FEE_POLICY_REQUIRED",
        `No fee ceiling '${k}' configured. Supply feeLimits (SDK) or --max-gas-limit/--max-fee-per-gas/--max-total-fee (CLI); ` +
          "only the local profile ships default ceilings.",
        { missing: k }
      );
    }
    return parsePositiveIntegerLimit(raw, k);
  };
  return {
    maxGasLimit: pick("maxGasLimit"),
    maxFeePerGasWei: pick("maxFeePerGasWei"),
    maxTotalFeeWei: pick("maxTotalFeeWei")
  };
}

export interface L2FeeCheckInput {
  readonly gasLimit: bigint;
  /** EIP-1559 maxFeePerGas or legacy gasPrice. */
  readonly feePerGasWei: bigint;
  readonly maxPriorityFeePerGasWei?: bigint | undefined;
}

export function assertFeeWithinLimits(tx: L2FeeCheckInput, limits: L2FeeLimits): void {
  if (tx.gasLimit <= 0n) {
    throw new L2SafetyError("L2_INVALID_TX_PARAMS", `gasLimit must be > 0 (got ${tx.gasLimit}).`);
  }
  if (tx.feePerGasWei < 0n || (tx.maxPriorityFeePerGasWei ?? 0n) < 0n) {
    throw new L2SafetyError("L2_INVALID_TX_PARAMS", "Fee values must be non-negative.");
  }
  if (tx.maxPriorityFeePerGasWei !== undefined && tx.maxPriorityFeePerGasWei > tx.feePerGasWei) {
    throw new L2SafetyError(
      "L2_INVALID_TX_PARAMS",
      `maxPriorityFeePerGas (${tx.maxPriorityFeePerGasWei}) exceeds maxFeePerGas (${tx.feePerGasWei}).`
    );
  }
  if (tx.gasLimit > limits.maxGasLimit) {
    throw new L2SafetyError(
      "L2_FEE_LIMIT_EXCEEDED",
      `gasLimit ${tx.gasLimit} exceeds the ceiling ${limits.maxGasLimit}.`,
      { gasLimit: tx.gasLimit.toString(), maxGasLimit: limits.maxGasLimit.toString() }
    );
  }
  if (tx.feePerGasWei > limits.maxFeePerGasWei) {
    throw new L2SafetyError(
      "L2_FEE_LIMIT_EXCEEDED",
      `fee per gas ${tx.feePerGasWei} wei exceeds the ceiling ${limits.maxFeePerGasWei} wei.`,
      { feePerGasWei: tx.feePerGasWei.toString(), maxFeePerGasWei: limits.maxFeePerGasWei.toString() }
    );
  }
  const total = tx.gasLimit * tx.feePerGasWei;
  if (total > limits.maxTotalFeeWei) {
    throw new L2SafetyError(
      "L2_FEE_LIMIT_EXCEEDED",
      `worst-case fee ${total} wei exceeds the ceiling ${limits.maxTotalFeeWei} wei.`,
      { totalFeeWei: total.toString(), maxTotalFeeWei: limits.maxTotalFeeWei.toString() }
    );
  }
}
