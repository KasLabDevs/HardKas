import { spawn } from "node:child_process";

export function runCommand(command: string, cwd?: string): Promise<{ stdout: string, stderr: string }> {
    return new Promise((resolve, reject) => {
        // Use shell: true to support complex commands like 'git add . ; git commit ...' or 'npx vitest'
        const child = spawn(command, { cwd, shell: true, stdio: "inherit" });
        child.on("close", (code) => {
            if (code === 0) {
                resolve({ stdout: "", stderr: "" });
            } else {
                reject(new Error(`Command failed: ${command}\nExit code: ${code}`));
            }
        });
        child.on("error", (err) => {
            reject(err);
        });
    });
}
