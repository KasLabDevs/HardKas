import { L2SafetyError } from "./errors.js";

const HEX_QUANTITY = /^0x(0|[1-9a-fA-F][0-9a-fA-F]*)$/;
const HEX_QUANTITY_LENIENT_ZEROS = /^0x[0-9a-fA-F]+$/;

/**
 * Strict JSON-RPC QUANTITY parser. Accepts only a 0x-prefixed hex string
 * (leading zeros tolerated, since some nodes emit them). Rejects numbers, empty "0x", NaN-producing
 * input, signs, whitespace and trailing garbage.
 */
export function parseHexQuantity(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !HEX_QUANTITY_LENIENT_ZEROS.test(value)) {
    throw new L2SafetyError(
      "L2_RPC_RESPONSE_INVALID",
      `Invalid hex quantity for ${field}: ${JSON.stringify(value)}`,
      { field, value }
    );
  }
  return BigInt(value);
}

export function isCanonicalHexQuantity(value: unknown): value is string {
  return typeof value === "string" && HEX_QUANTITY.test(value);
}

/**
 * Strict eth_chainId parser: a hex QUANTITY, > 0 and <= Number.MAX_SAFE_INTEGER.
 */
export function parseChainIdHex(value: unknown): number {
  if (typeof value !== "string" || !HEX_QUANTITY_LENIENT_ZEROS.test(value)) {
    throw new L2SafetyError(
      "L2_CHAIN_ID_INVALID",
      `RPC returned an invalid chain ID: ${JSON.stringify(value)} (expected a 0x-prefixed hex quantity).`,
      { value }
    );
  }
  const big = BigInt(value);
  if (big <= 0n || big > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new L2SafetyError("L2_CHAIN_ID_INVALID", `RPC returned an out-of-range chain ID: ${value}.`, {
      value
    });
  }
  return Number(big);
}

/** Validates a chain ID supplied by code or config. */
export function assertValidChainId(value: unknown, field = "chainId"): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new L2SafetyError("L2_CHAIN_ID_INVALID", `Invalid ${field}: ${JSON.stringify(value)}.`, {
      field,
      value
    });
  }
  return value;
}

/** Parses a user/CLI chain ID ("38836" or "0x97b4"). Rejects partial parses like "38836abc". */
export function parseUserChainId(value: unknown, field = "chainId"): number {
  if (typeof value === "number") return assertValidChainId(value, field);
  if (typeof value === "string") {
    if (/^[0-9]+$/.test(value)) return assertValidChainId(Number(value), field);
    if (HEX_QUANTITY_LENIENT_ZEROS.test(value)) return parseChainIdHex(value);
  }
  throw new L2SafetyError("L2_CHAIN_ID_INVALID", `Invalid ${field}: ${JSON.stringify(value)}.`, {
    field,
    value
  });
}

export function isHash32(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}
