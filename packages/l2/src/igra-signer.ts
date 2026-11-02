import { IgraTxPlanArtifact } from "@hardkas/artifacts";
import type { L2NetworkProfile } from "./profiles.js";
import type { L2FeeLimitsInput } from "./network-guard.js";

/** Network binding a plan signer must enforce (chain, mainnet authorization, fee ceilings). */
export interface IgraTxSigningGuard {
  readonly expectedChainId: number;
  readonly profile?: L2NetworkProfile | undefined;
  readonly allowMainnet?: boolean | undefined;
  readonly feeLimits?: L2FeeLimitsInput | undefined;
}

export interface IgraTxSigningInput {
  readonly plan: IgraTxPlanArtifact;
  readonly account?: {
    readonly name?: string;
    readonly address: string;
    readonly privateKey?: string;
  };
  readonly guard?: IgraTxSigningGuard | undefined;
}

export interface IgraTxSigningResult {
  readonly rawTransaction: string;
  readonly txHash?: string;
}

export interface IgraTxSigner {
  sign(input: IgraTxSigningInput): Promise<IgraTxSigningResult>;
}

export class UnsupportedIgraTxSigner implements IgraTxSigner {
  async sign(): Promise<IgraTxSigningResult> {
    throw new Error(
      "Igra L2 transaction signing is not configured yet. Configure an EVM-compatible signer adapter in a future phase."
    );
  }
}
