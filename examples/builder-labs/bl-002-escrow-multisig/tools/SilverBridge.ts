import { exec } from "node:child_process";
import util from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execAsync = util.promisify(exec);

export interface BuildUnlockParams {
    artifactPath: string;
    entrypoint: string;
    arguments: string[]; // hex-encoded signatures
}

export interface BuildUnlockResult {
    unlockingScriptHex: string;
    compilerVersion: string;
}

export const hardkas = {
    experimental: {
        silver: {
            /**
             * Builds a SilverScript unlocking script dynamically using the Rust compiler internals.
             */
            buildUnlock: async (params: BuildUnlockParams): Promise<BuildUnlockResult> => {
                const rustBinPath = path.resolve(__dirname, "silver-bridge");
                
                // Ensure silver-bridge is compiled
                // The `cargo run` wrapper is used for development/labs. In a real package, we'd use NAPI.
                
                const args = [
                    params.artifactPath,
                    params.entrypoint,
                    ...params.arguments
                ];
                
                const cmd = `cargo run --release --manifest-path ${path.join(__dirname, "silver-bridge/Cargo.toml")} -- ${args.join(" ")}`;
                
                try {
                    const { stdout } = await execAsync(cmd, { env: { ...process.env, RUSTFLAGS: "-C link-arg=/FORCE:MULTIPLE" } });
                    // The output could contain cargo logs, so we parse the last line or find the JSON block.
                    const jsonLine = stdout.split('\n').filter(l => l.trim().startsWith('{')).pop();
                    if (!jsonLine) {
                        throw new Error(`Failed to parse silver-bridge output: ${stdout}`);
                    }
                    const parsed = JSON.parse(jsonLine);
                    if (parsed.error) {
                        throw new Error(`SilverBridge Error: ${parsed.error}`);
                    }
                    
                    return {
                        unlockingScriptHex: parsed.unlocking_script_hex,
                        compilerVersion: parsed.compiler_version,
                    };
                } catch (e: any) {
                    if (e.stdout) {
                         const jsonLine = e.stdout.split('\n').filter((l: string) => l.trim().startsWith('{')).pop();
                         if (jsonLine) {
                             const parsed = JSON.parse(jsonLine);
                             if (parsed.error) throw new Error(`SilverBridge Error: ${parsed.error}`);
                         }
                    }
                    throw new Error(`Failed to execute silver-bridge: ${e.message}`);
                }
            }
        }
    }
};
