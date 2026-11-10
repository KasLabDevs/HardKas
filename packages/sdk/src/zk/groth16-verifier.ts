import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import os from "node:os";
import { pathToFileURL } from "node:url";
import {
  legacyDomainDigest,
  ZkGroth16ProofSchema,
  ZkGroth16PublicInputsSchema,
  ZkGroth16VerificationKeySchema
} from "@hardkas/artifacts";
import type {
  ZkGroth16ProofType,
  ZkGroth16VerificationKeyType,
  ZkGroth16PublicInputsType
} from "@hardkas/artifacts";
import {
  fpToBe32,
  g1IsOnCurve,
  g2IsInSubgroup,
  g2IsOnCurve,
  BN254_Q,
  type G1Affine,
  type G2Affine
} from "./bn254.js";

export interface ZkIssue {
  code: string;
  message: string;
  file?: string;
}

/**
 * BN254 / alt_bn128 curve constants:
 * - r: scalar field order (order of the subgroup)
 * - q: base field prime (coordinate field)
 */
export const BN254_SCALAR_FIELD_ORDER =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const BN254_BASE_FIELD_PRIME =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

/** The canonical BN254 generators. A verification key whose alpha or beta equals its
 *  generator comes from an UNCONTRIBUTED powers-of-tau (tau = alpha = beta = 1): anyone
 *  can forge proofs for any public input against such a key (audit finding H-01). */
export const BN254_G1_GENERATOR = ["1", "2"] as const;
export const BN254_G2_GENERATOR = [
  [
    "10857046999023057135944570762232829481370756359578518086990519993285655852781",
    "11559732032986387107991004021392285783925812861821192530917403151452391805634"
  ],
  [
    "8495653923123431417604973247489272438418190587263600148770280649306958101930",
    "4082367875863433681332203403145435568316851327593401208105741076214120093531"
  ]
] as const;

/** Default and maximum wall-clock budget for one pairing check (ms). */
export const DEFAULT_GROTH16_VERIFY_TIMEOUT_MS = 10_000;
export const MAX_GROTH16_VERIFY_TIMEOUT_MS = 600_000;

/**
 * Best-effort ACCIDENT detector for a verification key's trusted setup. It is not a security boundary.
 * "WEAK_TRAPDOOR_SUSPECTED" means a known-weak pattern was found (uncontributed powers of tau, or a key
 * pinned in code as a known-trapdoor toy). "NO_KNOWN_WEAKNESS" means only that no such pattern was found:
 * a key whose discrete logarithms are known to its creator (alpha = a·G1 for a secret a) is
 * indistinguishable from a sound one, so a key is only ever trusted through an ANCHOR (see
 * Groth16VerificationKeyAnchor), never through this heuristic. Provenance of a key is never claimed.
 */
export type Groth16VerificationKeyStrength = "NO_KNOWN_WEAKNESS" | "WEAK_TRAPDOOR_SUSPECTED";

/**
 * Where the trust in the verification key comes from.
 *   CALLER_PIN       the caller passed expectedVerificationKeyHash and the key matches it;
 *   PINNED_REGISTRY  the key's fingerprint is in PINNED_GROTH16_VERIFICATION_KEYS (pinned in this code);
 *   UNANCHORED       neither: the key is whatever was found next to the proof.
 * Only an anchored key can produce ZK_GROTH16_MATH_VERIFIED (HK-04).
 */
export type Groth16VerificationKeyAnchor = "CALLER_PIN" | "PINNED_REGISTRY" | "UNANCHORED";

export interface Groth16VerifyMathOptions {
  /** Wall-clock budget for the pairing check; the verification worker is terminated when it elapses. */
  timeoutMs?: number;
  /** Accept a verification key whose trusted setup is provably weak (toy fixtures only). */
  allowWeakVerificationKey?: boolean;
  /**
   * Pin (anchor) for the verification key, obtained from a source the caller trusts. Accepted forms:
   * the key's portable fingerprint (`summary.verificationKeyFingerprint`, groth16VerificationKeyFingerprint)
   * or its legacy object digest (`summary.verificationKeyHash`). A mismatch rejects before any pairing.
   */
  expectedVerificationKeyHash?: string;
}

export type Groth16MathStatus =
  | "ZK_GROTH16_MATH_VERIFIED"
  | "ZK_GROTH16_MATH_VALID_UNANCHORED_VK"
  | "ZK_GROTH16_MATH_REJECTED"
  | "ZK_GROTH16_VERIFIER_ERROR";

