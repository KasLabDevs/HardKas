import type { Command } from "commander";
import { UI, handleError } from "../ui.js";
import path from "node:path";
import fs from "node:fs";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export function registerCreateCommand(program: Command) {
  program
    .command("create")
    .description(`Scaffold a new HardKAS project from a template ${UI.maturity("stable")}`)
    .argument("<template>", "Name of the template (e.g. payment-app, batch-payments)")
    .argument("<dest>", "Destination directory")
    .option("--install", "Run npm install automatically after scaffolding", false)
    .option("--json", "Output results as JSON", false)
    .action(async (template: string, dest: string, options: any) => {
      try {
        const destDir = path.resolve(process.cwd(), dest);
        
        // Find template directory
        // In dist, we are at packages/cli/dist/index.js (or similar)
        // The templates are copied to packages/cli/templates during build (or we run from source)
        const possiblePaths = [
          path.join(__dirname, "../templates", template), // from dist
          path.join(__dirname, "../../templates", template), // from src/commands
        ];

        let templateDir = "";
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            templateDir = p;
            break;
          }
        }

        if (!templateDir) {
          throw new Error(`Template '${template}' not found.`);
        }

        if (fs.existsSync(destDir)) {
          throw new Error(`Destination directory '${dest}' already exists.`);
        }

        // Copy recursively
        fs.cpSync(templateDir, destDir, { recursive: true });

        // Update package.json name
        const pkgFile = path.join(destDir, "package.json");
        if (fs.existsSync(pkgFile)) {
          const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf-8"));
          pkg.name = path.basename(destDir);
          fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2), "utf-8");
        }

        // Handle .npmignore -> .gitignore
        const npmIgnore = path.join(destDir, ".npmignore");
        const gitIgnore = path.join(destDir, ".gitignore");
        if (fs.existsSync(npmIgnore)) {
          fs.renameSync(npmIgnore, gitIgnore);
        }

        if (options.install) {
          if (!options.json) UI.info("Running npm install...");
          const { execSync } = await import("node:child_process");
          execSync("npm install", { stdio: options.json ? "ignore" : "inherit", cwd: destDir });
        }

        const nextSteps = [
          `cd ${dest}`,
          ...(options.install ? [] : ["npm install"]),
          "npx hardkas test"
        ];

        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({
            ok: true,
            command: "create",
            mode: "cli",
            result: {
              nextSteps
            }
          });
        } else {
          UI.success(`Scaffolded '${template}' template into '${dest}'.`);
          UI.footer(`Next steps:\n  ` + nextSteps.join("\n  "));
        }
      } catch (e: any) {
        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({
            ok: false,
            error: {
              code: "TEMPLATE_CREATE_FAILED",
              message: e.message
            }
          });
        } else {
          handleError(e, "Create failed");
          process.exit(1);
        }
      }
    });
}
