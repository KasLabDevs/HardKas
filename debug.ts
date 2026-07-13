
import { buildPaymentPlan } from './packages/tx-builder/src/index.ts';
const mockUtxos = [{
    outpoint: { transactionId: '0'.repeat(64), index: 0 },
    address: 'kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhg0eec5',
    amountSompi: 100000000n,
    scriptPublicKey: '200000000000000000000000000000000000000000000000000000000000000000ac'
}];
const plan = buildPaymentPlan({
    fromAddress: 'kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhg0eec5',
    availableUtxos: mockUtxos as any,
    outputs: [{
        address: 'kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhg0eec5',
        amountSompi: 50000000n
    }],
    feeRateSompiPerMass: 1n,
    version: 1,
    computeGrams: 2000n,
    lane: 'LANE1'
});
console.log('FEE:', plan.estimatedFeeSompi);

