import { describe, expect, it } from 'vitest';
import { SilverToolkit } from '../src/index.js';

describe('SilverToolkit', () => {
    it('should list all templates', () => {
        const silver = SilverToolkit.open();
        const templates = silver.templates();
        expect(templates).toContain('htlc');
        expect(templates).toContain('op-true');
        expect(templates).toContain('multisig');
    });

    it('should extract template parameters', () => {
        const silver = SilverToolkit.open();
        const tpl = silver.template('htlc');
        const params = tpl.parameters();
        expect(params).toEqual(expect.arrayContaining(['secret_hash', 'receiver_pubkey', 'locktime', 'sender_pubkey']));
    });

    it('should fill template with parameters', () => {
        const silver = SilverToolkit.open();
        const tpl = silver.template('timelock');
        const source = tpl.fill({ locktime: 500000, pubkey: 'abcd123' });
        expect(source).toContain('500000 OP_CHECKLOCKTIMEVERIFY OP_DROP');
        expect(source).toContain('abcd123 OP_CHECKSIG');
    });

    it('should throw if missing parameters during fill', () => {
        const silver = SilverToolkit.open();
        const tpl = silver.template('timelock');
        expect(() => tpl.fill({ locktime: 500000 })).toThrow(/Missing parameter/);
    });

    it('should enforce restrictive claims on build', async () => {
        const silver = SilverToolkit.open();
        const build = await silver.build('OP_TRUE');
        expect(build.bytecode).toBeDefined();
        expect(build.claims.realSilverCompiler).toBe(false);
        expect(build.claims.simulatedOnly).toBe(true);
    });

    it('should enforce restrictive claims on simulate, artifact, and evidence', async () => {
        const silver = SilverToolkit.open();
        const build = await silver.build('OP_TRUE');
        
        const simulation = await silver.simulate(build);
        expect(simulation.claims.vmConsensusEquivalence).toBe(false);

        const artifact = await silver.artifact(build, "test-script");
        expect(artifact.claims.productionSafe).toBe(false);
        expect(artifact.name).toBe("test-script");

        const evidence = await silver.evidence(build, simulation);
        expect(evidence.claims.mainnetReady).toBe(false);
        expect(evidence.schema).toBe("hardkas.script-evidence.v1");
        expect(evidence.simulationResult).not.toHaveProperty('claims'); // internal property
        expect(evidence.simulationResult.success).toBe(true);
    });
});
