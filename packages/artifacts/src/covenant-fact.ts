import { HardkasSchemas } from "@hardkas/core";
import { CovenantTransitionFactSchema, type CovenantTransitionFact } from "./schemas.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "./canonical.js";
import { HARDKAS_VERSION } from "./constants.js";
import { checkArtifactIdentity, type CandidateCheck } from "./resolve.js";

export interface CreateCovenantTransitionFactOptions {
  readonly networkId: string;
  readonly covenantId: string;
  readonly contractName: string;
  readonly artifactSha256: string;
  readonly entrypoint: string;
  readonly policy?: string | undefined;
  readonly previousState?: Record<string, unknown> | undefined;
  readonly nextState?: Record<string, unknown> | undefined;
  readonly spentOutpoint: { readonly transactionId: string; readonly index: number };
  readonly successorOutpoint?: { readonly transactionId: string; readonly index: number } | undefined;
  readonly successorAmountSompi?: string | undefined;
  readonly planArtifactId: string;
  readonly draftArtifactId?: string | undefined;
  readonly txId: string;
  readonly validation: {
    readonly structuralPassed: boolean;
    readonly scriptVmPassed?: boolean | undefined;
    readonly vmStatus?: string | undefined;
    readonly diagnostic?: string | undefined;
  };
  readonly timestamp?: string | undefined;
}

export function createCovenantTransitionFactArtifact(
  options: CreateCovenantTransitionFactOptions
): CovenantTransitionFact {
  const body: Omit<CovenantTransitionFact, "contentHash"> = {
    schema: HardkasSchemas.CovenantTransitionFactV1 as any,
    hardkasVersion: HARDKAS_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    networkId: options.networkId as any,
    covenantId: options.covenantId.toLowerCase(),
    contractName: options.contractName,
    artifactSha256: options.artifactSha256,
    entrypoint: options.entrypoint,
    ...(options.policy ? { policy: options.policy } : {}),
    ...(options.previousState ? { previousState: JSON.parse(JSON.stringify(options.previousState)) } : {}),
    ...(options.nextState ? { nextState: JSON.parse(JSON.stringify(options.nextState)) } : {}),
    spentOutpoint: {
      transactionId: options.spentOutpoint.transactionId.toLowerCase(),
      index: Number(options.spentOutpoint.index)
    },
    ...(options.successorOutpoint
      ? {
          successorOutpoint: {
            transactionId: options.successorOutpoint.transactionId.toLowerCase(),
            index: Number(options.successorOutpoint.index)
          }
        }
      : {}),
    ...(options.successorAmountSompi ? { successorAmountSompi: options.successorAmountSompi } : {}),
    planArtifactId: options.planArtifactId,
    ...(options.draftArtifactId ? { draftArtifactId: options.draftArtifactId } : {}),
    txId: options.txId.toLowerCase(),
    validation: {
      structuralPassed: options.validation.structuralPassed,
      ...(options.validation.scriptVmPassed !== undefined ? { scriptVmPassed: options.validation.scriptVmPassed } : {}),
      ...(options.validation.vmStatus ? { vmStatus: options.validation.vmStatus } : {}),
      ...(options.validation.diagnostic ? { diagnostic: options.validation.diagnostic } : {})
    },
    timestamp: options.timestamp ?? new Date().toISOString()
  };

  const parsed = CovenantTransitionFactSchema.safeParse({
    ...body,
    contentHash: calculateContentHash(body as any, CURRENT_HASH_VERSION)
  });

  if (!parsed.success) {
    throw new Error(`CovenantTransitionFact invalid: ${parsed.error.message}`);
  }

  return parsed.data;
}

export function checkCovenantTransitionFactIdentity(fact: unknown): CandidateCheck {
  return checkArtifactIdentity(fact as any);
}
