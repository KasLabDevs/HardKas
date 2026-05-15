import { buildHardkasProgram } from "../program.js";
import { extractCliReference, generateCliMarkdown } from "../docs/generator.js";
import fs from "node:fs/promises";
import path from "node:path";
import { writeFileAtomic } from "@hardkas/core";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../../../"); // Repo root

async function main() {
  const isCheck = process.argv.includes("--check");
  const program = buildHardkasProgram({ forDocs: true });
  
  const ref = extractCliReference(program, { deterministic: true });
  const markdown = generateCliMarkdown(ref);
  const json = JSON.stringify(ref, null, 2);

  const mdPath = path.join(ROOT_DIR, "docs/reference/cli.md");
  const jsonPath = path.join(ROOT_DIR, "docs/reference/cli.generated.json");

  if (isCheck) {
    console.log("Checking CLI documentation integrity...");
    try {
      const existingMd = await fs.readFile(mdPath, "utf-8");
      const existingJson = await fs.readFile(jsonPath, "utf-8");

      if (existingMd !== markdown || existingJson !== json) {
        console.error("\n[!] CLI documentation is OUT OF DATE.");
        console.error("    Run 'pnpm docs:generate-cli' to update them.");
        process.exit(1);
      }
      console.log("✓ CLI documentation is up to date.");
    } catch (e: any) {
      console.error(`\n[!] Error reading existing documentation: ${e.message}`);
      console.error("    Run 'pnpm docs:generate-cli' to generate them for the first time.");
      process.exit(1);
    }
  } else {
    console.log("Generating CLI documentation...");
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(mdPath), { recursive: true });
    
    await writeFileAtomic(mdPath, markdown, { encoding: "utf-8" });
    await writeFileAtomic(jsonPath, json, { encoding: "utf-8" });

    console.log(`\n✓ Generated: ${path.relative(ROOT_DIR, mdPath)}`);
    console.log(`✓ Generated: ${path.relative(ROOT_DIR, jsonPath)}`);
    console.log(`\nTotal commands: ${ref.commands.length + ref.commands.reduce((acc, c) => acc + countSubcommands(c), 0)}`);
  }
}

function countSubcommands(cmd: any): number {
  return cmd.subcommands.length + cmd.subcommands.reduce((acc: number, c: any) => acc + countSubcommands(c), 0);
}

main().catch(err => {
  console.error("Fatal error during docs generation:", err);
  process.exit(1);
});
