import { loadHardkasConfig } from "@hardkas/config";
import path from "node:path";
import fs from "node:fs/promises";

async function main() {
  const { cwd } = await loadHardkasConfig();
  console.log("HARDKAS CONFIG CWD IS:", cwd);
  const statePath = path.join(cwd, ".hardkas", "localnet.json");
  console.log("STATE PATH IS:", statePath);
  try {
    const content = await fs.readFile(statePath, "utf-8");
    console.log("FILE EXISTS AND IS READABLE! SIZE:", content.length);
  } catch (e: any) {
    console.error("ERROR READING FILE:", e.message);
  }
}
main();
