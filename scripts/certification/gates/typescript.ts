import { CertificationContext, CertificationGate, GateResult } from "../types.js";
import { runCommand } from "../docker.js";

export class TypescriptGate implements CertificationGate {
    name = "typescript";

    async execute(ctx: CertificationContext): Promise<GateResult> {
        console.log("==> Running Gate: TypeScript Tests");
        try {
            console.log("    Running global test suite...");
            // Exclude the builder-labs which will be run isolated in their own gate
            await runCommand("pnpm test", ctx.projectRoot);
            
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message || String(error) };
        }
    }
}
