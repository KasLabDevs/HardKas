import { TxPlanArtifact, SYNTHETIC_AUTHORIZATION_FORMAT, syntheticTxIdFor } from "@hardkas/artifacts";
import { HardkasTxPlanSigner, SignTxPlanInput, SignTxPlanResult, HardkasSignerKind } from "@hardkas/accounts";

/**
 * Synthetic authorizer for simnet development (Wave 1.4 · IC-6′.4).
 * Produces no signature: it authorizes the plan by its identity, deterministically,
 * without private keys. The txId is the single synthetic scheme `synthetic-<planArtifactId>`.
 */
export class SimulatedTxPlanSigner implements HardkasTxPlanSigner {
  kind: HardkasSignerKind = "synthetic";

  async signTxPlan(input: SignTxPlanInput): Promise<SignTxPlanResult> {
    const { planArtifact } = input;
    const plan = planArtifact as TxPlanArtifact;
    const planArtifactId = typeof plan.contentHash === "string" ? plan.contentHash : "";
    return {
      signatureKind: "synthetic",
      signerAddress: plan.from.address,
      ...(/^[0-9a-f]{64}$/.test(planArtifactId) ? { txId: syntheticTxIdFor(planArtifactId) } : {}),
      signedTransaction: {
        format: SYNTHETIC_AUTHORIZATION_FORMAT,
        payload: planArtifactId
      }
    };
  }
}
