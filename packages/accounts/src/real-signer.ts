import { TxPlan } from "@hardkas/tx-builder";
import { RealDevAccount } from "./real-accounts.js";

export interface RealTxSigningInput {
  readonly plan: TxPlan;
  readonly account: RealDevAccount;
}

export interface RealTxSigningResult {
  readonly signedTransaction: {
    readonly format: "kaspa-sdk" | "hex" | "json" | "simulated" | "unknown";
    readonly payload: string;
  };
  readonly txId?: string;
}

export interface RealTxSigner {
  sign(input: RealTxSigningInput): Promise<RealTxSigningResult>;
}

export class UnsupportedRealTxSigner implements RealTxSigner {
  async sign(): Promise<RealTxSigningResult> {
    throw new Error(
      "Real transaction signing is not configured yet. Install/configure a supported Kaspa SDK signer adapter."
    );
  }
}
