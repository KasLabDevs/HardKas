import { createHash } from "node:crypto";
import { HardkasSchemas } from "@hardkas/artifacts";
import {
  g1Compress,
  g1Decompress,
  g1IsOnCurve,
  g2Compress,
  g2Decompress,
  g2IsOnCurve,
  leBytesToBigintPublic,
  BN254_Q,
  type G1Affine,
  type G2Affine
} from "./bn254.js";
import { verifyGroth16Math, type Groth16MathVerificationOutput } from "./groth16-verifier.js";

/**
 * RISC Zero Groth16 receipts (the "Groth16 wrapper" of a zkVM execution) as Kaspa Toccata verifies them
 * with OpZkPrecompile tag 0x20. This module (a) recomputes the ReceiptClaim digest from (imageId,
 * journalHash) to cross-check a receipt (HK-19) and (b) verifies the receipt's Groth16 proof locally with
 * snarkjs against the PINNED official RISC Zero verifying key (CA-ZK-03).
 *
 * Pinned constants and their sources (all official releases):
 *   - verifying key: risc0 v3.0.4, risc0/groth16/src/verifier.rs (ALPHA_X … IC5_Y, decimal); compressed by
 *     arkworks it is R0_SERIALIZED_COMPRESSED_VK of rusty-kaspa v2.1.0
 *     crypto/txscript/zk-sdk/src/zk_to_script/fragments/groth16.rs (whose test verify_upstream_vk_roundtrip
 *     compares it with risc0_groth16::verifying_key()) and the 424-byte key the kaspa-wasm 2.1.0
 *     ZkScriptBuilder embeds in the redeem script;
 *   - control root and BN254 control id: risc0 v3.0.4, risc0/circuit/recursion/src/control_id.rs
 *     (ALLOWED_CONTROL_ROOT, BN254_IDENTITY_CONTROL_ID), the defaults of Groth16ReceiptVerifierParameters
 *     that rusty-kaspa 2.1.0 (risc0-groth16 =3.0.4, risc0-circuit-recursion =4.0.4) pushes in the script.
 * The public inputs are [a0, a1, c0, c1, id] exactly as risc0-groth16 Verifier::new builds them:
 * (a0, a1) = split_digest(control_root), (c0, c1) = split_digest(claim_digest), id = bn254_control_id
 * byte-reversed, i.e. each 16-byte half / the id read as a little-endian integer.
 */

export const R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX =
  "e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2dabb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036789edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e1933033e7fea1f40604eaacf699d4be9aacc577054a0db22d9129a1728ff85a01a1c3af829b62bf4914c0bcf2c81a4bd577190eff5f194ee9bac95faefd53cb0030600000000000000e43bdc655d0f9d730535554d9caa611ddd152c081a06a932a8e1d5dc259aac123f42a188f683d869873ccc4c119442e57b056e03e2fa92f2028c97bc20b9078747c30f85444697fdf436e348711c011115963f855197243e4b39e6cbe236ca8ba7f2042e11f9255afbb6c6e2c3accb88e401f2aac21c097c92b3fbdb99f98a9b0dcd6c075ada6ed0ddfece1d4a2d005f61a7d5df0b75c18a5b2374d64e495fab93d4c4b1200394d5253cce2f25a59b862ee8e4cd43686603faa09d5d0d3c1c8f";

/** risc0 v3.0.4 ALLOWED_CONTROL_ROOT. */
export const R0_GROTH16_CONTROL_ROOT = "a54dc85ac99f851c92d7c96d7318af41dbe7c0194edfcc37eb4d422a998c1f56";
/** risc0 v3.0.4 BN254_IDENTITY_CONTROL_ID. */
export const R0_GROTH16_BN254_CONTROL_ID = "c07a65145c3cb48b6101962ea607a4dd93c753bb26975cb47feb00d3666e4404";

export const R0_GROTH16_VERIFIER_ID = "hardkas-r0-groth16-snarkjs-v1";
export const R0_GROTH16_PINNED_KEY_ID = "risc0-groth16-bn254-v3.0.4";