export interface Groth16MathVerificationOutput {
  /** True only for ZK_GROTH16_MATH_VERIFIED (pairing passed AND the key is anchored). */
  ok: boolean;
  /** True only for ZK_GROTH16_MATH_VERIFIED. */
  verified: boolean;
  /**
   * ZK_GROTH16_MATH_VERIFIED            pairing passed against an ANCHORED key;
   * ZK_GROTH16_MATH_VALID_UNANCHORED_VK pairing passed, but against a key nobody vouched for: the proof is
   *                                     consistent with THIS key, which says nothing about the statement;
   * ZK_GROTH16_MATH_REJECTED            refused (structure, canonical encoding, pin, weak key, or pairing);
   * ZK_GROTH16_VERIFIER_ERROR           the engine could not run (timeout, crash), or is not installed
   *                                     (issue ZK_ENGINE_UNAVAILABLE: snarkjs is an optional peer dependency).
   */
  status: Groth16MathStatus;
  durationMs: number;
  summary: {
    proofSystem: "groth16";
    curve: string;
    publicSignals: string[];
    /** Outcome of the pairing equation alone ("PASS" also for VALID_UNANCHORED_VK). */
    mathCheck: "PASS" | "FAIL" | "ERROR";
    /** Domain digest (legacy corpus digest) of the verification key object that was used. */
    verificationKeyHash: string;
    /** Portable fingerprint of the key's curve points ("" when the key is not canonical). */
    verificationKeyFingerprint: string;
    verificationKeyAnchor: Groth16VerificationKeyAnchor;
    /** Id of the matching entry of PINNED_GROTH16_VERIFICATION_KEYS, when there is one. */
    pinnedVerificationKeyId?: string;
    /** Domain digest of the public inputs object that was used. */
    publicInputsHash: string;
    /** Domain digest of the proof object that was used. */
    proofHash: string;
    verificationKeyStrength: Groth16VerificationKeyStrength;
  };
  issues: ZkIssue[];
}

// --- Pinned verification keys (the in-code trust anchors) -------------------------------------------

export interface PinnedGroth16VerificationKey {
  /** Stable id (corpus entries reference it as pinnedVerificationKeyId). */
  readonly id: string;
  /** groth16VerificationKeyFingerprint of the key. */
  readonly fingerprint: string;
  readonly trust: "TOY_KNOWN_TRAPDOOR" | "OFFICIAL_UPSTREAM_RELEASE";
  /** The key's trapdoor is public: proofs against it prove nothing (allowWeakVerificationKey required). */
  readonly knownTrapdoor: boolean;
  /** Where the key comes from. */
  readonly source: string;
}

/**
 * Keys pinned in this code. Pinning anchors the IDENTITY of a key (these exact curve points), not its
 * soundness: a known-trapdoor toy stays weak and still needs allowWeakVerificationKey.
 */
export const PINNED_GROTH16_VERIFICATION_KEYS: readonly PinnedGroth16VerificationKey[] = Object.freeze([
  Object.freeze({
    id: "hardkas-groth16-multiplier-toy",
    fingerprint: "be0faa7e36dee2e5dce7d9ef044213a1a7337c9e9867af6cc5b044c4d3eea057",
    trust: "TOY_KNOWN_TRAPDOOR" as const,
    knownTrapdoor: true,
    source:
      "fixtures/toccata-v2/zk/groth16-multiplier/verification-key.json (circom 2.1.6 + snarkjs 0.7.6 over an UNCONTRIBUTED powers of tau)"
  }),
  Object.freeze({
    id: "risc0-groth16-bn254-v3.0.4",
    fingerprint: "34d6b6930c72f7f4b6e6197c35310eb11ccdab9993aeeae7a34030f5d79ea401",
    trust: "OFFICIAL_UPSTREAM_RELEASE" as const,
    knownTrapdoor: false,
    source:
      "RISC Zero Groth16 verifying key: risc0 v3.0.4 risc0/groth16/src/verifier.rs; the same key, compressed, is R0_SERIALIZED_COMPRESSED_VK of rusty-kaspa v2.1.0 (crypto/txscript/zk-sdk fragments/groth16.rs) and is embedded by the kaspa-wasm 2.1.0 ZkScriptBuilder"
  })
]);

/** Looks a pinned key up by fingerprint or by id. */
export function findPinnedGroth16VerificationKey(fingerprintOrId: string): PinnedGroth16VerificationKey | undefined {
  const k = String(fingerprintOrId ?? "").trim().toLowerCase();
  return PINNED_GROTH16_VERIFICATION_KEYS.find((e) => e.fingerprint === k || e.id.toLowerCase() === k);
}

/** Canonical decimal: no sign, no leading zeros, no whitespace, no hex. */
const CANONICAL_DECIMAL = /^(0|[1-9][0-9]*)$/;

function parseCanonicalDecimal(raw: unknown): bigint | undefined {
  if (typeof raw !== "string" || !CANONICAL_DECIMAL.test(raw)) return undefined;
  try {
    return BigInt(raw);
  } catch {
    return undefined;
  }
}

/**
 * Validates that all public signals are canonical decimal strings within the scalar field [0, r).
 */
export function validatePublicSignals(
  publicSignals: unknown,
  issues: ZkIssue[]
): boolean {
  if (!Array.isArray(publicSignals)) {
    issues.push({
      code: "ZK_SCALAR_MALFORMED",
      message: "publicSignals must be an array of canonical decimal strings."
    });
    return false;
  }
  let allValid = true;
  for (let i = 0; i < publicSignals.length; i++) {
    const raw = publicSignals[i];
    const val = parseCanonicalDecimal(raw);
    if (val === undefined) {
      issues.push({
        code: "ZK_SCALAR_MALFORMED",
        message: `Public input at index ${i} is not a canonical non-negative decimal string: '${String(raw)}'.`
      });
      allValid = false;
      continue;
    }
    if (val >= BN254_SCALAR_FIELD_ORDER) {
      issues.push({
        code: "ZK_SCALAR_OUT_OF_RANGE",
        message: `Public input at index ${i} (${raw}) is outside BN254 scalar field order [0, ${BN254_SCALAR_FIELD_ORDER}).`
      });
      allValid = false;
    }
  }
  return allValid;
}

