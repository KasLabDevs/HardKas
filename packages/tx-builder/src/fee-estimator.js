import { estimateTransactionMass } from "./mass.js";
function parseFeeRate(rate) {
    let value;
    try {
        value = BigInt(rate);
    }
    catch (err) {
        throw new Error("FEE_ESTIMATOR_INVALID_RATE: Unparseable fee rate.");
    }
    if (value < 0n) {
        throw new Error("FEE_ESTIMATOR_INVALID_RATE: Negative fee rates are not allowed.");
    }
    return value;
}
export function estimateFee(request) {
    const feeRate = parseFeeRate(request.feeRateSompiPerMass);
    const policy = request.policy ?? "minimal";
    const warnings = [];
    const inputCount = typeof request.inputs === 'number' ? request.inputs : request.inputs.length;
    let formattedOutputs = [];
    if (typeof request.outputs === 'number') {
        for (let i = 0; i < request.outputs; i++) {
            formattedOutputs.push({ address: "kaspatest:qdummy" }); // valid default dummy
        }
    }
    else {
        formattedOutputs = [...request.outputs];
    }
    // Handle optional properties carefully for exactOptionalPropertyTypes
    const massArgs = {
        inputCount: inputCount,
        outputs: formattedOutputs,
        payloadBytes: request.payloadBytes ?? 0
    };
    if (request.hasChange !== undefined) {
        massArgs.hasChange = request.hasChange;
    }
    const massResult = estimateTransactionMass(massArgs);
    const baseFee = massResult.mass * feeRate;
    let estimatedFeeSompi = baseFee;
    if (policy === "conservative") {
        // Apply 10% buffer strictly with integer arithmetic
        // conservativeFee = (minimalFee * 110n + 99n) / 100n
        estimatedFeeSompi = (baseFee * 110n + 99n) / 100n;
    }
    if (massResult.warnings && massResult.warnings.length > 0) {
        warnings.push(...massResult.warnings);
    }
    return {
        estimatedMass: massResult.mass,
        feeRateSompiPerMass: feeRate,
        estimatedFeeSompi,
        model: "mass-estimated-v1",
        policy,
        estimated: true,
        claims: {
            exactNetworkFee: false
        },
        warnings
    };
}
