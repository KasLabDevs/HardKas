import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  KCC2_SCHEMES,
  kcc2AuthorityValue,
  kcc2CheckApproval,
  kcc2Encodings,
  kcc2P2pkhHash,
  kcc2Registry,
  kcc2Scheme,
  kcc1P2shScriptPublicKey,
  kccBytes,
  kccHex,
  type Kcc2SchemeName
} from "../src/index.js";

// -----------------------------------------------------------------------------
// KCC-2 (Final) · every vector of kaspanet/kccs@1ed87aef kcc-0002/vectors/authority-schemes.json (constructions, minimum
// approval checks, registry), plus HardKAS's own negative tests (wrong lengths, reserved and custom bytes, input-index
// witnesses). The vectors stipulate `signature_valid`: KCC-2 chooses no signed message, so a signature check is the
// consuming convention's. Canonical level.
// -----------------------------------------------------------------------------

const file = path.join(__dirname, "fixtures", "kcc", "kcc-0002-authority-schemes.json");
const bytes = fs.readFileSync(file);
const V = JSON.parse(bytes.toString("utf8"));

it("the vectors are the pinned copy", () => {
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("1ff8e2169203b7e52a065fee20c8551b059fb955dc69a91c332ffd6f7cde5835");
});

describe("KCC-2 §2.1-2.3 Authority values and encodings (constructions)", () => {
  for (const c of V.constructions) {
    it(c.id, () => {
      const scheme = kcc2Scheme(parseInt(c.scheme_byte, 16));
      expect(scheme.name).toBe(c.scheme);
      expect(scheme.valueType).toBe(c.value_type);
      const value = kcc2AuthorityValue(c.scheme as Kcc2SchemeName, { publicKey: c.public_key, redeemScript: c.redeem_script, covenantId: c.covenant_id });
      expect(kccHex(value)).toBe(c.authority_value);
      const enc = kcc2Encodings(value);
      expect(kccHex(enc.argument)).toBe(c.argument_encoding);
      expect(kccHex(enc.state)).toBe(c.state_encoding);
      if (c.script_public_key) {
        expect(kcc1P2shScriptPublicKey(kccBytes(c.redeem_script, "R"))).toEqual({ version: c.script_public_key.version, scriptHex: c.script_public_key.script });
      }
    });
  }
});

describe("KCC-2 §2.2-2.3 Minimum approval checks (approval_checks)", () => {
  const construction = (id: string) => V.constructions.find((c: any) => c.id === id);
  for (const a of V.approval_checks) {
    it(`${a.id}: ${a.expected ? "approved" : "not approved"}`, () => {
      const c = construction(a.construction);
      const ctx = a.context;
      const r = kcc2CheckApproval(parseInt(c.scheme_byte, 16), c.authority_value, {
        publicKey: ctx.public_key,
        signatureValid: ctx.signature_valid,
        inputScriptPublicKeys: ctx.input_script_public_keys,
        inputCovenantIds: ctx.input_covenant_ids
      });
      expect(r.approved, r.reason).toBe(a.expected);
    });
  }
});

describe("KCC-2 §2.1 Registry (registry_checks)", () => {
  for (const r of V.registry_checks) {
    it(`0x${r.scheme_byte}: assigned ${r.assigned}, custom ${r.custom}`, () => {
      const reg = kcc2Registry(parseInt(r.scheme_byte, 16));
      expect(reg.kind === "standard").toBe(r.assigned);
      expect(reg.kind === "custom").toBe(r.custom);
      if (!r.assigned && !r.custom) expect(() => kcc2Scheme(parseInt(r.scheme_byte, 16))).toThrow(/^KCC2_SCHEME_RESERVED/);
    });
  }
  it("the five standard schemes and their bytes", () => {
    expect(KCC2_SCHEMES.map((s) => [s.byte, s.name])).toEqual([[0, "p2pk-schnorr/v1"], [1, "p2pkh-schnorr/v1"], [2, "p2pkh-ecdsa/v1"], [3, "p2sh/v1"], [4, "covenant-id/v1"]]);
  });
});

