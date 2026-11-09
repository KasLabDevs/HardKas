/**
 * Minimal BN254 (alt_bn128) field and curve arithmetic over BigInt, used only for VALIDATION and
 * ENCODING (canonical-point checks, curve and subgroup membership, key fingerprints, arkworks
 * point (de)compression). The pairing itself is never computed here: that stays in snarkjs (off-chain)
 * and arkworks (the rusty-kaspa precompile).
 *
 * Conventions:
 *   Fp  = GF(q), q = BN254 base field prime.
 *   Fp2 = Fp[u] / (u^2 + 1), an element is [c0, c1] = c0 + c1·u (snarkjs JSON order, arkworks order).
 *   G1: y^2 = x^3 + 3 over Fp (cofactor 1: on the curve <=> in the r-torsion subgroup).
 *   G2: y^2 = x^3 + 3 / (9 + u) over Fp2 (cofactor != 1: the subgroup check r·P = O is needed).
 *
 * This file has no imports and uses erasable TypeScript only.
 */

export const BN254_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
export const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export type Fp2 = readonly [bigint, bigint];
export interface G1Affine {
  readonly x: bigint;
  readonly y: bigint;
  readonly infinity: boolean;
}
export interface G2Affine {
  readonly x: Fp2;
  readonly y: Fp2;
  readonly infinity: boolean;
}

const Q = BN254_Q;

export function fpMod(a: bigint): bigint {
  const x = a % Q;
  return x < 0n ? x + Q : x;
}

export function fpPow(base: bigint, exp: bigint): bigint {
  let result = 1n;
  let b = fpMod(base);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % Q;
    b = (b * b) % Q;
    e >>= 1n;
  }
  return result;
}

export function fpInv(a: bigint): bigint {
  const v = fpMod(a);
  if (v === 0n) throw new RangeError("BN254: inverse of zero");
  return fpPow(v, Q - 2n);
}

/** Square root in Fp (q ≡ 3 mod 4); undefined when a is not a square. */
export function fpSqrt(a: bigint): bigint | undefined {
  const v = fpMod(a);
  const c = fpPow(v, (Q + 1n) / 4n);
  return (c * c) % Q === v ? c : undefined;
}

export const FP2_ZERO: Fp2 = [0n, 0n];
export const FP2_ONE: Fp2 = [1n, 0n];

export function fp2(c0: bigint, c1: bigint): Fp2 {
  return [fpMod(c0), fpMod(c1)];
}
export function fp2Add(a: Fp2, b: Fp2): Fp2 {
  return [fpMod(a[0] + b[0]), fpMod(a[1] + b[1])];
}
export function fp2Sub(a: Fp2, b: Fp2): Fp2 {
  return [fpMod(a[0] - b[0]), fpMod(a[1] - b[1])];
}
export function fp2Neg(a: Fp2): Fp2 {
  return [fpMod(-a[0]), fpMod(-a[1])];
}
export function fp2Mul(a: Fp2, b: Fp2): Fp2 {
  const t0 = a[0] * b[0];
  const t1 = a[1] * b[1];
  return [fpMod(t0 - t1), fpMod((a[0] + a[1]) * (b[0] + b[1]) - t0 - t1)];
}
export function fp2Sqr(a: Fp2): Fp2 {
  return fp2Mul(a, a);
}
export function fp2Scale(a: Fp2, k: bigint): Fp2 {
  return [fpMod(a[0] * k), fpMod(a[1] * k)];
}
export function fp2Eq(a: Fp2, b: Fp2): boolean {
  return fpMod(a[0]) === fpMod(b[0]) && fpMod(a[1]) === fpMod(b[1]);
}
export function fp2IsZero(a: Fp2): boolean {
  return fpMod(a[0]) === 0n && fpMod(a[1]) === 0n;
}
export function fp2Inv(a: Fp2): Fp2 {
  const t = fpInv(a[0] * a[0] + a[1] * a[1]);
  return [fpMod(a[0] * t), fpMod(-a[1] * t)];
}
export function fp2Conj(a: Fp2): Fp2 {
  return [fpMod(a[0]), fpMod(-a[1])];
}
export function fp2Pow(base: Fp2, exp: bigint): Fp2 {
  let result: Fp2 = FP2_ONE;
  let b = base;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = fp2Mul(result, b);
    b = fp2Sqr(b);
    e >>= 1n;
  }
  return result;
}