function checkCoordinate(coord: unknown, pointName: string, issues: ZkIssue[]): boolean {
  const val = parseCanonicalDecimal(coord);
  if (val === undefined) {
    issues.push({
      code: "ZK_POINT_COORDINATE_MALFORMED",
      message: `Point coordinate in ${pointName} is not a canonical decimal integer string: '${String(coord)}'.`
    });
    return false;
  }
  if (val >= BN254_BASE_FIELD_PRIME) {
    issues.push({
      code: "ZK_POINT_COORDINATE_OUT_OF_RANGE",
      message: `Coordinate in ${pointName} is outside BN254 base field prime [0, ${BN254_BASE_FIELD_PRIME}).`
    });
    return false;
  }
  return true;
}

/** A projective G1 point as snarkjs serialises it: exactly [x, y, z], every element canonical and < q. */
function checkG1Shape(point: unknown, name: string, issues: ZkIssue[]): boolean {
  if (!Array.isArray(point) || point.length !== 3) {
    issues.push({
      code: "ZK_POINT_MALFORMED",
      message: `${name} must be a projective G1 point with exactly 3 coordinates.`
    });
    return false;
  }
  let ok = true;
  for (let i = 0; i < 3; i++) if (!checkCoordinate(point[i], `${name}[${i}]`, issues)) ok = false;
  return ok;
}

/** A projective G2 point: exactly 3 rows of exactly 2 Fp elements. */
function checkG2Shape(point: unknown, name: string, issues: ZkIssue[]): boolean {
  if (!Array.isArray(point) || point.length !== 3) {
    issues.push({
      code: "ZK_POINT_MALFORMED",
      message: `${name} must be a projective G2 point with exactly 3 rows.`
    });
    return false;
  }
  let ok = true;
  for (let i = 0; i < 3; i++) {
    const row = point[i];
    if (!Array.isArray(row) || row.length !== 2) {
      issues.push({
        code: "ZK_POINT_MALFORMED",
        message: `${name}[${i}] must have exactly 2 field elements.`
      });
      ok = false;
      continue;
    }
    for (let j = 0; j < 2; j++) if (!checkCoordinate(row[j], `${name}[${i}][${j}]`, issues)) ok = false;
  }
  return ok;
}

/**
 * The ONLY accepted encodings (CA-ZK-02). snarkjs/ffjavascript read [x, y, z] as Jacobian coordinates for
 * some points and copy the raw buffer into an affine slot for others (IC in multiExpAffine), so any z other
 * than the canonical one makes snarkjs check a different key than the one being judged. Hence:
 *   G1: [x, y, "1"] (affine) or exactly ["0", "1", "0"] (the point at infinity, as snarkjs writes it);
 *   G2: [[x0, x1], [y0, y1], ["1", "0"]] or exactly [["0","0"], ["1","0"], ["0","0"]].
 */
export const BN254_G1_INFINITY_JSON = ["0", "1", "0"] as const;
export const BN254_G2_INFINITY_JSON = [["0", "0"], ["1", "0"], ["0", "0"]] as const;

/** Parses a G1 point: shape, range, canonical encoding and curve membership (cofactor 1: curve = subgroup). */
function parseG1(point: unknown, name: string, issues: ZkIssue[]): G1Affine | undefined {
  if (!checkG1Shape(point, name, issues)) return undefined;
  const p = point as string[];
  if (p[0] === "0" && p[1] === "1" && p[2] === "0") return { x: 0n, y: 0n, infinity: true };
  if (p[2] !== "1") {
    issues.push({
      code: "ZK_POINT_NOT_CANONICAL",
      message: `${name} is not canonically encoded: z must be "1" (affine) or the point must be exactly ["0","1","0"] (infinity); got z = '${String(p[2])}'.`
    });
    return undefined;
  }
  const affine: G1Affine = { x: BigInt(p[0] as string), y: BigInt(p[1] as string), infinity: false };
  if (!g1IsOnCurve(affine)) {
    issues.push({ code: "ZK_POINT_NOT_ON_CURVE", message: `${name} is not a point of BN254 G1 (y^2 != x^3 + 3).` });
    return undefined;
  }
  return affine;
}

/** Parses a G2 point: shape, range, canonical encoding, twist membership and r-torsion subgroup membership. */
function parseG2(point: unknown, name: string, issues: ZkIssue[]): G2Affine | undefined {
  if (!checkG2Shape(point, name, issues)) return undefined;
  const p = point as string[][];
  const flat = p.map((row) => row.join(",")).join(";");
  if (flat === "0,0;1,0;0,0") return { x: [0n, 0n], y: [0n, 0n], infinity: true };
  if (p[2]?.[0] !== "1" || p[2]?.[1] !== "0") {
    issues.push({
      code: "ZK_POINT_NOT_CANONICAL",
      message: `${name} is not canonically encoded: z must be ["1","0"] (affine) or the point must be exactly [["0","0"],["1","0"],["0","0"]] (infinity).`
    });
    return undefined;
  }
  const affine: G2Affine = {
    x: [BigInt(p[0]![0]!), BigInt(p[0]![1]!)],
    y: [BigInt(p[1]![0]!), BigInt(p[1]![1]!)],
    infinity: false
  };
  if (!g2IsOnCurve(affine)) {
    issues.push({ code: "ZK_POINT_NOT_ON_CURVE", message: `${name} is not a point of the BN254 G2 twist.` });
    return undefined;
  }
  if (!g2IsInSubgroup(affine)) {
    issues.push({
      code: "ZK_POINT_NOT_IN_SUBGROUP",
      message: `${name} is on the twist but outside the prime-order subgroup (r·P != O); arkworks (the L1 precompile) refuses it and snarkjs does not check it.`
    });
    return undefined;
  }
  return affine;
}

