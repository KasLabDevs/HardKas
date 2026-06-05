import { TxPlanArtifact, SignedTxArtifact } from "./types.js";

/**
 * Interface for external wallets and signers.
 * HardKAS uses this to delegate transaction signing to secure enclaves,
 * hardware wallets, or official Kaspa SDK backends, ensuring it does not
 * need to hold or manage private keys natively.
 */
export interface ExternalHardkasSigner {
  /**
   * Retrieves the public Kaspa address managed by this signer.
   */
  getAddress(): Promise<string>;

  /**
   * Signs a prepared transaction plan.
   * @param txPlan The transaction plan artifact to sign.
   * @returns A signed transaction artifact.
   */
  signTransaction(txPlan: TxPlanArtifact): Promise<SignedTxArtifact>;
}
