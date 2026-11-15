/*
 * R3-C · the lossless JSON reading and the canonical text that HardKAS compares "what a signer was sent" with "what it
 * returned" by. Shared by the PSKT returned-payload check (pskt/signed-payload-check.ts, Node) and the browser wallet
 * check (wallets/signed-transaction-check.ts, which a page loads): BROWSER-SAFE, no import at all, no Node global.
 */

/** Marks a JSON number kept as its literal text by {@link parseJsonKeepingNumbers}. */
export const NUMBER_MARK = "\u0000#";

/** JSON.parse that keeps every number as its literal text (amounts and sequences are u64; a double rounds them). */
export function parseJsonKeepingNumbers(text: string): unknown {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i]!;
    if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "-" || (c >= "0" && c <= "9")) {
      let j = i + 1;
      while (j < n && /[0-9eE.+-]/.test(text[j]!)) j++;
      out += JSON.stringify(NUMBER_MARK + text.slice(i, j));
      i = j;
    } else {
      out += c;
      i++;
    }
  }
  return JSON.parse(out);
}

/** A canonical text of a value: keys sorted, null and absent alike, hex lower-cased, numbers normalized. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") {
    if (value.startsWith(NUMBER_MARK)) {
      const literal = value.slice(NUMBER_MARK.length);
      return "#" + (/^-?\d+$/.test(literal) ? BigInt(literal).toString() : literal);
    }
    return JSON.stringify(/^[0-9a-fA-F]+$/.test(value) ? value.toLowerCase() : value);
  }
  if (typeof value === "bigint") return "#" + value.toString();
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [/^[0-9a-fA-F]+$/.test(k) ? k.toLowerCase() : k, v] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** A 64-byte Schnorr signature as hex: 128 hex characters, not all zeros (an empty or zeroed one is no signature). */
export function isSchnorrSignatureHex(hex: unknown): boolean {
  return typeof hex === "string" && /^[0-9a-fA-F]{128}$/.test(hex) && !/^0+$/.test(hex);
}
