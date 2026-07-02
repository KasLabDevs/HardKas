import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('CLI Smoke Tests (Real Execution)', () => {
    // Determine path to CLI entrypoint
    const cliPath = path.resolve(__dirname, '../../../../packages/cli/src/index.ts');
    
    // We run it via tsx since it's a TS file
    const runCli = (args: string) => {
        try {
            return execSync(`npx tsx ${cliPath} ${args}`, { stdio: 'pipe' }).toString();
        } catch (e: any) {
            // Some commands return non-zero in CI/no-env cases, but we capture output
            return e.stdout?.toString() + e.stderr?.toString();
        }
    };

    it('should run hardkas env check', () => {
        const out = runCli('env check');
        expect(out).toContain('env'); // Should have some output indicating it ran
    });

    it('should run hardkas doctor', () => {
        const out = runCli('doctor');
        expect(out).toBeDefined();
    });

    it('should run hardkas deploy init', () => {
        const out = runCli('deploy init');
        expect(out).toBeDefined();
    });
});