const g1Json = (p: G1Affine): [string, string, string] =>
  p.infinity ? ["0", "1", "0"] : [p.x.toString(), p.y.toString(), "1"];
const g2Json = (p: G2Affine): [[string, string], [string, string], [string, string]] =>
  p.infinity
    ? [["0", "0"], ["1", "0"], ["0", "0"]]
    : [
        [p.x[0].toString(), p.x[1].toString()],
        [p.y[0].toString(), p.y[1].toString()],
        ["1", "0"]
      ];

function decodePinnedVerificationKey() {
  const vk = Buffer.from(R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX, "hex");
  const alpha = g1Decompress(vk.subarray(0, 32));
  const beta = g2Decompress(vk.subarray(32, 96));
  const gamma = g2Decompress(vk.subarray(96, 160));
  const delta = g2Decompress(vk.subarray(160, 224));
  const n = Number(vk.readBigUInt64LE(224));
  const ic = Array.from({ length: n }, (_, i) => g1Decompress(vk.subarray(232 + 32 * i, 264 + 32 * i)));
  if (!alpha || !beta || !gamma || !delta || ic.some((p) => !p) || vk.length !== 232 + 32 * n) {
    throw new Error("R0_GROTH16_PINNED_KEY_INVALID: the pinned RISC Zero verifying key does not decode");
  }
  return {
    schema: HardkasSchemas.ZkGroth16VerificationKeyV1,
    protocol: "groth16" as const,
    curve: "bn128",
    verificationKeyId: R0_GROTH16_PINNED_KEY_ID,
    nPublic: n - 1,
    vk_alpha_1: g1Json(alpha),
    vk_beta_2: g2Json(beta),
    vk_gamma_2: g2Json(gamma),
    vk_delta_2: g2Json(delta),
    IC: (ic as G1Affine[]).map(g1Json)
  };
}

/** The pinned RISC Zero Groth16 verifying key in snarkjs JSON form (decoded from the compressed bytes). */
export const R0_GROTH16_VERIFICATION_KEY = Object.freeze(decodePinnedVerificationKey());

// --- ReceiptClaim digest (rusty-kaspa 2.1.0 risc0/receipt_claim.rs, risc0_binfmt::tagged_struct) -------

function sha256(...parts: Uint8Array[]): Buffer {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
}

function u32le(v: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v, 0);
  return b;
}
function u16le(v: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v, 0);
  return b;
}

/** tagged_struct(tag, down, data) = SHA-256(SHA-256(tag) || down... || u32-LE(data)... || u16-LE(|down|)). */
function taggedStruct(tag: string, down: Uint8Array[], data: number[]): Buffer {
  return sha256(sha256(Buffer.from(tag, "utf8")), ...down, ...data.map(u32le), u16le(down.length));
}

const HEX32 = /^[0-9a-f]{64}$/;

/**
 * Digest of the ReceiptClaim of a zkVM execution that ended Halted(0) with the given image id and journal
 * digest (input = 0, post = SystemState{pc 0, merkle_root 0}, assumptions = 0), as rusty-kaspa's
 * compute_assert_claim and the Toccata redeem script compute it.
 */
export function computeR0ReceiptClaimDigest(imageId: string, journalHash: string): string {
  const image = String(imageId ?? "").trim().toLowerCase();
  const journal = String(journalHash ?? "").trim().toLowerCase();
  if (!HEX32.test(image)) throw new RangeError("imageId must be 64 hex characters");
  if (!HEX32.test(journal)) throw new RangeError("journalHash must be 64 hex characters");
  const zero = Buffer.alloc(32);
  const post = taggedStruct("risc0.SystemState", [zero], [0]);
  const output = taggedStruct("risc0.Output", [Buffer.from(journal, "hex"), zero], []);
  return taggedStruct("risc0.ReceiptClaim", [zero, Buffer.from(image, "hex"), post, output], [0, 0]).toString("hex");
}

