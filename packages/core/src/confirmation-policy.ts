/**
 * ConfirmationPolicy — Builder Lab 02, Friction #03
 * 
 * Provides a deterministic policy for required transaction confirmations
 * based on the payment amount and the merchant's risk profile.
 * 
 * NOTE: Kaspa is a fast block DAG (~1 block/sec). Confirmations scale differently
 * than traditional chains (e.g., Bitcoin).
 */

const SOMPI_PER_KAS = 100_000_000n;

export type RiskProfile = "lenient" | "standard" | "strict";

export interface ConfirmationPolicyRequest {
    readonly amountSompi: bigint;
    readonly riskProfile?: RiskProfile;
}

export interface ConfirmationPolicyResult {
    readonly requiredConfirmations: number;
    readonly amountSompi: bigint;
    readonly riskProfile: RiskProfile;
    readonly model: "merchant-static-v1";
    readonly claims: {
        readonly absoluteFinality: false;
        readonly economicSafetyGuarantee: false;
        readonly merchantPolicyOnly: true;
    };
}

export function getRequiredConfirmations(request: ConfirmationPolicyRequest): ConfirmationPolicyResult {
    if (typeof request.amountSompi !== 'bigint') {
        throw new Error("CONFIRMATION_POLICY_INVALID_AMOUNT: amountSompi must be a bigint.");
    }
    
    if (request.amountSompi < 0n) {
        throw new Error("CONFIRMATION_POLICY_INVALID_AMOUNT: Negative amounts are not allowed.");
    }

    const riskProfile = request.riskProfile ?? "standard";
    const amountKas = request.amountSompi / SOMPI_PER_KAS;

    let requiredConfirmations: number;

    if (amountKas < 1_000n) {
        // Low value (< 1,000 KAS)
        switch (riskProfile) {
            case "lenient": requiredConfirmations = 1; break;
            case "standard": requiredConfirmations = 2; break;
            case "strict": requiredConfirmations = 10; break;
        }
    } else if (amountKas <= 10_000n) {
        // Medium value (1,000 - 10,000 KAS)
        switch (riskProfile) {
            case "lenient": requiredConfirmations = 5; break;
            case "standard": requiredConfirmations = 10; break;
            case "strict": requiredConfirmations = 30; break;
        }
    } else {
        // High value (> 10,000 KAS)
        switch (riskProfile) {
            case "lenient": requiredConfirmations = 10; break;
            case "standard": requiredConfirmations = 30; break;
            case "strict": requiredConfirmations = 60; break;
        }
    }

    return {
        requiredConfirmations,
        amountSompi: request.amountSompi,
        riskProfile,
        model: "merchant-static-v1",
        claims: {
            absoluteFinality: false,
            economicSafetyGuarantee: false,
            merchantPolicyOnly: true
        }
    };
}
