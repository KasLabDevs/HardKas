import { describe, it, expect } from "vitest";
import { kcc1Hash, kcc20OwnerKeyMatches, kccBytes, kccHex } from "../src/index.js";

// R3-A3 · kcc20OwnerKeyMatches: whether a KCC20State's owner is a given x-only key — p2pk-schnorr/v1 (0x00) by the key
// itself, p2pkh-schnorr/v1 (0x01) by its KCC-1 hash (the reference program's p2pkh_hash, blake3); the other schemes name no
// key. The SDK's KCC-20 transfer checks each input's owner with it before any private key is read.

const KEY = "11".repeat(32);
const OTHER = "22".repeat(32);
const HASH = kccHex(kcc1Hash(kccBytes(KEY, "k")));

describe("R3-A3 · kcc20OwnerKeyMatches", () => {
  it("0x00 owns by the key, 0x01 by its hash", () => {
    expect(kcc20OwnerKeyMatches({ owner: KEY, ownerScheme: 0x00 }, KEY)).toBe(true);
    expect(kcc20OwnerKeyMatches({ owner: KEY.toUpperCase(), ownerScheme: 0x00 }, KEY)).toBe(true);
    expect(kcc20OwnerKeyMatches({ owner: KEY, ownerScheme: 0x00 }, OTHER)).toBe(false);
    expect(kcc20OwnerKeyMatches({ owner: HASH, ownerScheme: 0x01 }, KEY)).toBe(true);
    expect(kcc20OwnerKeyMatches({ owner: KEY, ownerScheme: 0x01 }, KEY)).toBe(false);
  });

  it("the other schemes name no key; a key that is not 32 bytes of hex never matches", () => {
    for (const scheme of [0x02, 0x03, 0x04, 0x7f]) expect(kcc20OwnerKeyMatches({ owner: KEY, ownerScheme: scheme }, KEY)).toBe(false);
    expect(kcc20OwnerKeyMatches({ owner: KEY, ownerScheme: 0x00 }, "11")).toBe(false);
    expect(kcc20OwnerKeyMatches({ owner: KEY, ownerScheme: 0x00 }, "zz")).toBe(false);
  });
});