export interface R0Groth16ReceiptParse {
  ok: boolean;
  /** 256-byte Groth16 seal (a || b || c, big-endian, b as [x.c1, x.c0, y.c1, y.c0]). */
  sealHex: string;
  /** How the receipt carries its claim: a pruned digest (checkable) or the full value (not decoded here). */
  claimEncoding: "PRUNED_DIGEST" | "UNPRUNED_VALUE" | "UNKNOWN";
  claimDigest?: string;
  verifierParameters?: string;
  issues: Array<{ code: string; message: string }>;
}

/**
 * Parses a Borsh Groth16Receipt<ReceiptClaim>: u32-LE seal length, seal, MaybePruned<ReceiptClaim>
 * (tag 0 = Value, 1 = Pruned(digest)), verifier_parameters digest.
 */
export function parseR0Groth16Receipt(receiptHex: string): R0Groth16ReceiptParse {
  const issues: R0Groth16ReceiptParse["issues"] = [];
  const hex = String(receiptHex ?? "").trim().toLowerCase();
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/.test(hex) || hex.length < 8) {
    issues.push({ code: "ZK_RECEIPT_MALFORMED", message: "receipt must be an even-length hex string" });
    return { ok: false, sealHex: "", claimEncoding: "UNKNOWN", issues };
  }
  const b = Buffer.from(hex, "hex");
  const sealLen = b.readUInt32LE(0);
  if (sealLen !== 256 || b.length < 4 + sealLen + 1) {
    issues.push({ code: "ZK_RECEIPT_MALFORMED", message: `expected a 256-byte Groth16 seal, got length field ${sealLen} in ${b.length} bytes` });
    return { ok: false, sealHex: "", claimEncoding: "UNKNOWN", issues };
  }
  const sealHex = b.subarray(4, 4 + sealLen).toString("hex");
  const tag = b[4 + sealLen];
  if (tag === 1) {
    if (b.length !== 4 + sealLen + 1 + 32 + 32) {
      issues.push({ code: "ZK_RECEIPT_MALFORMED", message: `a pruned-claim receipt must be ${4 + sealLen + 65} bytes, got ${b.length}` });
      return { ok: false, sealHex, claimEncoding: "PRUNED_DIGEST", issues };
    }
    return {
      ok: true,
      sealHex,
      claimEncoding: "PRUNED_DIGEST",
      claimDigest: b.subarray(5 + sealLen, 37 + sealLen).toString("hex"),
      verifierParameters: b.subarray(37 + sealLen).toString("hex"),
      issues
    };
  }
  if (tag === 0) return { ok: true, sealHex, claimEncoding: "UNPRUNED_VALUE", issues };
  issues.push({ code: "ZK_RECEIPT_MALFORMED", message: `unknown MaybePruned tag ${String(tag)}` });
  return { ok: false, sealHex, claimEncoding: "UNKNOWN", issues };
}

const leHalf = (hex: string) => leBytesToBigintPublic(Buffer.from(hex, "hex")).toString();

/** The five public inputs of the RISC Zero Groth16 wrapper for a claim digest. */
export function r0Groth16PublicSignals(claimDigest: string): string[] {
  const claim = String(claimDigest).toLowerCase();
  if (!HEX32.test(claim)) throw new RangeError("claimDigest must be 64 hex characters");
  return [
    leHalf(R0_GROTH16_CONTROL_ROOT.slice(0, 32)),
    leHalf(R0_GROTH16_CONTROL_ROOT.slice(32)),
    leHalf(claim.slice(0, 32)),
    leHalf(claim.slice(32)),
    leHalf(R0_GROTH16_BN254_CONTROL_ID)
  ];
}

