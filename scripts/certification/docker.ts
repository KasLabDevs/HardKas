import { exec } from "node:child_process";
import util from "node:util";

const execAsync = util.promisify(exec);

export async function runCommand(command: string, cwd?: string): Promise<{ stdout: string, stderr: string }> {
    return await execAsync(command, { cwd });
}
