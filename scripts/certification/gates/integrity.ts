import { CertificationContext, CertificationGate, GateResult } from "../types.js";
import { runCommand } from "../docker.js";

export class IntegrityGate implements CertificationGate {
    name = "integrity";

    async execute(ctx: CertificationContext): Promise<GateResult> {
        console.log("==> Running Gate: Integrity");
        try {
            // Check if git working tree is dirty
            const gitStatus = await runCommand("git status --porcelain", ctx.projectRoot);
            if (gitStatus.stdout.trim() !== "") {
                return { success: false, error: "Working tree is dirty. Please commit or stash changes before certification." };
            }

            console.log("    Installing dependencies...");
            await runCommand("pnpm install --frozen-lockfile", ctx.projectRoot);

            console.log("    Building project...");
            await runCommand("pnpm build", ctx.projectRoot);

            console.log("    Running typecheck...");
            await runCommand("pnpm typecheck", ctx.projectRoot);

            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message || String(error) };
        }
    }
}
