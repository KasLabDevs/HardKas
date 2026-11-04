import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { legacyDomainDigest } from "@hardkas/artifacts";
import type {
  ZkGroth16ProofType,
  ZkGroth16VerificationKeyType,
  ZkGroth16PublicInputsType
} from "@hardkas/artifacts";

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
 * Best-effort assessment of a verification key's trusted setup. "WEAK_TRAPDOOR_SUSPECTED" means a
 * known-weak pattern was found (uncontributed powers of tau). "NO_KNOWN_WEAKNESS" means only that
 * no such pattern was found: a key whose discrete logarithms are known to its creator (alpha = a·G1
 * for a secret a) is indistinguishable from a sound one. Provenance of a key is never claimed.
 */
export type Groth16VerificationKeyStrength = "NO_KNOWN_WEAKNESS" | "WEAK_TRAPDOOR_SUSPECTED";

export interface Groth16VerifyMathOptions {
  /** Wall-clock budget for the pairing check; the verification worker is terminated when it elapses. */
  timeoutMs?: number;
  /** Accept a verification key whose trusted setup is provably weak (toy fixtures only). */
  allowWeakVerificationKey?: boolean;
  /** Reject unless the verification key's domain digest equals this value. */
  expectedVerificationKeyHash?: string;
}

export interface Groth16MathVerificationOutput {
  ok: boolean;
  verified: boolean;
  status:
    | "ZK_GROTH16_MATH_VERIFIED"
    | "ZK_GROTH16_MATH_REJECTED"
    | "ZK_GROTH16_VERIFIER_ERROR";
  durationMs: number;
  summary: {
    proofSystem: "groth16";
    curve: string;
    publicSignals: string[];
    mathCheck: "PASS" | "FAIL" | "ERROR";
    /** Domain digest (legacy corpus digest) of the verification key object that was used. */
    verificationKeyHash: string;
    /** Domain digest of the public inputs object that was used. */
    publicInputsHash: string;
    /** Domain digest of the proof object that was used. */
    proofHash: string;
    verificationKeyStrength: Groth16VerificationKeyStrength;
  };
  issues: ZkIssue[];
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
function checkG1(point: unknown, name: string, issues: ZkIssue[]): boolean {
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
function checkG2(point: unknown, name: string, issues: ZkIssue[]): boolean {
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
 * Validates that the proof's points are structurally canonical and their coordinates lie in [0, q).
 */
export function validateProofCoordinates(
  proof: ZkGroth16ProofType,
  issues: ZkIssue[]
): boolean {
  const a = checkG1((proof as any)?.pi_a, "pi_a", issues);
  const b = checkG2((proof as any)?.pi_b, "pi_b", issues);
  const c = checkG1((proof as any)?.pi_c, "pi_c", issues);
  return a && b && c;
}

/**
 * Validates the verification key's structure: every point canonical, IC non-empty, nPublic consistent.
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
  let ok = checkG1(v.vk_alpha_1, "vk_alpha_1", issues);
  if (!checkG2(v.vk_beta_2, "vk_beta_2", issues)) ok = false;
  if (!checkG2(v.vk_gamma_2, "vk_gamma_2", issues)) ok = false;
  if (!checkG2(v.vk_delta_2, "vk_delta_2", issues)) ok = false;
  for (let i = 0; i < v.IC.length; i++) if (!checkG1(v.IC[i], `IC[${i}]`, issues)) ok = false;
  if (typeof v.nPublic === "number" && v.nPublic !== v.IC.length - 1) {
    issues.push({
      code: "ZK_VERIFICATION_KEY_ARITY_MISMATCH",
      message: `Verification key declares nPublic=${v.nPublic} but carries ${v.IC.length - 1} input commitments.`
    });
    ok = false;
  }
  return ok;
}

function sameG1(point: unknown, gen: readonly [string, string]): boolean {
  return Array.isArray(point) && point.length === 3 && point[0] === gen[0] && point[1] === gen[1] && point[2] === "1";
}

function sameG2(point: unknown, gen: typeof BN254_G2_GENERATOR): boolean {
  return (
    Array.isArray(point) &&
    point.length === 3 &&
    Array.isArray(point[0]) &&
    Array.isArray(point[1]) &&
    point[0][0] === gen[0][0] &&
    point[0][1] === gen[0][1] &&
    point[1][0] === gen[1][0] &&
    point[1][1] === gen[1][1]
  );
}

function isInfinityG1(point: unknown): boolean {
  return Array.isArray(point) && point.length === 3 && point[2] === "0";
}

/**
 * Detects verification keys whose trusted setup is provably weak: alpha or beta equal to the
 * curve generator (uncontributed tau ceremony), beta equal to gamma, or an IC[0] at infinity.
 * With such a key the discrete logarithms of alpha, beta and gamma are public and proofs can be
 * forged for ANY public input (reproduced in the Phase 3 audit, finding H-01).
 */
export function assessVerificationKeyStrength(
  vk: ZkGroth16VerificationKeyType
): { strength: Groth16VerificationKeyStrength; reasons: string[] } {
  const v = (vk ?? {}) as any;
  const reasons: string[] = [];
  if (sameG1(v.vk_alpha_1, BN254_G1_GENERATOR)) reasons.push("vk_alpha_1 is the G1 generator (alpha = 1)");
  if (sameG2(v.vk_beta_2, BN254_G2_GENERATOR)) reasons.push("vk_beta_2 is the G2 generator (beta = 1)");
  if (
    Array.isArray(v.vk_beta_2) &&
    Array.isArray(v.vk_gamma_2) &&
    JSON.stringify(v.vk_beta_2) === JSON.stringify(v.vk_gamma_2)
  ) {
    reasons.push("vk_beta_2 equals vk_gamma_2");
  }
  if (Array.isArray(v.IC) && isInfinityG1(v.IC[0])) reasons.push("IC[0] is the point at infinity");
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

function resolveEngineUrls(): { snarkjsUrl: string } {
  const req = createRequire(import.meta.url);
  return { snarkjsUrl: pathToFileURL(req.resolve("snarkjs")).href };
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

async function runPairingInChildProcess(
  vk: unknown,
  publicSignals: string[],
  proof: unknown,
  timeoutMs: number
): Promise<boolean> {
  const { snarkjsUrl } = resolveEngineUrls();
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
 * Executes the Groth16 pairing check (snarkjs over BN254) after strict structural validation.
 * This function verifies the proof against the verification key IT IS GIVEN. It does not know
 * where that key came from: callers that need provenance pass `expectedVerificationKeyHash`
 * or use `verifyZkProofMath`, which binds the key to the fixture's content hashes.
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
  const verificationKeyHash = legacyDomainDigest(vk);
  const publicInputsHash = legacyDomainDigest(publicInputs);
  const proofHash = legacyDomainDigest(proof);
  const strengthReport = assessVerificationKeyStrength(vk);

  const summaryBase = {
    proofSystem: "groth16" as const,
    curve,
    publicSignals: signals,
    verificationKeyHash,
    publicInputsHash,
    proofHash,
    verificationKeyStrength: strengthReport.strength
  };
  const rejected = (): Groth16MathVerificationOutput => ({
    ok: false,
    verified: false,
    status: "ZK_GROTH16_MATH_REJECTED",
    durationMs: Date.now() - start,
    summary: { ...summaryBase, mathCheck: "FAIL" },
    issues
  });
  const errored = (): Groth16MathVerificationOutput => ({
    ok: false,
    verified: false,
    status: "ZK_GROTH16_VERIFIER_ERROR",
    durationMs: Date.now() - start,
    summary: { ...summaryBase, mathCheck: "ERROR" },
    issues
  });

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

  // 2. Expected key binding, when the caller has provenance for a key.
  if (options.expectedVerificationKeyHash !== undefined) {
    const expected = String(options.expectedVerificationKeyHash).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(expected)) {
      issues.push({
        code: "ZK_EXPECTED_VERIFICATION_KEY_HASH_INVALID",
        message: "expectedVerificationKeyHash must be a 64-hex SHA-256 domain digest."
      });
    } else if (expected !== verificationKeyHash) {
      issues.push({
        code: "ZK_VERIFICATION_KEY_HASH_MISMATCH",
        message: `Verification key digest ${verificationKeyHash} does not match the expected ${expected}.`
      });
    }
  }

  // 3. Structure: canonical points, complete key, arity.
  const keyOk = validateVerificationKeyStructure(vk, issues);
  const scalarsOk = validatePublicSignals(signals, issues);
  const coordsOk = validateProofCoordinates(proof, issues);
  if (keyOk && Array.isArray((vk as any).IC) && signals.length !== (vk as any).IC.length - 1) {
    issues.push({
      code: "ZK_PUBLIC_INPUT_ARITY_MISMATCH",
      message: `Expected ${(vk as any).IC.length - 1} public inputs for this verification key, got ${signals.length}.`
    });
  }

  // 4. Trusted-setup strength.
  if (strengthReport.strength === "WEAK_TRAPDOOR_SUSPECTED" && !options.allowWeakVerificationKey) {
    issues.push({
      code: "ZK_VERIFICATION_KEY_WEAK_TRAPDOOR",
      message:
        "Verification key comes from a provably weak trusted setup (" +
        strengthReport.reasons.join("; ") +
        "): proofs can be forged for any public input. Pass allowWeakVerificationKey only for toy fixtures."
    });
  }

  if (issues.length > 0 || !scalarsOk || !coordsOk || !keyOk) return rejected();

  // 5. Pairing check in a cancellable child process.
  let verified = false;
  try {
    verified = await runPairingInChildProcess(vk, signals, proof, timeoutMs);
  } catch (error: any) {
    issues.push({
      code: "ZK_GROTH16_VERIFIER_ERROR",
      message:
        error?.message ||
        "An unexpected error occurred during snarkjs Groth16 cryptographic verification."
    });
    return errored();
  }

  if (!verified) {
    issues.push({
      code: "ZK_GROTH16_PAIRING_FAILED",
      message:
        "Groth16 cryptographic pairing check failed: proof is mathematically invalid for the given verification key and public signals."
    });
    return rejected();
  }

  return {
    ok: true,
    verified: true,
    status: "ZK_GROTH16_MATH_VERIFIED",
    durationMs: Date.now() - start,
    summary: { ...summaryBase, mathCheck: "PASS" },
    issues: []
  };
}