/** Decodes the seal into a snarkjs proof and the 128-byte arkworks compressed proof (what the script pushes). */
export function r0SealToProof(sealHex: string):
  | { ok: true; proof: any; compressedProof: string }
  | { ok: false; reason: string } {
  const seal = Buffer.from(String(sealHex), "hex");
  if (seal.length !== 256) return { ok: false, reason: "seal must be 256 bytes" };
  const w = (i: number) => BigInt("0x" + seal.subarray(i * 32, i * 32 + 32).toString("hex"));
  const words = Array.from({ length: 8 }, (_, i) => w(i));
  if (words.some((v) => v >= BN254_Q)) return { ok: false, reason: "seal coordinate outside the base field" };
  const A: G1Affine = { x: words[0]!, y: words[1]!, infinity: false };
  const B: G2Affine = { x: [words[3]!, words[2]!], y: [words[5]!, words[4]!], infinity: false };
  const C: G1Affine = { x: words[6]!, y: words[7]!, infinity: false };
  if (!g1IsOnCurve(A) || !g1IsOnCurve(C) || !g2IsOnCurve(B)) return { ok: false, reason: "seal point not on the curve" };
  const compressedProof = Buffer.concat([g1Compress(A), g2Compress(B), g1Compress(C)]).toString("hex");
  return {
    ok: true,
    compressedProof,
    proof: {
      schema: HardkasSchemas.ZkGroth16ProofV1,
      protocol: "groth16",
      curve: "bn128",
      proofId: "risc0-groth16-seal",
      pi_a: g1Json(A),
      pi_b: g2Json(B),
      pi_c: g1Json(C)
    }
  };
}

// --- Public test vectors ---------------------------------------------------------------------------

/**
 * Receipts that are PUBLIC: their (imageId, journalHash) claim has a published valid receipt, so a P2SH
 * locked to that image id can be spent by anyone (the R0 lock binds only the image id; HK-16). HardKAS
 * never returns testnet/mainnet addresses for these.
 */
export const PUBLIC_R0_TEST_VECTORS: ReadonlyArray<{ readonly name: string; readonly imageId: string; readonly journalHash: string }> =
  Object.freeze([
    Object.freeze({
      name: "kaspanet/kaspa-python-sdk examples/zk groth.rcpt.hex (fixtures/toccata-v2/zk/r0-groth16-official)",
      imageId: "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0",
      journalHash: "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456"
    })
  ]);

export function findPublicR0TestVector(imageId: string, journalHash: string) {
  const i = String(imageId ?? "").trim().toLowerCase();
  const j = String(journalHash ?? "").trim().toLowerCase();
  return PUBLIC_R0_TEST_VECTORS.find((v) => v.imageId === i && v.journalHash === j);
}

// --- Local verification (CA-ZK-03) ----------------------------------------------------------------

export interface R0Groth16LocalVerificationResult {
  ok: boolean;
  verified: boolean;
  status: "ZK_R0_GROTH16_RECEIPT_VERIFIED" | "ZK_R0_GROTH16_RECEIPT_REJECTED" | "ZK_R0_GROTH16_VERIFIER_ERROR";
  verifier: typeof R0_GROTH16_VERIFIER_ID;
  imageId: string;
  journalHash: string;
  /** Claim digest computed from (imageId, journalHash): the proof is checked against THIS claim. */
  claimDigest: string;
  /** Claim digest stored in the receipt when it is pruned ("" otherwise). */
  receiptClaimDigest: string;
  /** 128-byte arkworks-compressed proof derived from the seal (what the signature script pushes). */
  compressedProof: string;
  publicSignals: string[];
  pinnedVerificationKeyId: typeof R0_GROTH16_PINNED_KEY_ID;
  controlRoot: string;
  bn254ControlId: string;
  math?: Groth16MathVerificationOutput["summary"];
  durationMs: number;
  issues: Array<{ code: string; message: string }>;
}

const GENUINE_RESULTS = new WeakSet<object>();

/** True only for a result object produced by verifyR0Groth16ReceiptLocal in this process. */
export function isHardkasR0Groth16Verification(value: unknown): value is R0Groth16LocalVerificationResult {
  return typeof value === "object" && value !== null && GENUINE_RESULTS.has(value);
}

/**
 * Verifies a RISC Zero Groth16 receipt locally: recomputes the claim digest from (imageId, journalHash),
 * derives the five public inputs with the pinned control root / BN254 control id, decodes the seal and runs
 * the snarkjs pairing against the pinned RISC Zero verifying key (anchored: PINNED_REGISTRY). A VERIFIED
 * result means "a valid RISC Zero Groth16 proof exists for this program and journal". It says nothing about
 * what the guest program does, and it is not on-chain acceptance (the node decides; the off-chain and
 * on-chain verifiers are different implementations: snarkjs vs arkworks).
 */
