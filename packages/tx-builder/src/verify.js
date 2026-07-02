import { estimateTransactionMass } from "./mass.js";
/**
 * Kaspa dust threshold in sompi.
 * Based on the rusty-kaspa wallet heuristic for standard P2PK outputs:
 *   value * 1000 / (STANDARD_OUTPUT_SIZE_PLUS_INPUT_SIZE * 3) < MINIMUM_RELAY_TRANSACTION_FEE
 * For standard outputs this equates to ~546 sompi.
 * We use 600 as a conservative margin, consistent with the localnet.
 */
export const DUST_THRESHOLD_SOMPI = 600n;
/**
 * Performs deep semantic verification of a transaction plan.
 * Validates economic invariants, mass computation, and operational consistency.
 */
export function verifyTxPlanSemantics(plan, context = {}) {
    const issues = [];
    const addIssue = (code, severity, message, path) => {
        issues.push({ code, severity, message, ...(path ? { path } : {}) });
    };
    // A. Simulation vs Real separation
    const ePlan = plan;
    if (ePlan.mode === "simulated" && ePlan.networkId !== "simnet") {
        addIssue("ENV_CONSISTENCY_FAILURE", "error", `Environment mismatch: simulated plan must target 'simnet', but targets '${ePlan.networkId}'`);
    }
    // B. Address Integrity
    if (!plan.inputs.every((i) => i.address.includes(":"))) {
        addIssue("INVALID_ADDRESS_FORMAT", "error", "One or more input addresses are missing prefix (e.g. kaspa:)");
    }
    if (!plan.outputs.every((o) => o.address.includes(":"))) {
        addIssue("INVALID_ADDRESS_FORMAT", "error", "One or more output addresses are missing prefix (e.g. kaspa:)");
    }
    // 1. Economic Totals
    const inputTotalSompi = plan.inputs.reduce((sum, i) => sum + BigInt(i.amountSompi), 0n);
    const outputTotalSompi = plan.outputs.reduce((sum, o) => sum + BigInt(o.amountSompi), 0n);
    const changeAmountSompi = plan.change ? BigInt(plan.change.amountSompi) : 0n;
    const planFeeSompi = BigInt(plan.estimatedFeeSompi);
    const recomputedFeeSompi = inputTotalSompi - outputTotalSompi - changeAmountSompi;
    // 2. Invariant Checks
    if (inputTotalSompi <= 0n) {
        addIssue("ZERO_INPUTS", "critical", "Transaction has zero or negative total inputs.");
    }
    if (outputTotalSompi <= 0n) {
        addIssue("ZERO_OUTPUTS", "error", "Transaction has zero or negative total outputs (excluding change).");
    }
    if (recomputedFeeSompi < 0n) {
        addIssue("NEGATIVE_FEE", "critical", `Negative fee detected: inputs (${inputTotalSompi}) < outputs + change (${outputTotalSompi + changeAmountSompi})`);
    }
    // 3. Mass & Fee Consistency
    const massResult = estimateTransactionMass({
        inputCount: plan.inputs.length,
        outputs: plan.outputs,
        hasChange: !!plan.change
    });
    const recomputedMass = massResult.mass;
    if (recomputedMass !== BigInt(plan.estimatedMass)) {
        addIssue("MASS_MISMATCH", "critical", `Mass mismatch: plan says ${plan.estimatedMass}, recomputed ${recomputedMass}`);
    }
    if (planFeeSompi !== recomputedFeeSompi) {
        addIssue("FEE_MISMATCH", "critical", `Fee mismatch: estimatedFeeSompi (${planFeeSompi}) does not match input-output delta (${recomputedFeeSompi})`);
    }
    // 4. Output Validation (Dust, Negative, Duplicate)
    plan.outputs.forEach((o, i) => {
        if (BigInt(o.amountSompi) <= 0n) {
            addIssue("INVALID_OUTPUT_AMOUNT", "error", `Output ${i} has non-positive amount: ${o.amountSompi}`, `outputs[${i}]`);
        }
        // Dust check: reject outputs below the Kaspa dust threshold (600 sompi)
        // This must be an error, not a warning, to match real node behavior.
        if (BigInt(o.amountSompi) < DUST_THRESHOLD_SOMPI) {
            addIssue("DUST_OUTPUT", "error", `Output ${i} is below dust threshold (${DUST_THRESHOLD_SOMPI} sompi): ${o.amountSompi} sompi`, `outputs[${i}]`);
        }
    });
    if (plan.change && BigInt(plan.change.amountSompi) < DUST_THRESHOLD_SOMPI) {
        addIssue("DUST_CHANGE", "error", `Change output is below dust threshold (${DUST_THRESHOLD_SOMPI} sompi): ${plan.change.amountSompi} sompi`, "change");
    }
    // 5. Input Validation (Duplicates)
    const seenInputs = new Set();
    plan.inputs.forEach((input, i) => {
        const id = `${input.outpoint.transactionId}:${input.outpoint.index}`;
        if (seenInputs.has(id)) {
            addIssue("DUPLICATE_INPUT", "critical", `Duplicate input detected: ${id}`, `inputs[${i}]`);
        }
        seenInputs.add(id);
    });
    // 6. Context-aware checks
    if (context.utxoContext) {
        plan.inputs.forEach((input, i) => {
            const match = context.utxoContext?.find((u) => u.outpoint.transactionId === input.outpoint.transactionId &&
                u.outpoint.index === input.outpoint.index);
            if (!match) {
                addIssue("UNKNOWN_INPUT", "error", `Input ${i} not found in provided UTXO context`, `inputs[${i}]`);
            }
            else if (BigInt(match.amountSompi) !== BigInt(input.amountSompi)) {
                addIssue("INPUT_AMOUNT_MISMATCH", "critical", `Input ${i} amount mismatch: plan says ${input.amountSompi}, context says ${match.amountSompi}`, `inputs[${i}]`);
            }
        });
    }
    if (context.expectedChangeAddress && plan.change) {
        if (plan.change.address !== context.expectedChangeAddress) {
            addIssue("CHANGE_ADDRESS_MISMATCH", "error", `Change address mismatch: expected ${context.expectedChangeAddress}, got ${plan.change.address}`, "change.address");
        }
    }
    return {
        ok: issues.every((i) => i.severity !== "error" && i.severity !== "critical"),
        issues,
        recomputedFeeSompi,
        recomputedMass,
        inputTotalSompi,
        outputTotalSompi,
        changeAmountSompi
    };
}
/**
 * Performs semantic verification of a signed transaction artifact.
 */