describe("KCC-2 negative tests (HardKAS)", () => {
  const SCHNORR = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
  const ECDSA = `02${SCHNORR}`;
  it("a reserved byte (0x05-0x7f) is refused, never given a meaning; a custom byte needs its definition", () => {
    for (const b of [0x05, 0x40, 0x7f]) expect(() => kcc2CheckApproval(b, "00".repeat(32), {})).toThrow(/^KCC2_SCHEME_RESERVED/);
    for (const b of [0x80, 0xbf, 0xff]) expect(() => kcc2CheckApproval(b, "00".repeat(32), {})).toThrow(/^KCC2_SCHEME_CUSTOM_UNDEFINED/);
    expect(() => kcc2Registry(256)).toThrow(/^KCC2_SCHEME_INVALID/);
  });
  it("a custom scheme with its definition: exact payload length, then its own check", () => {
    const custom = [{ byte: 0x80, name: "example/v1", valueType: "byte[4]", payloadLength: 4, interpretation: "test", approve: (v: Uint8Array) => v[0] === 1 }];
    expect(kcc2CheckApproval(0x80, "01020304", {}, custom).approved).toBe(true);
    expect(kcc2CheckApproval(0x80, "02020304", {}, custom).approved).toBe(false);
    expect(kcc2CheckApproval(0x80, "0102", {}, custom).approved).toBe(false);
  });
  it("authority values must have the exact payload length; key shapes are enforced", () => {
    expect(kcc2CheckApproval(0x00, "00".repeat(31), { publicKey: "00".repeat(31), signatureValid: true }).approved).toBe(false);
    expect(() => kcc2P2pkhHash(kccBytes(ECDSA, "k"), "p2pkh-schnorr/v1")).toThrow(/^KCC2_VALUE_INVALID/);
    expect(() => kcc2P2pkhHash(kccBytes(SCHNORR, "k"), "p2pkh-ecdsa/v1")).toThrow(/^KCC2_VALUE_INVALID/);
    expect(() => kcc2P2pkhHash(kccBytes(`04${SCHNORR}`, "k"), "p2pkh-ecdsa/v1")).toThrow(/^KCC2_VALUE_INVALID/);
    expect(() => kcc2AuthorityValue("covenant-id/v1", { covenantId: "00".repeat(31) })).toThrow(/^KCC2_VALUE_INVALID/);
    expect(() => kcc2Encodings(new Uint8Array(33))).toThrow(/^KCC2_VALUE_INVALID/);
  });
  it("a key commitment alone is not approval: the revealed key must also verify the signature", () => {
    const value = kcc2AuthorityValue("p2pkh-schnorr/v1", { publicKey: SCHNORR });
    expect(kcc2CheckApproval(0x01, value, { publicKey: SCHNORR }).approved).toBe(false);
    expect(kcc2CheckApproval(0x01, value, { publicKey: SCHNORR, signatureValid: true }).approved).toBe(true);
  });
  it("p2sh/v1 with an input-index witness: in range and selecting the exact version-0 envelope", () => {
    const value = kcc2AuthorityValue("p2sh/v1", { redeemScript: "51" });
    const good = { version: 0, script: kcc1P2shScriptPublicKey(kccBytes("51", "R")).scriptHex };
    const other = { version: 0, script: `aa20${"00".repeat(32)}87` };
    expect(kcc2CheckApproval(0x03, value, { inputScriptPublicKeys: [other, good], inputIndex: 1 }).approved).toBe(true);
    expect(kcc2CheckApproval(0x03, value, { inputScriptPublicKeys: [other, good], inputIndex: 0 }).approved).toBe(false);
    expect(kcc2CheckApproval(0x03, value, { inputScriptPublicKeys: [other, good], inputIndex: 2 }).approved).toBe(false);
    expect(kcc2CheckApproval(0x03, value, { inputScriptPublicKeys: [{ ...good, version: 1 }], inputIndex: 0 }).approved).toBe(false);
  });
});
