import { parseTransaction } from "viem";
import { type L2NetworkProfile } from "./profiles.js";
import { getL2Profile } from "./registry.js";
import { EvmSignerChainMismatchError, L2SafetyError } from "./errors.js";
import { assertValidChainId } from "./hex.js";
import {
  assertFeeWithinLimits,
  assertL2WriteAllowed,
  resolveFeeLimits,
  type L2FeeLimits,
  type L2FeeLimitsInput
} from "./network-guard.js";

/**
 * Options shared by every operation that signs or broadcasts.
 * The chain is ALWAYS bound: from `expectedChainId`, the `profile`, or the client's binding.
 */
export interface L2WriteOptions {
  readonly expectedChainId?: number | undefined;
  readonly profile?: L2NetworkProfile | string | undefined;
  /** Must be exactly `true` to sign or broadcast on a mainnet chain. `--yes`-style confirmations do not count. */
  readonly allowMainnet?: boolean | undefined;
  /** Fee ceilings; override the profile's feePolicy field by field. Required when the profile has none. */
  readonly feeLimits?: L2FeeLimitsInput | undefined;
}

/** The chain binding of an RPC client (kept structural so this module does not import the client). */
export interface L2ChainBindingSource {
  readonly profile?: L2NetworkProfile | undefined;
  readonly expectedChainId?: number | undefined;
}

export interface ResolvedBinding {
  readonly expectedChainId: number;
  readonly profile?: L2NetworkProfile | undefined;
}

function resolveProfile(p: L2NetworkProfile | string | undefined): L2NetworkProfile | undefined {
  if (p === undefined) return undefined;
  if (typeof p !== "string") return p;
  const found = getL2Profile(p);
  if (!found) throw new Error(`Unknown L2 network profile: "${p}".`);
  return found;
}

export function resolveBinding(
  options: L2WriteOptions,
  client?: L2ChainBindingSource | undefined
): ResolvedBinding {
  const profile = resolveProfile(options.profile) ?? client?.profile;
  const candidates = [options.expectedChainId, client?.expectedChainId, profile?.chainId].filter(
    (v): v is number => v !== undefined
  );
  if (candidates.length === 0) {
    throw new L2SafetyError(
      "L2_CHAIN_ID_REQUIRED",
      "Signing/broadcasting requires a bound chain ID. Pass `profile` or `expectedChainId` (or build the client with one). " +
        "HardKAS never takes the chain ID from the RPC alone."
    );
  }
  const expectedChainId = assertValidChainId(candidates[0]);
  for (const c of candidates) {
    if (c !== expectedChainId) throw new EvmSignerChainMismatchError(expectedChainId, c);
  }
  return { expectedChainId, profile };
}

/**
 * Decodes a signed raw transaction and checks it against the bound chain and the write guard.
 * Returns the decoded chain ID.
 */
export function assertRawTransactionAllowed(
  rawTransaction: string,
  options: L2WriteOptions & { readonly operation?: string | undefined },
  client?: L2ChainBindingSource | undefined
): { chainId: number; profile?: L2NetworkProfile | undefined } {
  if (options === null || typeof options !== "object") {
    throw new L2SafetyError(
      "L2_INVALID_TX_PARAMS",
      "Broadcasting requires write options (profile/expectedChainId, allowMainnet, feeLimits); none were passed."
    );
  }
  // Strict hex before decoding, so a malformed payload is always this typed local refusal,
  // whatever the decoder does with it, and never reaches the transport.
  if (typeof rawTransaction !== "string" || !/^0x([0-9a-fA-F]{2})+$/.test(rawTransaction)) {
    throw new L2SafetyError(
      "L2_INVALID_TX_PARAMS",
      "Raw transaction must be a 0x-prefixed, non-empty, even-length hex string."
    );
  }
  const { expectedChainId, profile } = resolveBinding(options, client);
  let decoded: ReturnType<typeof parseTransaction>;
  try {
    decoded = parseTransaction(rawTransaction as `0x${string}`);
  } catch (e) {
    throw new L2SafetyError(
      "L2_SIGNED_TX_MISMATCH",
      `Raw transaction cannot be decoded: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (decoded.chainId === undefined) {
    throw new L2SafetyError(
      "L2_SIGNED_TX_MISMATCH",
      "Raw transaction has no chain ID (pre-EIP-155 replayable signature); refusing to broadcast."
    );
  }
  if (decoded.chainId !== expectedChainId) {
    throw new L2SafetyError(
      "L2_SIGNED_TX_MISMATCH",
      `Raw transaction is signed for chain ${decoded.chainId}, but the operation is bound to chain ${expectedChainId}.`,
      { signedChainId: decoded.chainId, expectedChainId }
    );
  }
  // Only the types this SDK produces: their fee fields are fully covered by the ceilings below
  // (eip4844 blob fees and eip7702 authorizations are not).
  if (decoded.type !== "legacy" && decoded.type !== "eip2930" && decoded.type !== "eip1559") {
    throw new L2SafetyError(
      "L2_SIGNED_TX_MISMATCH",
      `Raw transaction type "${String(decoded.type)}" is not supported for broadcast; fee ceilings cannot be enforced on it.`
    );
  }
  assertL2WriteAllowed({
    chainId: decoded.chainId,
    profile,
    allowMainnet: options.allowMainnet,
    operation: options.operation ?? "broadcast"
  });

  // Fee ceilings are re-checked on the raw transaction: it may have been signed elsewhere.
  // No ceilings available (profile without feePolicy, none passed) -> L2_FEE_POLICY_REQUIRED.
  const limits: L2FeeLimits = resolveFeeLimits(options.feeLimits, profile?.feePolicy);
  if (decoded.gas === undefined) {
    throw new L2SafetyError("L2_SIGNED_TX_MISMATCH", "Raw transaction has no gas limit.");
  }
  assertFeeWithinLimits(
    decoded.type === "eip1559"
      ? {
          gasLimit: decoded.gas,
          feePerGasWei: decoded.maxFeePerGas ?? 0n,
          maxPriorityFeePerGasWei: decoded.maxPriorityFeePerGas
        }
      : { gasLimit: decoded.gas, feePerGasWei: decoded.gasPrice ?? 0n },
    limits
  );
  return { chainId: decoded.chainId, profile };
}
