import { estimateFee } from "./fee-estimator.js";
function parseTargetSompi(target) {
    let value;
    try {
        value = BigInt(target);
    }
    catch (err) {
        throw new Error("COIN_SELECTION_INVALID_AMOUNT: Unparseable amount.");
    }
    if (value < 0n) {
        throw new Error("COIN_SELECTION_INVALID_AMOUNT: Negative amounts are not allowed.");
    }
    return value;
}
export function selectCoins(request) {
    const target = parseTargetSompi(request.targetSompi);
    const dustThreshold = request.dustThresholdSompi ?? 600n; // Kaspa canonical dust threshold (DUST_THRESHOLD_SOMPI)
    const warnings = [];
    const validUtxos = [];
    const dustRejected = [];
    for (const utxo of request.utxos) {
        if (utxo.amountSompi < dustThreshold) {
            dustRejected.push(utxo);
        }
        else {
            validUtxos.push(utxo);
        }
    }
    if (dustRejected.length > 0) {
        warnings.push(`Ignored ${dustRejected.length} dust UTXO(s) below ${dustThreshold} Sompi.`);
    }
    const sortedUtxos = [...validUtxos].sort((a, b) => {
        let diff = 0n;
        if (request.strategy === "largest-first") {
            diff = b.amountSompi - a.amountSompi;
        }
        else {
            diff = a.amountSompi - b.amountSompi;
        }
        if (diff !== 0n)
            return diff > 0n ? 1 : -1;
        // Deterministic tie-breaker
        if (a.outpoint.transactionId < b.outpoint.transactionId)
            return -1;
        if (a.outpoint.transactionId > b.outpoint.transactionId)
            return 1;
        if (a.outpoint.index < b.outpoint.index)
            return -1;
        if (a.outpoint.index > b.outpoint.index)
            return 1;
        return 0;
    });
    const selectedUtxos = [];
    let totalInputSompi = 0n;
    let estimatedFeeSompi = 0n;
    let changeSompi = 0n;
    // We assume one main output. We use a valid P2PK dummy address.
    const outputs = [
        { address: "kaspatest:qdummy", amountSompi: target }
    ];
    let satisfied = false;
    for (const utxo of sortedUtxos) {
        selectedUtxos.push(utxo);
        totalInputSompi += utxo.amountSompi;
        const feeWithChangeObj = estimateFee({
            inputs: selectedUtxos,
            outputs: outputs,
            feeRateSompiPerMass: request.feeRateSompiPerMass,
            hasChange: true,
            policy: "conservative" // Coin selector uses conservative fees for safety
        });
        const feeWithChange = feeWithChangeObj.estimatedFeeSompi;
        const feeNoChangeObj = estimateFee({
            inputs: selectedUtxos,
            outputs: outputs,
            feeRateSompiPerMass: request.feeRateSompiPerMass,
            hasChange: false,
            policy: "conservative"
        });
        const feeNoChange = feeNoChangeObj.estimatedFeeSompi;
        if (totalInputSompi >= target + feeWithChange) {
            changeSompi = totalInputSompi - target - feeWithChange;
            estimatedFeeSompi = feeWithChange;
            if (changeSompi < dustThreshold) {
                // Change is dust, fold it into fees
                estimatedFeeSompi += changeSompi;
                changeSompi = 0n;
            }
            satisfied = true;
            break;
        }
        else if (totalInputSompi >= target + feeNoChange) {
            const remainder = totalInputSompi - target - feeNoChange;
            if (remainder < dustThreshold) {
                estimatedFeeSompi = feeNoChange + remainder;
                changeSompi = 0n;
                satisfied = true;
                break;
            }
        }
    }
    if (!satisfied) {
        throw new Error(`Insufficient funds: target ${target} + fee ${estimatedFeeSompi} \u003e total inputs ${totalInputSompi}`);
    }
    // Determine final outputs list (including change if applicable)
    const finalOutputs = [...outputs];
    if (changeSompi > 0n && request.changeAddress) {
        finalOutputs.push({
            address: request.changeAddress,
            amountSompi: changeSompi
        });
    }
    else if (changeSompi > 0n && !request.changeAddress) {
        warnings.push("Change amount exists but no changeAddress provided. Change will be lost to fees.");
        estimatedFeeSompi += changeSompi;
        changeSompi = 0n;
    }
    // Deterministic final sorting of selected UTXOs
    selectedUtxos.sort((a, b) => {
        if (a.outpoint.transactionId < b.outpoint.transactionId)
            return -1;
        if (a.outpoint.transactionId > b.outpoint.transactionId)
            return 1;
        if (a.outpoint.index < b.outpoint.index)
            return -1;
        if (a.outpoint.index > b.outpoint.index)
            return 1;
        return 0;
    });
    return {
        selectedUtxos,
        totalInputSompi,
        targetSompi: target,
        estimatedFeeSompi,
        changeSompi,
        outputs: finalOutputs,
        dustRejected,
        warnings,
        feeModel: "estimated-v1"
    };
}