/**
 * Validates that the proof's points are canonically encoded, on the curve, and (G2) in the subgroup, with
 * coordinates in [0, q). Runs before any weakness heuristic and before snarkjs.
 */
export function validateProofCoordinates(
  proof: ZkGroth16ProofType,
  issues: ZkIssue[]
): boolean {
  const a = parseG1((proof as any)?.pi_a, "pi_a", issues) !== undefined;
  const b = parseG2((proof as any)?.pi_b, "pi_b", issues) !== undefined;
  const c = parseG1((proof as any)?.pi_c, "pi_c", issues) !== undefined;
  return a && b && c;
}

interface ParsedVerificationKey {
  alpha: G1Affine;
  beta: G2Affine;
  gamma: G2Affine;
  delta: G2Affine;
  ic: G1Affine[];
}

function parseVerificationKeyPoints(vk: unknown, issues: ZkIssue[]): ParsedVerificationKey | undefined {
  const v = vk as any;
  if (!v || !Array.isArray(v.IC) || v.IC.length === 0) return undefined;
  const alpha = parseG1(v.vk_alpha_1, "vk_alpha_1", issues);
  const beta = parseG2(v.vk_beta_2, "vk_beta_2", issues);
  const gamma = parseG2(v.vk_gamma_2, "vk_gamma_2", issues);
  const delta = parseG2(v.vk_delta_2, "vk_delta_2", issues);
  const ic: G1Affine[] = [];
  let icOk = true;
  for (let i = 0; i < v.IC.length; i++) {
    const p = parseG1(v.IC[i], `IC[${i}]`, issues);
    if (p) ic.push(p);
    else icOk = false;
  }
  if (!alpha || !beta || !gamma || !delta || !icOk) return undefined;
  return { alpha, beta, gamma, delta, ic };
}

/** Domain tag of the portable verification-key fingerprint (CA-ZK-04). */
export const GROTH16_VK_FINGERPRINT_DOMAIN = "hardkas.zk.groth16.bn254.vkFingerprint.v1";

function g1Bytes(p: G1Affine): Buffer {
  return Buffer.concat([fpToBe32(p.infinity ? 0n : p.x), fpToBe32(p.infinity ? 0n : p.y)]);
}
function g2Bytes(p: G2Affine): Buffer {
  return Buffer.concat(
    [p.x[0], p.x[1], p.y[0], p.y[1]].map((c) => Buffer.from(fpToBe32(p.infinity ? 0n : c)))
  );
}

/**
 * Portable fingerprint of a Groth16 BN254 verification key (CA-ZK-04): SHA-256 over
 *   UTF-8(GROTH16_VK_FINGERPRINT_DOMAIN) || 0x00 ||
 *   alpha(x, y) || beta(x.c0, x.c1, y.c0, y.c1) || gamma(...) || delta(...) ||
 *   u32-BE(number of IC points) || IC_i(x, y)...
 * every coordinate as 32-byte big-endian affine values, the point at infinity as all-zero coordinates.
 * It covers exactly the curve points snarkjs and the precompile use, and none of the labels (ids, notes,
 * statement hashes), so anyone holding the same key computes the same value from its points.
 * Returns undefined when the key is not canonically encoded or not on the curve.
 */
export function groth16VerificationKeyFingerprint(vk: unknown): string | undefined {
  const parsed = parseVerificationKeyPoints(vk, []);
  if (!parsed) return undefined;
  const count = Buffer.alloc(4);
  count.writeUInt32BE(parsed.ic.length, 0);
  const h = createHash("sha256");
  h.update(Buffer.from(GROTH16_VK_FINGERPRINT_DOMAIN, "utf8"));
  h.update(Buffer.from([0]));
  h.update(g1Bytes(parsed.alpha));
  h.update(g2Bytes(parsed.beta));
  h.update(g2Bytes(parsed.gamma));
  h.update(g2Bytes(parsed.delta));
  h.update(count);
  for (const p of parsed.ic) h.update(g1Bytes(p));
  return h.digest("hex");
}

/**
 * Validates the verification key's structure: every point canonical, on the curve and (G2) in the
 * subgroup, IC non-empty, nPublic consistent.
 */
export function validateVerificationKeyStructure(
  vk: ZkGroth16VerificationKeyType,
  issues: ZkIssue[]
): boolean {
  const v = vk as any;
  if (
    !v ||
    !Array.isArray(v.IC) ||
    v.IC.length === 0 ||
    !Array.isArray(v.vk_alpha_1) ||
    !Array.isArray(v.vk_beta_2) ||
    !Array.isArray(v.vk_gamma_2) ||
    !Array.isArray(v.vk_delta_2)
  ) {
    issues.push({
      code: "ZK_VERIFICATION_KEY_INCOMPLETE",
      message:
        "Groth16 verification key is missing required curve points (vk_alpha_1, vk_beta_2, vk_gamma_2, vk_delta_2, or IC)."
    });
    return false;
  }
  let ok = checkG1Shape(v.vk_alpha_1, "vk_alpha_1", issues);
  if (!checkG2Shape(v.vk_beta_2, "vk_beta_2", issues)) ok = false;
  if (!checkG2Shape(v.vk_gamma_2, "vk_gamma_2", issues)) ok = false;
  if (!checkG2Shape(v.vk_delta_2, "vk_delta_2", issues)) ok = false;
  for (let i = 0; i < v.IC.length; i++) if (!checkG1Shape(v.IC[i], `IC[${i}]`, issues)) ok = false;
  // Canonical encoding, curve and subgroup membership (only once the shape is right, so each defect is
  // reported once).
  if (ok && !parseVerificationKeyPoints(v, issues)) ok = false;
  if (typeof v.nPublic === "number" && v.nPublic !== v.IC.length - 1) {
    issues.push({
      code: "ZK_VERIFICATION_KEY_ARITY_MISMATCH",
      message: `Verification key declares nPublic=${v.nPublic} but carries ${v.IC.length - 1} input commitments.`
    });
    ok = false;
  }
  return ok;
}