/**
 * Square root in Fp2 for q ≡ 3 (mod 4) (Adj & Rodríguez-Henríquez, "Square root computation over even
 * extension fields", Algorithm 9). Returns undefined when a is not a square.
 */
export function fp2Sqrt(a: Fp2): Fp2 | undefined {
  if (fp2IsZero(a)) return FP2_ZERO;
  const a1 = fp2Pow(a, (Q - 3n) / 4n);
  const alpha = fp2Mul(fp2Sqr(a1), a);
  const a0 = fp2Mul(fp2Conj(alpha), alpha); // alpha^q · alpha
  const minusOne: Fp2 = [Q - 1n, 0n];
  if (fp2Eq(a0, minusOne)) return undefined;
  const x0 = fp2Mul(a1, a);
  let x: Fp2;
  if (fp2Eq(alpha, minusOne)) {
    x = fp2Mul([0n, 1n], x0);
  } else {
    const b = fp2Pow(fp2Add(FP2_ONE, alpha), (Q - 1n) / 2n);
    x = fp2Mul(b, x0);
  }
  return fp2Eq(fp2Sqr(x), a) ? x : undefined;
}

/** b' = 3 / (9 + u): the constant of the sextic twist that carries G2. */
export const BN254_G2_B: Fp2 = fp2Mul([3n, 0n], fp2Inv([9n, 1n]));

export function g1IsOnCurve(p: G1Affine): boolean {
  if (p.infinity) return true;
  const lhs = (p.y * p.y) % Q;
  const rhs = fpMod(p.x * p.x * p.x + 3n);
  return lhs === rhs;
}

export function g2IsOnCurve(p: G2Affine): boolean {
  if (p.infinity) return true;
  const lhs = fp2Sqr(p.y);
  const rhs = fp2Add(fp2Mul(fp2Sqr(p.x), p.x), BN254_G2_B);
  return fp2Eq(lhs, rhs);
}

interface G2Jac {
  X: Fp2;
  Y: Fp2;
  Z: Fp2;
}

function g2JacDouble(p: G2Jac): G2Jac {
  if (fp2IsZero(p.Z)) return p;
  // dbl-2009-l (a = 0)
  const A = fp2Sqr(p.X);
  const B = fp2Sqr(p.Y);
  const C = fp2Sqr(B);
  const D = fp2Scale(fp2Sub(fp2Sub(fp2Sqr(fp2Add(p.X, B)), A), C), 2n);
  const E = fp2Scale(A, 3n);
  const F = fp2Sqr(E);
  const X3 = fp2Sub(F, fp2Scale(D, 2n));
  const Y3 = fp2Sub(fp2Mul(E, fp2Sub(D, X3)), fp2Scale(C, 8n));
  const Z3 = fp2Scale(fp2Mul(p.Y, p.Z), 2n);
  return { X: X3, Y: Y3, Z: Z3 };
}

