import { describe, it, expect } from 'vitest';
import { 
    createTxPlanArtifact,
    createSimulatedSignedTxArtifact,
    createPaymentReceipt,
    EvidenceBatchExporter,
    ArtifactIndexStoreJson,
    validateArtifact,
    diffArtifacts
} from '@hardkas/artifacts';
import { NetworkId, ExecutionMode, RuntimeContext } from '@hardkas/core';
import { TxPlan as TxPlanType } from '@hardkas/tx-builder';

describe('Artifacts Coverage Expansion', () => {
    const dummyCtx: RuntimeContext = {
        clock: { now: () => Date.now() },
        env: { HOME: '/tmp' },
        fs: { write: async () => {}, read: async () => Buffer.from(''), exists: async () => true, mkdir: async () => {} },
        cwd: () => '/tmp',
        telemetry: { record: () => {} } as any,
        logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as any
    };

    let txPlanArtifact: any;

    it('should create a TxPlan Artifact', async () => {
        const dummyPlan: TxPlanType = {
            inputs: [{
                outpoint: { transactionId: 'hash', index: 0 },
                amountSompi: 100n,
                address: 'addr1',
                scriptPublicKey: '00'
            }],
            outputs: [{ address: 'addr2', amountSompi: 50n }],
            change: { address: 'addr1', amountSompi: 40n },
            estimatedFeeSompi: 10n,
            estimatedMass: 100n
        };

        txPlanArtifact = createTxPlanArtifact({
            networkId: 'simnet',
            mode: 'simulated',
            from: { address: 'addr1', input: 'addr1' },
            to: { address: 'addr2', input: 'addr2' },
            amountSompi: 50n,
            plan: dummyPlan,
            ctx: dummyCtx
        });

        expect(txPlanArtifact).toBeDefined();
        expect(txPlanArtifact.planId).toBeDefined();
    });

    it('should create a SignedTx Artifact', async () => {
        const signed = createSimulatedSignedTxArtifact(
            txPlanArtifact,
            'dummy-payload',
            dummyCtx
        );

        expect(signed).toBeDefined();
        expect(signed.txId).toBeDefined();
    });

    it('should create Payment Receipt Artifact', async () => {
        const receipt = createPaymentReceipt({
            planId: txPlanArtifact.planId,
            merchantId: 'test',
            invoice: { amountSompi: 100n } as any,
            amountSompi: 100n,
            networkId: 'simnet',
            paymentCheckResult: {
                status: 'confirmed',
                amountFoundSompi: 100n,
                confirmations: 1,
                txId: 'dummy-tx',
                details: {} as any
            },
            policyResult: {
                requiredConfirmations: 0,
                policyId: 'dummy'
            } as any
        });
        expect(receipt).toBeDefined();
    });

    it('should exercise Evidence Batch', async () => {
        const indexStore = new ArtifactIndexStoreJson({ filePath: '.hardkas/test-index.json' });
        const batcher = new EvidenceBatchExporter(indexStore);
        const batchPath = batcher.export({
            artifacts: [],
            name: 'test-batch',
            exportDir: '.hardkas/test-exports'
        });
        expect(batchPath).toBeDefined();
    });

    it('should run validateArtifact', async () => {
        const validation = validateArtifact(txPlanArtifact);
        expect(validation.ok).toBe(true);
    });

    it('should diff artifacts', async () => {
        const diff = diffArtifacts(txPlanArtifact, txPlanArtifact);
        expect(diff.identical).toBe(true);
    });
});