export function verifySignedTxSemantics(signed, // Using any for artifact structure compatibility without circular deps
plan) {
    const issues = [];
    const addIssue = (code, severity, message) => {
        issues.push({ code, severity, message });
    };
    if (plan) {
        const ePlan = plan;
        if (signed.sourcePlanId !== ePlan.planId &&
            signed.sourcePlanId !== ePlan.contentHash) {
            addIssue("PLAN_ID_MISMATCH", "critical", `Security violation: sourcePlanId mismatch. Signed sourcePlanId is ${signed.sourcePlanId}, but plan is ${ePlan.planId}`);
        }
        if (ePlan.amountSompi && BigInt(signed.amountSompi) !== BigInt(ePlan.amountSompi)) {
            addIssue("IMMUTABLE_FIELD_MUTATION", "critical", `Security violation: amountSompi changed from ${ePlan.amountSompi} to ${signed.amountSompi} after signing`);
        }
        if (signed.networkId !== ePlan.networkId) {
            addIssue("NETWORK_MISMATCH", "critical", `Security violation: networkId changed from ${ePlan.networkId} to ${signed.networkId} after signing`);
        }
    }
    else {
        addIssue("PLAN_UNAVAILABLE_FOR_LINEAGE_CHECK", "warning", "Source plan is not available in the workspace; skipping lineage check");
    }
    if (!signed.signedTransaction?.payload) {
        addIssue("MISSING_PAYLOAD", "error", "Signed transaction is missing its raw payload");
    }
    return {
        ok: issues.every((i) => i.severity !== "error" && i.severity !== "critical"),
        issues
    };
}
/**
 * Performs semantic verification of a transaction receipt artifact.
 */
export function verifyTxReceiptSemantics(receipt) {
    const issues = [];
    const addIssue = (code, severity, message) => {
        issues.push({ code, severity, message });
    };
    if (receipt.status === "accepted" && !receipt.txId) {
        addIssue("MISSING_TXID", "error", "Accepted receipt is missing transaction ID");
    }
    if (receipt.mode === "simulated" && !receipt.tracePath) {
        addIssue("MISSING_TRACE", "warning", "Simulated receipt is missing trace path");
    }
    return {
        ok: issues.every((i) => i.severity !== "error" && i.severity !== "critical"),
        issues
    };
}
