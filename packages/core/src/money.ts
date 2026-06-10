export const SOMPI_PER_KAS = 100_000_000n;

/**
 * Parses a KAS decimal string (e.g. "1.234") into Sompi (bigint).
 * If a bigint is provided, it is assumed to be an already-parsed sompi amount.
 *
 * Rules:
 * - string input = decimal KAS
 * - bigint input = already sompi
 * - format input = sompi
 * - no floats
 * - no Number decimal
 * - no silent rounding
 *
 * @param input The KAS amount as a decimal string, or sompi as a bigint.
 * @returns The sompi amount as a bigint.
 */
export function parseKasToSompi(input: string | bigint | number): bigint {
  if (typeof input === "bigint") {
    if (input < 0n) {
      throw new Error("KAS_AMOUNT_NEGATIVE: negative money not allowed");
    }
    return input;
  }

  // Temporary compat: If existing public APIs accept number, we must safely handle it
  if (typeof input === "number") {
    if (!Number.isSafeInteger(input)) {
      throw new Error(
        "KAS_AMOUNT_UNSAFE_NUMBER: floats or unsafe numbers are forbidden for monetary paths. Pass a string for KAS or bigint for Sompi."
      );
    }
    if (input < 0) {
      throw new Error("KAS_AMOUNT_NEGATIVE: negative money not allowed");
    }
    // Deprecated compatibility: Treat safe integer as sompi (never as KAS decimal).
    return BigInt(input);
  }

  if (typeof input !== "string") {
    throw new Error("INVALID_KAS_AMOUNT: amount must be a string or bigint");
  }

  let cleaned = input.trim();

  if (cleaned.startsWith("-")) {
    throw new Error("KAS_AMOUNT_NEGATIVE: negative money not allowed");
  }

  if (cleaned.startsWith("+")) {
    // Explicitly reject +1 unless decided otherwise. The rules say: '"+1" salvo decisión explícita'. We reject.
    throw new Error("INVALID_KAS_AMOUNT: explicit positive sign not supported");
  }

  if (cleaned.toLowerCase().includes("e")) {
    throw new Error(
      "KAS_AMOUNT_SCIENTIFIC_NOTATION_UNSUPPORTED: scientific notation is not supported"
    );
  }

  // Remove KAS suffix safely if it exists (e.g., "100 KAS")
  if (cleaned.toUpperCase().endsWith("KAS")) {
    cleaned = cleaned.slice(0, -3).trim();
  }

  if (!/^[0-9]+(\.[0-9]+)?$/.test(cleaned)) {
    throw new Error(`INVALID_KAS_AMOUNT: invalid characters or format in '${input}'`);
  }

  const parts = cleaned.split(".");
  const integerPart = parts[0];
  let fractionalPart = parts[1] || "";

  if (fractionalPart.length > 8) {
    throw new Error(
      `KAS_AMOUNT_TOO_MANY_DECIMALS: too many decimal places in '${input}'`
    );
  }

  fractionalPart = fractionalPart.padEnd(8, "0");
  return BigInt(integerPart + fractionalPart);
}

/**
 * Formats a sompi amount into a KAS decimal string.
 * @param sompi The sompi amount as a bigint or string representation of a bigint.
 * @returns The KAS amount as a string.
 */
export function formatSompiToKas(sompi: bigint | string): string {
  let s: bigint;
  try {
    s = BigInt(sompi);
  } catch (e) {
    throw new Error("INVALID_KAS_AMOUNT: invalid sompi format");
  }

  if (s < 0n) {
    throw new Error("SOMPI_AMOUNT_NEGATIVE: negative sompi amounts are not supported");
  }

  const str = s.toString().padStart(9, "0");
  const intPart = str.slice(0, -8);
  let fracPart = str.slice(-8);

  // Trim trailing zeros from fractional part
  fracPart = fracPart.replace(/0+$/, "");

  if (fracPart.length > 0) {
    return `${intPart}.${fracPart}`;
  }
  return intPart;
}

/**
 * Formats a signed sompi amount into a KAS decimal string.
 * This is meant ONLY for reporting deltas, audit statements, or rendering logic.
 * It is NOT intended for validating spendable balances or user input amounts.
 * @param sompi The sompi amount as a signed bigint or string representation of a bigint.
 * @returns The KAS amount as a string (with a leading '-' if negative).
 */
export function formatSignedSompiToKas(sompi: bigint | string): string {
  let s: bigint;
  try {
    s = BigInt(sompi);
  } catch (e) {
    throw new Error("INVALID_KAS_AMOUNT: invalid sompi format");
  }

  if (s < 0n) {
    return `-${formatSompiToKas(-s)}`;
  }
  return formatSompiToKas(s);
}
