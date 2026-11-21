/**
 * BETA-FIX · an HTTP body's `amountSompi`, read exactly or not at all. A whole number of sompi is accepted as a string of
 * decimal digits, or as a JSON number whose value is a whole number a double holds exactly (0 … 2^53 - 1; `1e3` is 1000).
 * Anything else is refused by the caller: a fraction, a negative, a string that is not plain digits, and a JSON number
 * past 2^53 - 1 — which JSON.parse has already rounded, so `String(value)` would hand the planner a different amount than
 * the client sent, without a word.
 *
 * The amount always goes to the SDK as a bigint: `sdk.tx.plan` reads a string as KAS and a number as KAS (L1-11), so a
 * string of sompi passed through unchanged would plan 10^8 times the amount.
 */
export function exactSompiOf(value: unknown): bigint | undefined {
  if (typeof value === "string") return /^[0-9]+$/.test(value) ? BigInt(value) : undefined;
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : undefined;
  return undefined;
}

/** The refusal's text, the same on every route. */
export const AMOUNT_SOMPI_RULE =
  "amountSompi must be a whole number of sompi: a string of decimal digits, or a JSON number up to 2^53 - 1 (a larger JSON number is already rounded by the time it is read: send it as a string)";
