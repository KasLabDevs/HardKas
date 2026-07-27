import { CertificationContext, CertificationGate, GateResult } from "../types.js";
import { runCommand } from "../docker.js";

export class RuntimeGate implements CertificationGate {
    name = "runtime";

    async execute(ctx: CertificationContext): Promise<GateResult> {
        console.log(`==> Running Gate: Runtime Tests for ${ctx.lab}`);
        try {
            console.log(`    Running isolated lab tests...`);
            await runCommand(`pnpm exec vitest run --no-coverage --no-file-parallelism --testTimeout 120000 examples/builder-labs/${ctx.lab}/`, ctx.projectRoot);
            
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message || String(error) };
        }
    }
}
