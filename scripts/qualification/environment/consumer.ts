import fs from "fs/promises";
import path from "path";
import os from "os";
import { runCommand } from "./commands.js";
import { ExecutionContext } from "../types.js";

export async function createConsumerDir(repoRoot: string, baseDir?: string): Promise<string> {
  const root = baseDir || os.tmpdir();
  const dirName = `hardkas-qualification-${Date.now()}`;
  const consumerPath = path.resolve(root, dirName);
  
  // Sanity check: must not be inside repo root
  const relative = path.relative(repoRoot, consumerPath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error(`Consumer path ${consumerPath} is a descendant of repo root ${repoRoot}. This is not allowed for qualification.`);
  }

  await fs.mkdir(consumerPath, { recursive: true });
  await runCommand("npm init -y", consumerPath);
  return consumerPath;
}

export async function writeConsumerScript(ctx: ExecutionContext, name: string, code: string): Promise<string> {
  const scriptPath = path.join(ctx.consumerDir, name);
  await fs.writeFile(scriptPath, code, "utf-8");
  return scriptPath;
}
