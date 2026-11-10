import { describe, it, expect } from "vitest";
import { encodeKaspaAddress, decodeKaspaAddress } from "../src/index.js";

describe("Kaspa Bech32 Address Encoding & Decoding", () => {
  it("encodes and decodes standard P2PK 32-byte Schnorr address", () => {
    const payload = new Uint8Array(32);
    payload.fill(0x42);

    const addr = encodeKaspaAddress("kaspasim", 0, payload);
    expect(addr.startsWith("kaspasim:q")).toBe(true);

    const decoded = decodeKaspaAddress(addr);
    expect(decoded).toBeDefined();
    expect(decoded!.prefix).toBe("kaspasim");
    expect(decoded!.version).toBe(0);
    expect(Array.from(decoded!.payload)).toEqual(Array.from(payload));
  });

  it("encodes and decodes for mainnet and testnet prefixes", () => {
    const payload = new Uint8Array(32);
    for (let i = 0; i < 32; i++) payload[i] = i;

    const mainnetAddr = encodeKaspaAddress("kaspa", 0, payload);
    expect(mainnetAddr.startsWith("kaspa:q")).toBe(true);

    const testnetAddr = encodeKaspaAddress("kaspatest", 0, payload);
    expect(testnetAddr.startsWith("kaspatest:q")).toBe(true);

    const decodedMain = decodeKaspaAddress(mainnetAddr);
    expect(decodedMain!.prefix).toBe("kaspa");
    expect(Array.from(decodedMain!.payload)).toEqual(Array.from(payload));

    const decodedTest = decodeKaspaAddress(testnetAddr);
    expect(decodedTest!.prefix).toBe("kaspatest");
    expect(Array.from(decodedTest!.payload)).toEqual(Array.from(payload));
  });

  it("rejects addresses with invalid checksums", () => {
    const payload = new Uint8Array(32);
    const valid = encodeKaspaAddress("kaspasim", 0, payload);

    // Tamper with one character in the checksum
    const lastChar = valid.slice(-1);
    const tamperedChar = lastChar === "q" ? "p" : "q";
    const corrupted = valid.slice(0, -1) + tamperedChar;

    const decoded = decodeKaspaAddress(corrupted);
    expect(decoded).toBeUndefined();
  });

  it("rejects malformed address strings", () => {
    expect(decodeKaspaAddress("")).toBeUndefined();
    expect(decodeKaspaAddress("no-colon-here")).toBeUndefined();
    expect(decodeKaspaAddress("kaspasim:1234")).toBeUndefined();
  });
});
