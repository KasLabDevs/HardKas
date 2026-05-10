import { UI } from "../ui.js";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export async function runExampleRun(id: string) {
  try {
    let currentDir = process.cwd();
    let registryPath = path.join(currentDir, "examples", "registry.json");
    
    for (let i = 0; i < 3; i++) {
      try {
        await fs.access(registryPath);
        break;
      } catch {
        currentDir = path.dirname(currentDir);
        registryPath = path.join(currentDir, "examples", "registry.json");
      }
    }

    const data = await fs.readFile(registryPath, "utf-8");
    const examples = JSON.parse(data);

    const example = examples.find((ex: any) => ex.id === id);

    if (!example) {
      throw new Error(`Example '${id}' not found. Run 'hardkas example list' to see available IDs.`);
    }

    UI.info(`Running example: \x1b[1m${example.name}\x1b[0m...`);
    console.log(`\x1b[90mCommand: ${example.script}\x1b[0m\n`);

    // Split script into command and args
    const parts = example.script.split(" ");
    const command = parts[0];
    const args = parts.slice(1);

    const child = spawn(command, args, {
      cwd: currentDir,
      stdio: "inherit",
      shell: true // Required for pnpm/npx on Windows
    });

    return new Promise<void>((resolve, reject) => {
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Example execution failed with exit code ${code}`));
        }
      });

      child.on("error", (err) => {
        reject(err);
      });
    });
  } catch (error) {
    throw error;
  }
}
