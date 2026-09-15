import { CertificationContext, CertificationGate, GateResult } from "../types.js";
import { runCommand } from "../docker.js";
import path from "node:path";

export class RustGate implements CertificationGate {
    name = "rust";

    async execute(ctx: CertificationContext): Promise<GateResult> {
        console.log("==> Running Gate: Rust Checks & Tests");
        
        // SilverScript is never built from source here: the only certified compiler
        // is the managed silverc release (`hardkas toolchain install silverc`).
        const workspaces = [
            "packages/pskt-native"
        ];

        try {
            for (const ws of workspaces) {
                const wsPath = path.join(ctx.projectRoot, ws);
                console.log(`    Checking Rust workspace: ${ws}`);
                
                console.log(`      Running cargo fmt...`);
                await runCommand("cargo fmt --check", wsPath);
                
                console.log(`      Running cargo clippy...`);
                await runCommand("cargo clippy --all-targets --all-features -- -D warnings", wsPath);
                
                console.log(`      Running cargo test...`);
                await runCommand("cargo test --release", wsPath);
            }
            
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message || String(error) };
        }
    }
}