/** acc + q, with q affine and finite (madd-2007-bl), handling the doubling and inverse cases. */
function g2JacAddAffine(acc: G2Jac, q: G2Affine): G2Jac {
  if (fp2IsZero(acc.Z)) return { X: q.x, Y: q.y, Z: FP2_ONE };
  const Z1Z1 = fp2Sqr(acc.Z);
  const U2 = fp2Mul(q.x, Z1Z1);
  const S2 = fp2Mul(fp2Mul(q.y, acc.Z), Z1Z1);
  const H = fp2Sub(U2, acc.X);
  const rr = fp2Scale(fp2Sub(S2, acc.Y), 2n);
  if (fp2IsZero(H)) {
    if (fp2IsZero(rr)) return g2JacDouble(acc);
    return { X: FP2_ONE, Y: FP2_ONE, Z: FP2_ZERO };
  }
  const HH = fp2Sqr(H);
  const I = fp2Scale(HH, 4n);
  const J = fp2Mul(H, I);
  const V = fp2Mul(acc.X, I);
  const X3 = fp2Sub(fp2Sub(fp2Sqr(rr), J), fp2Scale(V, 2n));
  const Y3 = fp2Sub(fp2Mul(rr, fp2Sub(V, X3)), fp2Scale(fp2Mul(acc.Y, J), 2n));
  const Z3 = fp2Sub(fp2Sub(fp2Sqr(fp2Add(acc.Z, H)), Z1Z1), HH);
  return { X: X3, Y: Y3, Z: Z3 };
}

function g2MulJac(p: G2Affine, k: bigint): G2Jac {
  let acc: G2Jac = { X: FP2_ONE, Y: FP2_ONE, Z: FP2_ZERO };
  if (p.infinity || k === 0n) return acc;
  for (let i = k.toString(2).length - 1; i >= 0; i--) {
    acc = g2JacDouble(acc);
    if ((k >> BigInt(i)) & 1n) acc = g2JacAddAffine(acc, p);
  }
  return acc;
}

/** Scalar multiplication on G2 (affine in, affine out). */
export function g2Mul(p: G2Affine, k: bigint): G2Affine {
  const j = g2MulJac(p, k);
  if (fp2IsZero(j.Z)) return { x: FP2_ZERO, y: FP2_ZERO, infinity: true };
  const zInv = fp2Inv(j.Z);
  const zInv2 = fp2Sqr(zInv);
  return { x: fp2Mul(j.X, zInv2), y: fp2Mul(j.Y, fp2Mul(zInv2, zInv)), infinity: false };
}

/** r·P = O: membership of a G2 point (already on the twist) in the prime-order subgroup. */
export function g2IsInSubgroup(p: G2Affine): boolean {
  if (p.infinity) return true;
  return fp2IsZero(g2MulJac(p, BN254_R).Z);
}

/** Scalar multiplication on G1 (affine, double-and-add; validation and test use only). */
export function g1Mul(p: G1Affine, k: bigint): G1Affine {
  let acc: G1Affine = { x: 0n, y: 0n, infinity: true };
  const kk = ((k % BN254_R) + BN254_R) % BN254_R;
  for (let i = kk.toString(2).length - 1; i >= 0 && kk > 0n; i--) {
    acc = g1Add(acc, acc);
    if ((kk >> BigInt(i)) & 1n) acc = g1Add(acc, p);
  }
  return acc;
}

export function g1Add(a: G1Affine, b: G1Affine): G1Affine {
  if (a.infinity) return b;
  if (b.infinity) return a;
  if (a.x === b.x) {
    if (fpMod(a.y + b.y) === 0n) return { x: 0n, y: 0n, infinity: true };
    const l = fpMod(3n * a.x * a.x * fpInv(2n * a.y));
    const x3 = fpMod(l * l - 2n * a.x);
    return { x: x3, y: fpMod(l * (a.x - x3) - a.y), infinity: false };
  }
  const l = fpMod((b.y - a.y) * fpInv(b.x - a.x));
  const x3 = fpMod(l * l - a.x - b.x);
  return { x: x3, y: fpMod(l * (a.x - x3) - a.y), infinity: false };
}

// --- arkworks compressed encoding (ark-serialize 0.4+/0.6, short Weierstrass flags) ---------------
// A compressed point is the x coordinate in little-endian (Fp: 32 bytes; Fp2: c0 then c1, 64 bytes)
// with the two spare top bits of the LAST byte used as flags: bit 7 = "y is negative" (y > -y in
// arkworks' ordering; Fp2 compares c1 first, then c0), bit 6 = point at infinity.

const FLAG_Y_NEGATIVE = 0x80;
const FLAG_INFINITY = 0x40;
const HALF_Q = (Q - 1n) / 2n;