// The heuristic below compares GROUP ELEMENTS, not encodings: a Jacobian [X, Y, Z] is normalised to
// (X/Z^2, Y/Z^3) first, so a re-encoded key is judged as the same key (EXP-02). The verifier itself never
// relies on this normalisation: non-canonical keys are rejected before the heuristic and before snarkjs.
function fpFromDecimal(raw: unknown): bigint | undefined {
  const v = parseCanonicalDecimal(raw);
  return v !== undefined && v < BN254_Q ? v : undefined;
}

function fpInvQ(a: bigint): bigint {
  let result = 1n;
  let b = a % BN254_Q;
  let e = BN254_Q - 2n;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % BN254_Q;
    b = (b * b) % BN254_Q;
    e >>= 1n;
  }
  return result;
}

function normalizeG1(point: unknown): { x: bigint; y: bigint } | "INFINITY" | undefined {
  if (!Array.isArray(point) || point.length !== 3) return undefined;
  const [x, y, z] = point.map(fpFromDecimal);
  if (x === undefined || y === undefined || z === undefined) return undefined;
  if (z === 0n) return "INFINITY";
  const zi = fpInvQ(z);
  const zi2 = (zi * zi) % BN254_Q;
  return { x: (x * zi2) % BN254_Q, y: (((y * zi2) % BN254_Q) * zi) % BN254_Q };
}

type Fp2Pair = [bigint, bigint];
function f2mul(a: Fp2Pair, b: Fp2Pair): Fp2Pair {
  const q = BN254_Q;
  return [(((a[0] * b[0] - a[1] * b[1]) % q) + q) % q, (((a[0] * b[1] + a[1] * b[0]) % q) + q) % q];
}
function f2inv(a: Fp2Pair): Fp2Pair {
  const t = fpInvQ((a[0] * a[0] + a[1] * a[1]) % BN254_Q);
  return [(a[0] * t) % BN254_Q, (((-a[1] * t) % BN254_Q) + BN254_Q) % BN254_Q];
}

function normalizeG2(point: unknown): { x: Fp2Pair; y: Fp2Pair } | "INFINITY" | undefined {
  if (!Array.isArray(point) || point.length !== 3) return undefined;
  const rows: Fp2Pair[] = [];
  for (const row of point) {
    if (!Array.isArray(row) || row.length !== 2) return undefined;
    const a = fpFromDecimal(row[0]);
    const b = fpFromDecimal(row[1]);
    if (a === undefined || b === undefined) return undefined;
    rows.push([a, b]);
  }
  const [x, y, z] = rows as [Fp2Pair, Fp2Pair, Fp2Pair];
  if (z[0] === 0n && z[1] === 0n) return "INFINITY";
  const zi = f2inv(z);
  const zi2 = f2mul(zi, zi);
  return { x: f2mul(x, zi2), y: f2mul(f2mul(y, zi2), zi) };
}

function sameG1(point: unknown, gen: readonly [string, string]): boolean {
  const n = normalizeG1(point);
  return typeof n === "object" && n.x === BigInt(gen[0]) && n.y === BigInt(gen[1]);
}

function sameG2Points(a: unknown, b: unknown): boolean {
  const na = normalizeG2(a);
  const nb = normalizeG2(b);
  if (na === undefined || nb === undefined) return false;
  if (na === "INFINITY" || nb === "INFINITY") return na === nb;
  return na.x[0] === nb.x[0] && na.x[1] === nb.x[1] && na.y[0] === nb.y[0] && na.y[1] === nb.y[1];
}

const G2_GENERATOR_JSON = [BN254_G2_GENERATOR[0], BN254_G2_GENERATOR[1], ["1", "0"]];

/**
 * Accident detector (NOT a security boundary): flags verification keys whose trusted setup is provably
 * weak — alpha or beta equal to the curve generator (uncontributed tau ceremony), beta equal to gamma,
 * IC[0] at infinity — and keys pinned in code as known-trapdoor toys. With such a key the discrete
 * logarithms are public and proofs can be forged for ANY public input (H-01). Points are compared as
 * group elements (encoding-independent). gamma = G2 generator is deliberately NOT a signal: honest snarkjs
 * keys and the RISC Zero production key have it (CA-ZK-01). A key with any other known trapdoor
 * (alpha = 2·G1, …) passes this check: only an anchor (pin) establishes trust in a key.
 */
