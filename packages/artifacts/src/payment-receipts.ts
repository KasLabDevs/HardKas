import { HardkasSchemas, asNetworkId } from "@hardkas/core";
import type { NetworkId } from "@hardkas/core";
import type { PaymentReceiptArtifactV1 } from "./types.js";

export interface PaymentReceiptCreateRequest {
  invoice: {
    id: string;
    merchantId: string;
    paymentAddress: string;
    amountSompi: bigint;
  };
  paymentCheckResult: {
    status: string;
    amountFoundSompi: bigint;
    txId?: string;
    confirmations: number;
  };
  policyResult: {
    requiredConfirmations: number;
    riskProfile: string;
  };
  /** epoch ms — inject a fixed value in tests to keep the content hash deterministic */
  paidAt?: number;
  /** network the payment was received on — defaults to 'simnet' */
  networkId?: string;
}

export function createPaymentReceipt(request: PaymentReceiptCreateRequest): PaymentReceiptArtifactV1 {
  if (request.paymentCheckResult.status !== "confirmed") {
    throw new Error(`PAYMENT_RECEIPT_ERROR: Cannot create receipt for status '${request.paymentCheckResult.status}'. Status must be 'confirmed'.`);
  }
  
  if (request.paymentCheckResult.amountFoundSompi < request.invoice.amountSompi) {
    throw new Error(`PAYMENT_RECEIPT_ERROR: Cannot create receipt. Amount found (${request.paymentCheckResult.amountFoundSompi}) is less than expected (${request.invoice.amountSompi}).`);
  }

  if (request.paymentCheckResult.confirmations < request.policyResult.requiredConfirmations) {
    throw new Error(`PAYMENT_RECEIPT_ERROR: Cannot create receipt. Confirmations (${request.paymentCheckResult.confirmations}) is less than required (${request.policyResult.requiredConfirmations}).`);
  }

  if (!request.paymentCheckResult.txId) {
    throw new Error("PAYMENT_RECEIPT_ERROR: txId is missing in payment check result.");
  }

  return {
    schema: HardkasSchemas.PaymentReceiptV1,
    hardkasVersion: "0.11.3-alpha",
    version: "v1",
    networkId: asNetworkId(request.networkId ?? "simnet") as unknown as NetworkId,
    mode: "simulated",
    createdAt: new Date().toISOString(),
    invoiceId: request.invoice.id,
    merchantId: request.invoice.merchantId,
    paymentAddress: request.invoice.paymentAddress,
    expectedAmountSompi: request.invoice.amountSompi.toString(),
    amountFoundSompi: request.paymentCheckResult.amountFoundSompi.toString(),
    txId: request.paymentCheckResult.txId,
    confirmations: request.paymentCheckResult.confirmations,
    requiredConfirmations: request.policyResult.requiredConfirmations,
    status: "paid",
    paidAt: request.paidAt ?? Date.now(),
    policy: {
      model: "merchant-static-v1",
      riskProfile: request.policyResult.riskProfile
    },
    tracker: {
      model: "stateless-utxo-check-v1"
    },
    claims: {
      mainnet: false,
      productionSettlement: false,
      absoluteFinality: false,
      economicSafetyGuarantee: false
    }
  };
}
