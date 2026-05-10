import { IgraTxPlanArtifact } from "@hardkas/artifacts";

export interface IgraTxSigningInput {
  readonly plan: IgraTxPlanArtifact;
  readonly account?: {
    readonly name?: string;
    readonly address: string;
    readonly privateKey?: string;
  };
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