export function assessVerificationKeyStrength(
  vk: ZkGroth16VerificationKeyType
): { strength: Groth16VerificationKeyStrength; reasons: string[] } {
  const v = (vk ?? {}) as any;
  const reasons: string[] = [];
  if (sameG1(v.vk_alpha_1, BN254_G1_GENERATOR)) reasons.push("vk_alpha_1 is the G1 generator (alpha = 1)");
  if (sameG2Points(v.vk_beta_2, G2_GENERATOR_JSON)) reasons.push("vk_beta_2 is the G2 generator (beta = 1)");
  if (sameG2Points(v.vk_beta_2, v.vk_gamma_2)) reasons.push("vk_beta_2 equals vk_gamma_2");
  if (Array.isArray(v.IC) && normalizeG1(v.IC[0]) === "INFINITY") reasons.push("IC[0] is the point at infinity");
  const fingerprint = groth16VerificationKeyFingerprint(v);
  const pinned = fingerprint ? findPinnedGroth16VerificationKey(fingerprint) : undefined;
  if (pinned?.knownTrapdoor) reasons.push(`pinned in code as a known-trapdoor key (${pinned.id})`);
  return { strength: reasons.length > 0 ? "WEAK_TRAPDOOR_SUSPECTED" : "NO_KNOWN_WEAKNESS", reasons };
}

/** Normalises the timeout option: integer milliseconds in [1, MAX]; anything else is an error. */
export function normalizeVerifyTimeout(timeoutMs: unknown): number {
  if (timeoutMs === undefined) return DEFAULT_GROTH16_VERIFY_TIMEOUT_MS;
  if (
    typeof timeoutMs !== "number" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_GROTH16_VERIFY_TIMEOUT_MS
  ) {
    throw new RangeError(
      `timeoutMs must be an integer in [1, ${MAX_GROTH16_VERIFY_TIMEOUT_MS}], got ${String(timeoutMs)}`
    );
  }
  return timeoutMs;
}

/**
 * L1-CORE-1 B5: the pairing engine is snarkjs, an OPTIONAL peer dependency of @hardkas/sdk (GPL-3.0, so installing the
 * SDK does not install it). It is resolved only when a pairing is about to run; when it cannot be resolved the
 * verification reports ZK_ENGINE_UNAVAILABLE (status ZK_GROTH16_VERIFIER_ERROR), never a pass.
 */
function resolveEngineUrls(): { snarkjsUrl: string } | { unavailable: string } {
  const req = createRequire(import.meta.url);
  try {
    return { snarkjsUrl: pathToFileURL(req.resolve("snarkjs")).href };
  } catch (error: unknown) {
    // first line only: Node appends the require stack (local paths)
    const message = error instanceof Error ? error.message : String(error);
    return { unavailable: message.split(/\r?\n/)[0] ?? "" };
  }
}

function engineUnavailableIssue(reason: string): ZkIssue {
  return {
    code: "ZK_ENGINE_UNAVAILABLE",
    message:
      `Groth16 verification needs the optional peer dependency snarkjs, which is not installed (${reason}). ` +
      "snarkjs is GPL-3.0, so @hardkas/sdk does not install it: install it next to @hardkas/sdk, at the version " +
      "@hardkas/sdk declares in peerDependencies. Nothing was verified."
  };
}

/**
 * The pairing check runs in a dedicated child process so that a timeout can terminate it for
 * real: killing the child also kills the worker pool ffjavascript spawns for the curve, and nothing
 * is left running in the caller's process. (A worker thread is not an option: ffjavascript's
 * `web-worker` shim refuses to load inside a non-main thread.) The child reads its inputs from
 * stdin and writes one JSON line to stdout.
 */
const CHILD_SOURCE = `
let data = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) data += chunk;
const input = JSON.parse(data);
try {
  const mod = await import(input.snarkjsUrl);
  const engine = (mod && mod.groth16) || (mod && mod.default && mod.default.groth16);
  if (!engine || typeof engine.verify !== "function") throw new Error("snarkjs.groth16.verify is unavailable.");
  const ok = await engine.verify(input.vk, input.publicSignals, input.proof);
  process.stdout.write(JSON.stringify({ ok: ok === true }));
} catch (error) {
  process.stdout.write(JSON.stringify({ error: String((error && error.message) || error) }));
}
process.exit(0);
`;

/**
 * At most this many pairing processes run at once. Each one is a Node process that loads snarkjs, and its ffjavascript
 * curve starts a worker pool sized to the CPU count: callers that start many verifications together (30 at once in
 * ADV-ZK-04) would start dozens of processes and hundreds of threads, and on a busy machine (CI's macOS runner) some ran
 * out their timeout with a valid proof. Further calls wait for a free slot; each call's timeout counts from the moment
 * its own process starts, so waiting never turns into a timeout.
 */
const MAX_CONCURRENT_PAIRINGS = Math.max(
  1,
  Math.min(4, typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length)
);
let activePairings = 0;
const pairingQueue: Array<() => void> = [];

async function withPairingSlot<T>(run: () => Promise<T>): Promise<T> {
  if (activePairings < MAX_CONCURRENT_PAIRINGS) activePairings++;
  // a finishing call hands its slot straight to the next waiter, so the limit is never exceeded
  else await new Promise<void>((resolve) => pairingQueue.push(resolve));
  try {
    return await run();
  } finally {
    const next = pairingQueue.shift();
    if (next) next();
    else activePairings--;
  }
}

