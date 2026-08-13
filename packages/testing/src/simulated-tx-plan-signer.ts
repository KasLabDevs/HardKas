import { TxPlanArtifact } from "@hardkas/artifacts";
import { HardkasTxPlanSigner, SignTxPlanInput, SignTxPlanResult, HardkasSignerKind } from "@hardkas/accounts";

/**
 * Simulated signer for simnet development.
 * Produces deterministic signatures without real private keys.
 */
export class SimulatedTxPlanSigner implements HardkasTxPlanSigner {
  kind: HardkasSignerKind = "synthetic";

  async signTxPlan(input: SignTxPlanInput): Promise<SignTxPlanResult> {
    const { planArtifact } = input;
    const plan = planArtifact as TxPlanArtifact;
    return {
      signatureKind: "synthetic",
      signerAddress: plan.from.address,
      signedTransaction: {
        format: "simulated",
        payload: `simulated-signed-tx:${plan.planId}`
      }
    };
  }
}
