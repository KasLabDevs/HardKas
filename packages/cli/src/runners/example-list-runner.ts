import { UI } from "../ui.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function runExampleList() {
  UI.box("HardKAS", "Example Registry");
  
  try {
    // Find workspace root by looking for examples/registry.json starting from cwd
    let currentDir = process.cwd();
    let registryPath = path.join(currentDir, "examples", "registry.json");
    
    // Simple traversal up to 3 levels
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

    console.log(`\x1b[1mID\x1b[0m         \x1b[1mName\x1b[0m                \x1b[1mLevel\x1b[0m`);
    console.log(`----------  --------------------  ------------`);
    
    for (const ex of examples) {
      console.log(`${ex.id.padEnd(10)}  ${ex.name.padEnd(20)}  ${ex.level}`);
      console.log(`            \x1b[90m${ex.description}\x1b[0m`);
      console.log("");
    }

    UI.footer("Run an example with: hardkas example run <id>");
  } catch (error) {
    throw new Error(`Could not load example registry: ${error instanceof Error ? error.message : String(error)}`);
  }
}
