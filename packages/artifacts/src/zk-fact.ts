import { HardkasSchemas } from "@hardkas/core";
import { ZkVerificationFactSchema, type ZkVerificationFact } from "./schemas.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "./canonical.js";
import { HARDKAS_VERSION } from "./constants.js";
import { checkArtifactIdentity, type CandidateCheck } from "./resolve.js";

export interface CreateZkVerificationFactOptions {
  readonly networkId: string;
  readonly provingSystem?: "Groth16" | undefined;
  readonly curve?: "BN254" | undefined;
  readonly guestSystem?: "RISC Zero" | "custom" | undefined;
  readonly imageId: string;
  readonly journalHash: string;
  readonly proofSha256: string;
  /**
   * The producer's statement that the proof was verified off-chain. HardKAS's own builder sets it only from
   * its verifier (verifyR0Groth16ReceiptLocal); a hand-built fact carries whatever its author asserts.
   */
  readonly verifiedOffChain: boolean;
  /** VERIFIED / NOT_PERFORMED / FAILED; defaults from verifiedOffChain (true -> VERIFIED, false -> NOT_PERFORMED). */
  readonly offChainVerification?: "VERIFIED" | "NOT_PERFORMED" | "FAILED" | undefined;
  /** Id of the verifier that produced a VERIFIED / FAILED status. */
  readonly offChainVerifier?: string | undefined;
  readonly spendUtxo: {
    readonly transactionId: string;
    readonly index: number;
    readonly amountSompi: string;
  };
  readonly p2shAddress: string;
  readonly redeemScriptHash: string;
  readonly planArtifactId?: string | undefined;
  readonly draftArtifactId?: string | undefined;
  readonly txId: string;
  readonly payoutAddress: string;
  readonly payoutSompi: string;
  readonly computeBudget: number;
  readonly feeSompi: string;
  /**
   * Optional wall-clock time. Omitted by default so that the fact's identity (contentHash) depends only on
   * what it records, never on when it was built (ZK-09); when given, it is part of the identity.
   */
  readonly timestamp?: string | undefined;
}

export function createZkVerificationFactArtifact(
  options: CreateZkVerificationFactOptions
): ZkVerificationFact {
  const offChainVerification =
    options.offChainVerification ?? (options.verifiedOffChain ? "VERIFIED" : "NOT_PERFORMED");
  if ((offChainVerification === "VERIFIED") !== Boolean(options.verifiedOffChain)) {
    throw new Error(
      `ZkVerificationFact invalid: verifiedOffChain=${String(options.verifiedOffChain)} contradicts offChainVerification=${offChainVerification}`
    );
  }
  const body: Omit<ZkVerificationFact, "contentHash"> = {
    schema: HardkasSchemas.ZkVerificationFactV1 as any,
    hardkasVersion: HARDKAS_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    networkId: options.networkId as any,
    provingSystem: options.provingSystem ?? "Groth16",
    curve: options.curve ?? "BN254",
    guestSystem: options.guestSystem ?? "RISC Zero",
    imageId: options.imageId.toLowerCase(),
    journalHash: options.journalHash.toLowerCase(),
    proofSha256: options.proofSha256.toLowerCase(),
    verifiedOffChain: Boolean(options.verifiedOffChain),
    offChainVerification,
    ...(options.offChainVerifier ? { offChainVerifier: options.offChainVerifier } : {}),
    spendUtxo: {
      transactionId: options.spendUtxo.transactionId.toLowerCase(),
      index: Number(options.spendUtxo.index),
      amountSompi: options.spendUtxo.amountSompi
    },
    p2shAddress: options.p2shAddress,
    redeemScriptHash: options.redeemScriptHash.toLowerCase(),
    ...(options.planArtifactId ? { planArtifactId: options.planArtifactId } : {}),
    ...(options.draftArtifactId ? { draftArtifactId: options.draftArtifactId } : {}),
    txId: options.txId.toLowerCase(),
    payoutAddress: options.payoutAddress,
    payoutSompi: options.payoutSompi,
    computeBudget: options.computeBudget,
    feeSompi: options.feeSompi,
    ...(options.timestamp !== undefined ? { timestamp: options.timestamp } : {})
  };

  const parsed = ZkVerificationFactSchema.safeParse({
    ...body,
    contentHash: calculateContentHash(body as any, CURRENT_HASH_VERSION)
  });

  if (!parsed.success) {
    throw new Error(`ZkVerificationFact invalid: ${parsed.error.message}`);
  }

  return parsed.data;
}

export function checkZkVerificationFactIdentity(fact: unknown): CandidateCheck {
  return checkArtifactIdentity(fact as any);
}