export async function verifyR0Groth16ReceiptLocal(params: {
  receiptHex: string;
  imageId: string;
  journalHash: string;
  timeoutMs?: number;
}): Promise<R0Groth16LocalVerificationResult> {
  const start = Date.now();
  const issues: R0Groth16LocalVerificationResult["issues"] = [];
  const imageId = String(params.imageId ?? "").trim().toLowerCase();
  const journalHash = String(params.journalHash ?? "").trim().toLowerCase();
  const base = {
    verifier: R0_GROTH16_VERIFIER_ID,
    imageId,
    journalHash,
    pinnedVerificationKeyId: R0_GROTH16_PINNED_KEY_ID,
    controlRoot: R0_GROTH16_CONTROL_ROOT,
    bn254ControlId: R0_GROTH16_BN254_CONTROL_ID
  } as const;
  const finish = (
    status: R0Groth16LocalVerificationResult["status"],
    extra: Partial<R0Groth16LocalVerificationResult>
  ): R0Groth16LocalVerificationResult => {
    const result: R0Groth16LocalVerificationResult = {
      ok: status === "ZK_R0_GROTH16_RECEIPT_VERIFIED",
      verified: status === "ZK_R0_GROTH16_RECEIPT_VERIFIED",
      status,
      ...base,
      claimDigest: "",
      receiptClaimDigest: "",
      compressedProof: "",
      publicSignals: [],
      durationMs: Date.now() - start,
      issues,
      ...extra
    };
    if (result.verified) GENUINE_RESULTS.add(result);
    return result;
  };

  let claimDigest: string;
  try {
    claimDigest = computeR0ReceiptClaimDigest(imageId, journalHash);
  } catch (error: any) {
    issues.push({ code: "ZK_INVALID_CLAIM_INPUT", message: error?.message ?? String(error) });
    return finish("ZK_R0_GROTH16_RECEIPT_REJECTED", {});
  }
  const parsed = parseR0Groth16Receipt(params.receiptHex);
  issues.push(...parsed.issues);
  if (!parsed.ok) return finish("ZK_R0_GROTH16_RECEIPT_REJECTED", { claimDigest });
  const receiptClaimDigest = parsed.claimDigest ?? "";
  if (receiptClaimDigest && receiptClaimDigest !== claimDigest) {
    issues.push({
      code: "ZK_RECEIPT_CLAIM_MISMATCH",
      message: `The receipt's claim digest ${receiptClaimDigest} is not the claim of (imageId, journalHash) = ${claimDigest}.`
    });
  }
  const seal = r0SealToProof(parsed.sealHex);
  if (!seal.ok) {
    issues.push({ code: "ZK_RECEIPT_SEAL_INVALID", message: seal.reason });
    return finish("ZK_R0_GROTH16_RECEIPT_REJECTED", { claimDigest, receiptClaimDigest });
  }
  const publicSignals = r0Groth16PublicSignals(claimDigest);
  const math = await verifyGroth16Math(
    R0_GROTH16_VERIFICATION_KEY as any,
    { schema: HardkasSchemas.ZkGroth16PublicInputsV1, publicSignals } as any,
    seal.proof,
    params.timeoutMs !== undefined ? { timeoutMs: params.timeoutMs } : {}
  );
  issues.push(...math.issues);
  const extra = { claimDigest, receiptClaimDigest, compressedProof: seal.compressedProof, publicSignals, math: math.summary };
  if (math.status === "ZK_GROTH16_VERIFIER_ERROR") return finish("ZK_R0_GROTH16_VERIFIER_ERROR", extra);
  if (!math.verified || math.summary.pinnedVerificationKeyId !== R0_GROTH16_PINNED_KEY_ID || issues.length > 0) {
    return finish("ZK_R0_GROTH16_RECEIPT_REJECTED", extra);
  }
  return finish("ZK_R0_GROTH16_RECEIPT_VERIFIED", extra);
}