function leBytesToBigint(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i] as number);
  return v;
}

function bigintToLe(v: bigint, len: number): Uint8Array {
  const out = new Uint8Array(len);
  let x = v;
  for (let i = 0; i < len; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

function fpIsNegative(y: bigint): boolean {
  return fpMod(y) > HALF_Q;
}

function fp2IsNegative(y: Fp2): boolean {
  // arkworks QuadExtField Ord: compare c1 first, then c0; "negative" means y > -y.
  const n = fp2Neg(y);
  if (fpMod(y[1]) !== n[1]) return fpMod(y[1]) > n[1];
  return fpMod(y[0]) > n[0];
}

export function g1Compress(p: G1Affine): Uint8Array {
  const out = bigintToLe(p.infinity ? 0n : p.x, 32);
  if (p.infinity) out[31] = (out[31] as number) | FLAG_INFINITY;
  else if (fpIsNegative(p.y)) out[31] = (out[31] as number) | FLAG_Y_NEGATIVE;
  return out;
}

export function g2Compress(p: G2Affine): Uint8Array {
  const out = new Uint8Array(64);
  out.set(bigintToLe(p.infinity ? 0n : p.x[0], 32), 0);
  out.set(bigintToLe(p.infinity ? 0n : p.x[1], 32), 32);
  if (p.infinity) out[63] = (out[63] as number) | FLAG_INFINITY;
  else if (fp2IsNegative(p.y)) out[63] = (out[63] as number) | FLAG_Y_NEGATIVE;
  return out;
}

/** Decompresses an arkworks compressed G1 point; undefined when it is not a valid curve point. */
export function g1Decompress(bytes: Uint8Array): G1Affine | undefined {
  if (bytes.length !== 32) return undefined;
  const last = bytes[31] as number;
  const flags = last & 0xc0;
  const raw = Uint8Array.from(bytes);
  raw[31] = last & 0x3f;
  const x = leBytesToBigint(raw);
  if (flags & FLAG_INFINITY) return x === 0n && !(flags & FLAG_Y_NEGATIVE) ? { x: 0n, y: 0n, infinity: true } : undefined;
  if (x >= Q) return undefined;
  const y = fpSqrt(x * x * x + 3n);
  if (y === undefined) return undefined;
  const neg = (flags & FLAG_Y_NEGATIVE) !== 0;
  const yy = fpIsNegative(y) === neg ? y : fpMod(-y);
  return { x, y: yy, infinity: false };
}

/** Decompresses an arkworks compressed G2 point; undefined when it is not on the twist. */
export function g2Decompress(bytes: Uint8Array): G2Affine | undefined {
  if (bytes.length !== 64) return undefined;
  const last = bytes[63] as number;
  const flags = last & 0xc0;
  const raw = Uint8Array.from(bytes);
  raw[63] = last & 0x3f;
  const x0 = leBytesToBigint(raw.subarray(0, 32));
  const x1 = leBytesToBigint(raw.subarray(32, 64));
  if (flags & FLAG_INFINITY) {
    return x0 === 0n && x1 === 0n && !(flags & FLAG_Y_NEGATIVE) ? { x: FP2_ZERO, y: FP2_ZERO, infinity: true } : undefined;
  }
  if (x0 >= Q || x1 >= Q) return undefined;
  const x: Fp2 = [x0, x1];
  const y = fp2Sqrt(fp2Add(fp2Mul(fp2Sqr(x), x), BN254_G2_B));
  if (y === undefined) return undefined;
  const neg = (flags & FLAG_Y_NEGATIVE) !== 0;
  const yy = fp2IsNegative(y) === neg ? y : fp2Neg(y);
  return { x, y: yy, infinity: false };
}

/** 32-byte big-endian encoding of a field element. */
export function fpToBe32(v: bigint): Uint8Array {
  return bigintToLe(fpMod(v), 32).reverse();
}

export function leBytesToBigintPublic(bytes: Uint8Array): bigint {
  return leBytesToBigint(bytes);
}