async function runPairingInChildProcess(
  snarkjsUrl: string,
  vk: unknown,
  publicSignals: string[],
  proof: unknown,
  timeoutMs: number
): Promise<boolean> {
  const child = spawn(process.execPath, ["--input-type=module", "-e", CHILD_SOURCE], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => (stdout += chunk));
  child.stderr.on("data", (chunk: string) => (stderr += chunk.slice(0, 2000)));
  try {
    return await new Promise<boolean>((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Groth16 cryptographic verification timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      child.once("error", (error) => reject(error));
      child.once("close", (code) => {
        let parsed: { ok?: boolean; error?: string } | undefined;
        try {
          parsed = stdout.trim() ? JSON.parse(stdout.trim()) : undefined;
        } catch {
          parsed = undefined;
        }
        if (parsed && typeof parsed.error === "string") return reject(new Error(parsed.error));
        if (parsed && typeof parsed.ok === "boolean") return resolve(parsed.ok);
        reject(new Error(`Groth16 verification process exited with code ${code} without a result${stderr ? `: ${stderr.trim()}` : ""}`));
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(JSON.stringify({ snarkjsUrl, vk, publicSignals, proof }));
    });
  } finally {
    if (timer) clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
}

/**
 * Executes the Groth16 pairing check (snarkjs over BN254) after strict validation, and says how far the
 * result can be trusted.
 *
 * The pairing only shows that (A, B, C) satisfies the Groth16 equation for THE KEY IT IS GIVEN; it says
 * nothing about where that key came from, and a key whose discrete logarithms are known to its maker
 * accepts forged proofs of false statements (CA-EXP-04b). So:
 *   - ZK_GROTH16_MATH_VERIFIED (ok/verified true) requires an ANCHORED key: the caller's
 *     expectedVerificationKeyHash (a pin obtained from a trusted source) or an entry of
 *     PINNED_GROTH16_VERIFICATION_KEYS;
 *   - without an anchor a passing pairing is ZK_GROTH16_MATH_VALID_UNANCHORED_VK (ok/verified false);
 *   - non-canonical encodings, off-curve points and G2 points outside the subgroup are rejected BEFORE the
 *     weakness heuristic and BEFORE snarkjs, so the key that is judged is the key snarkjs would check;
 *   - the weakness heuristic is an accident detector, never a substitute for a pin.
 * Fixture coherence (verifyZkProofMath's default binding) is self-attested and is NOT an anchor.
 */
export async function verifyGroth16Math(
  vk: ZkGroth16VerificationKeyType,
  publicInputs: ZkGroth16PublicInputsType,
  proof: ZkGroth16ProofType,
  options: Groth16VerifyMathOptions = {}
): Promise<Groth16MathVerificationOutput> {
  const issues: ZkIssue[] = [];
  const start = Date.now();
  const curve = typeof (vk as any)?.curve === "string" && (vk as any).curve ? (vk as any).curve : "bn128";
  const signals: string[] = Array.isArray((publicInputs as any)?.publicSignals)
    ? ((publicInputs as any).publicSignals as string[])
    : [];
  let verificationKeyHash = "";
  let publicInputsHash = "";
  let proofHash = "";
  let digestError: string | undefined;
  try {
    verificationKeyHash = legacyDomainDigest(vk);
    publicInputsHash = legacyDomainDigest(publicInputs);
    proofHash = legacyDomainDigest(proof);
  } catch (error: any) {
    // e.g. a pathologically nested vk_alphabeta_12 (H-7): report, never throw out of the verifier
    digestError = error?.message ?? String(error);
  }
  const strengthReport = assessVerificationKeyStrength(vk);
  const fingerprint = groth16VerificationKeyFingerprint(vk) ?? "";
  let anchor: Groth16VerificationKeyAnchor = "UNANCHORED";
  let pinnedId: string | undefined;

  const summaryBase = () => ({
    proofSystem: "groth16" as const,
    curve,
    publicSignals: signals,
    verificationKeyHash,
    verificationKeyFingerprint: fingerprint,
    verificationKeyAnchor: anchor,
    ...(pinnedId !== undefined ? { pinnedVerificationKeyId: pinnedId } : {}),
    publicInputsHash,
    proofHash,
    verificationKeyStrength: strengthReport.strength
  });
  const rejected = (): Groth16MathVerificationOutput => ({
    ok: false,
    verified: false,
    status: "ZK_GROTH16_MATH_REJECTED",
    durationMs: Date.now() - start,
    summary: { ...summaryBase(), mathCheck: "FAIL" },
    issues
  });
  const errored = (): Groth16MathVerificationOutput => ({
    ok: false,
    verified: false,
    status: "ZK_GROTH16_VERIFIER_ERROR",
    durationMs: Date.now() - start,
    summary: { ...summaryBase(), mathCheck: "ERROR" },
    issues
  });

  if (digestError !== undefined) {
    issues.push({ code: "ZK_ARTIFACT_DIGEST_FAILED", message: `Could not digest the verification inputs: ${digestError}` });
    return errored();
  }

  let timeoutMs: number;
  try {
    timeoutMs = normalizeVerifyTimeout(options.timeoutMs);
  } catch (error: any) {
    issues.push({ code: "ZK_VERIFY_TIMEOUT_INVALID", message: error?.message ?? String(error) });
    return errored();
  }

  // 1. Protocol & curve: BN254 only. There is no option to widen this.
  if ((proof as any)?.protocol !== "groth16" || (vk as any)?.protocol !== "groth16") {
    issues.push({
      code: "ZK_PROTOCOL_UNSUPPORTED",
      message: `Expected protocol 'groth16', got proof '${String((proof as any)?.protocol)}' and vk '${String((vk as any)?.protocol)}'.`
    });
  }
  const normalizedCurve = String(curve).toLowerCase();
  if (normalizedCurve !== "bn128" && normalizedCurve !== "bn254") {
    issues.push({
      code: "ZK_CURVE_UNSUPPORTED",
      message: `Mathematical verification engine supports BN254/bn128 only. Received '${curve}'.`
    });
  }

  // 2. Strict schemas, as verifyZkProofMath applies them (CA-ZK-07): no unknown keys, canonical decimals.
  for (const [what, schema, value] of [
    ["verification key", ZkGroth16VerificationKeySchema, vk],
    ["public inputs", ZkGroth16PublicInputsSchema, publicInputs],
    ["proof", ZkGroth16ProofSchema, proof]
  ] as const) {
    const parsed = (schema as any).safeParse(value);
    if (!parsed.success) {
      issues.push({ code: "ZK_ARTIFACT_SCHEMA_INVALID", message: `Invalid Groth16 ${what} schema: ${parsed.error.message}` });
    }
  }

  // 3. Structure: canonical encodings, curve and subgroup membership, complete key, arity. This runs
  //    before the weakness heuristic and before snarkjs (CA-ZK-02).
  const keyOk = validateVerificationKeyStructure(vk, issues);
  const scalarsOk = validatePublicSignals(signals, issues);
  const coordsOk = validateProofCoordinates(proof, issues);
  if (keyOk && Array.isArray((vk as any).IC) && signals.length !== (vk as any).IC.length - 1) {
    issues.push({
      code: "ZK_PUBLIC_INPUT_ARITY_MISMATCH",
      message: `Expected ${(vk as any).IC.length - 1} public inputs for this verification key, got ${signals.length}.`
    });
  }

  // 4. Anchor: the caller's pin, else the in-code registry.
  const registryEntry = fingerprint ? findPinnedGroth16VerificationKey(fingerprint) : undefined;
  if (options.expectedVerificationKeyHash !== undefined) {
    const expected = String(options.expectedVerificationKeyHash).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(expected)) {
      issues.push({
        code: "ZK_EXPECTED_VERIFICATION_KEY_HASH_INVALID",
        message: "expectedVerificationKeyHash must be a 64-hex SHA-256 value (the key fingerprint or its legacy digest)."
      });
    } else if (expected !== verificationKeyHash && (fingerprint === "" || expected !== fingerprint)) {
      issues.push({
        code: "ZK_VERIFICATION_KEY_HASH_MISMATCH",
        message: `Verification key (fingerprint ${fingerprint || "n/a"}, legacy digest ${verificationKeyHash}) does not match the expected ${expected}.`
      });
    } else if (keyOk) {
      anchor = "CALLER_PIN";
      if (registryEntry) pinnedId = registryEntry.id;
    }
  } else if (keyOk && registryEntry) {
    anchor = "PINNED_REGISTRY";
    pinnedId = registryEntry.id;
  }

  // 5. Trusted-setup accident detector (judged on canonical points only).
  if (keyOk && strengthReport.strength === "WEAK_TRAPDOOR_SUSPECTED" && !options.allowWeakVerificationKey) {
    issues.push({
      code: "ZK_VERIFICATION_KEY_WEAK_TRAPDOOR",
      message:
        "Verification key comes from a provably weak trusted setup (" +
        strengthReport.reasons.join("; ") +
        "): proofs can be forged for any public input. Pass allowWeakVerificationKey only for toy fixtures."
    });
  }

  if (issues.length > 0 || !scalarsOk || !coordsOk || !keyOk) return rejected();

  // 6. Pairing check in a cancellable child process. The engine (the optional peer snarkjs) must be installed.
  const engine = resolveEngineUrls();
  if ("unavailable" in engine) {
    issues.push(engineUnavailableIssue(engine.unavailable));
    return errored();
  }
  let pairingOk = false;
  try {
    pairingOk = await withPairingSlot(() => runPairingInChildProcess(engine.snarkjsUrl, vk, signals, proof, timeoutMs));
  } catch (error: any) {
    issues.push({
      code: "ZK_GROTH16_VERIFIER_ERROR",
      message:
        error?.message ||
        "An unexpected error occurred during snarkjs Groth16 cryptographic verification."
    });
    return errored();
  }

  if (!pairingOk) {
    issues.push({
      code: "ZK_GROTH16_PAIRING_FAILED",
      message:
        "Groth16 cryptographic pairing check failed: proof is mathematically invalid for the given verification key and public signals."
    });
    return rejected();
  }

  if (anchor === "UNANCHORED") {
    issues.push({
      code: "ZK_VERIFICATION_KEY_UNANCHORED",
      message:
        "The pairing check passed against a verification key that is not anchored to any trusted source (no expectedVerificationKeyHash, and the key is not in the pinned-key registry). " +
        "This only shows the proof is consistent with THIS key; whoever chose the key may know its trapdoor. Pin the key's fingerprint (" +
        fingerprint +
        ") obtained from a source you trust."
    });
    return {
      ok: false,
      verified: false,
      status: "ZK_GROTH16_MATH_VALID_UNANCHORED_VK",
      durationMs: Date.now() - start,
      summary: { ...summaryBase(), mathCheck: "PASS" },
      issues
    };
  }

  return {
    ok: true,
    verified: true,
    status: "ZK_GROTH16_MATH_VERIFIED",
    durationMs: Date.now() - start,
    summary: { ...summaryBase(), mathCheck: "PASS" },
    issues: []
  };
}
