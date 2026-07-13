import { TxPlanArtifact } from "@hardkas/artifacts";
import { HardkasTxPlanSigner, SignTxPlanInput, SignTxPlanResult, HardkasSignerKind } from "@hardkas/accounts";

/**
 * Simulated signer for simnet development.
 * Produces deterministic signatures without real private keys.
 */
export class SimulatedTxPlanSigner implements HardkasTxPlanSigner {
  kind: HardkasSignerKind = "simulated";

  async signTxPlan(input: SignTxPlanInput): Promise<SignTxPlanResult> {
    const plan = input.planArtifact as TxPlanArtifact;
    return {
      signatureKind: "simulated",
      signerAddress: plan.from.address,
      signedTransaction: {
        format: "simulated",
        payload: `simulated-signed-tx:${plan.planId}`
      }
    };
  }
}
