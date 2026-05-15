import { Command } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import pc from "picocolors";
import { execa } from "execa";
import { handleError, UI } from "../ui.js";
import { generateBasicTemplate } from "../templates/basic.js";

export function registerNewCommand(program: Command) {
  program
    .command("new <name>")
    .description(`Create a new HardKAS project ${UI.maturity("stable")}`)
    .option("--template <type>", "Project template", "basic")
    .option("--network <name>", "Default network", "simnet")
    .option("--accounts <n>", "Number of simulated accounts", "3")
    .option("--skip-install", "Skip pnpm install", false)
    .action(async (name: string, opts: any) => {
      try {
        await createProject(name, opts);
      } catch (err) {
        handleError(err);
      }
    });
}

async function createProject(name: string, opts: any) {
  const projectDir = path.resolve(process.cwd(), name);

  // 1. Check directory
  try {
    const stats = await fs.stat(projectDir);
    if (stats) {
       console.error(pc.red(`Error: Directory '${name}' already exists.`));
       process.exit(1);
    }
  } catch {
    // Ok, doesn't exist
  }

  UI.box("HardKAS Project Scaffolding", `Creating '${name}'...`);

  // 2. Generate files
  const files = generateBasicTemplate({
    name,
    network: opts.network,
    accounts: parseInt(opts.accounts)
  });

  await fs.mkdir(projectDir, { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(projectDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    console.log(`  ${pc.green("create")} ${relativePath}`);
  }

  // 3. Install dependencies
  if (!opts.skipInstall) {
    console.log(pc.cyan("\nInstalling dependencies with pnpm..."));
    try {
      await execa("pnpm", ["install"], { cwd: projectDir, stdio: "inherit" });
    } catch (err) {
      console.warn(pc.yellow("\nWarning: 'pnpm install' failed. You may need to run it manually."));
    }
  }

  // 4. Success message
  console.log(pc.green(`\n✅ Created project: ${name}`));
  console.log(`\nNext steps:`);
  console.log(pc.cyan(`  cd ${name}`));
  if (opts.skipInstall) {
    console.log(pc.cyan(`  pnpm install`));
  }
  console.log(pc.cyan(`  pnpm transfer          # Run your first transfer`));
  console.log(pc.cyan(`  pnpm test              # Run tests`));
  console.log(pc.cyan(`  hardkas capabilities   # See what's available`));
  console.log(`\nHappy building! 🚀\n`);
}
