import { exec } from "child_process";
import { promisify } from "util";
import path from "node:path";

const execAsync = promisify(exec);

export async function runCommand(
  command: string, 
  cwd: string,
  env?: Record<string, string>
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const mergedEnv = env ? { ...process.env, ...env } : process.env;
    const { stdout, stderr } = await execAsync(command, { cwd, env: mergedEnv as NodeJS.ProcessEnv });
    return { stdout, stderr, code: 0 };
  } catch (error: any) {
    return { stdout: error.stdout || "", stderr: error.stderr || error.message, code: error.code || 1 };
  }
}

export function getHardkasCliPath(consumerDir: string): string {
  return process.platform === "win32"
    ? path.join(consumerDir, "node_modules", ".bin", "hardkas.cmd")
    : path.join(consumerDir, "node_modules", ".bin", "hardkas");
}