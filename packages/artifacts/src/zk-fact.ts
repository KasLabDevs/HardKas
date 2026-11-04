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
  readonly verifiedOffChain: boolean;
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
  readonly timestamp?: string | undefined;
}

export function createZkVerificationFactArtifact(
  options: CreateZkVerificationFactOptions
): ZkVerificationFact {
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
    timestamp: options.timestamp ?? new Date().toISOString()
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
