/**
 * PaymentTracker — Builder Lab 02, Friction #04
 * 
 * A stateless utility to detect payments by querying UTXOs.
 * It reuses WalletQuery as the underlying query engine.
 */

import type { WalletQuery } from "./wallet-query.js";

export interface PaymentCheckRequest {
    readonly address: string;
    readonly expectedAmountSompi: bigint;
    readonly requiredConfirmations: number;
    readonly queryEngine: WalletQuery;
}

export type PaymentStatus = "not_found" | "partially_paid" | "mempool" | "confirmed";

export interface PaymentCheckResult {
    readonly status: PaymentStatus;
    readonly amountFoundSompi: bigint;
    readonly confirmations: number;
    readonly txId?: string;
    readonly model: "stateless-utxo-check-v1";
}

export async function checkPaymentStatus(request: PaymentCheckRequest): Promise<PaymentCheckResult> {
    if (request.expectedAmountSompi <= 0n) {
        throw new Error("PAYMENT_TRACKER_INVALID_AMOUNT: Expected amount must be strictly positive.");
    }

    const queryRes = await request.queryEngine.getUtxos([request.address]);

    // Handle degraded query results securely
    if (!queryRes.ok) {
        throw new Error("PAYMENT_TRACKER_QUERY_FAILED: Could not retrieve UTXOs. " + queryRes.error);
    }

    const addressUtxos = queryRes.utxos[request.address] || [];

    let amountFoundSompi = 0n;
    let minConfirmations = Number.MAX_SAFE_INTEGER;
    let txId: string | undefined = undefined;

    for (const utxo of addressUtxos) {
        amountFoundSompi += utxo.amountSompi;
        if (!txId) txId = utxo.transactionId; // Note: WalletQuery Utxo interface has transactionId, not outpoint.transactionId

        // blockDaaScore is an absolute monotonic DAA counter (~5,000,000+), not confirmation depth.
        // Providers that want to express confirmation depth must set an explicit `confirmations` field.
        const confs = typeof (utxo as any).confirmations === 'number' ? (utxo as any).confirmations : 0;
        if (confs < minConfirmations) {
            minConfirmations = confs;
        }
    }

    if (addressUtxos.length === 0) {
        minConfirmations = 0;
    }

    let status: PaymentStatus = "not_found";

    if (amountFoundSompi === 0n) {
        status = "not_found";
    } else if (amountFoundSompi < request.expectedAmountSompi) {
        status = "partially_paid";
    } else {
        if (minConfirmations >= request.requiredConfirmations) {
            status = "confirmed";
        } else {
            status = "mempool";
        }
    }

    return {
        status,
        amountFoundSompi,
        confirmations: minConfirmations === Number.MAX_SAFE_INTEGER ? 0 : minConfirmations,
        model: "stateless-utxo-check-v1",
        ...(txId ? { txId } : {})
    };
}
