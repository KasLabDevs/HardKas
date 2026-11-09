const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATOR = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];

function polymod(values: number[]): bigint {
  let c = 1n;
  for (const v of values) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(v);
    if (c0 & 1n) c ^= GENERATOR[0]!;
    if (c0 & 2n) c ^= GENERATOR[1]!;
    if (c0 & 4n) c ^= GENERATOR[2]!;
    if (c0 & 8n) c ^= GENERATOR[3]!;
    if (c0 & 16n) c ^= GENERATOR[4]!;
  }
  return c ^ 1n;
}

function prefixExpand(prefix: string): number[] {
  const res: number[] = [];
  for (let i = 0; i < prefix.length; i++) {
    res.push(prefix.charCodeAt(i) & 0x1f);
  }
  res.push(0);
  return res;
}

function convertBits(data: Uint8Array | number[], fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  const maxAcc = (1 << (fromBits + toBits - 1)) - 1;

  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) {
      throw new Error(`Invalid value: ${value}`);
    }
    acc = ((acc << fromBits) | value) & maxAcc;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }

  if (pad) {
    if (bits > 0) {
      ret.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv) !== 0) {
    throw new Error("Invalid padding");
  }

  return ret;
}

/**
 * Encodes a Kaspa address: prefix + version byte + payload (32 bytes x-only pubkey or script hash).
 * Version 0 = Schnorr P2PK, Version 8 = P2SH.
 */
export function encodeKaspaAddress(prefix: string, version: number, payload: Uint8Array): string {
  const versionedPayload = [version, ...payload];
  const payload5Bit = convertBits(versionedPayload, 8, 5, true);
  
  const prefixExpanded = prefixExpand(prefix);
  // Kaspa address checksum has 8 characters (40 bits: 8 * 5 bits)
  const checksumInput = prefixExpanded.concat(payload5Bit).concat([0, 0, 0, 0, 0, 0, 0, 0]);
  const poly = polymod(checksumInput);

  const checksum: number[] = [];
  for (let i = 7; i >= 0; i--) {
    checksum.push(Number((poly >> BigInt(5 * i)) & 0x1fn));
  }

  const combined = payload5Bit.concat(checksum);
  let result = `${prefix}:`;
  for (const v of combined) {
    result += CHARSET[v];
  }
  return result;
}

/**
 * Decodes and validates a Kaspa Bech32 address.
 */
export function decodeKaspaAddress(address: string): { prefix: string; version: number; payload: Uint8Array } | undefined {
  if (typeof address !== "string") return undefined;
  const sep = address.lastIndexOf(":");
  if (sep <= 0) return undefined;

  const prefix = address.slice(0, sep).toLowerCase();
  const data = address.slice(sep + 1).toLowerCase();
  if (data.length < 9) return undefined;

  const values: number[] = [];
  for (const ch of data) {
    const v = CHARSET.indexOf(ch);
    if (v < 0) return undefined;
    values.push(v);
  }

  // Verify checksum
  const prefixExpanded = prefixExpand(prefix);
  const poly = polymod(prefixExpanded.concat(values));
  if (poly !== 0n) return undefined;

  // Last 8 characters are checksum
  const payload5Bit = values.slice(0, values.length - 8);
  const converted = convertBits(payload5Bit, 5, 8, false);
  if (converted.length < 2) return undefined;

  const version = converted[0]!;
  const payload = Uint8Array.from(converted.slice(1));

  return { prefix, version, payload };
}
