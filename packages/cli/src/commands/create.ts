import type { Command } from "commander";
import { UI, handleError } from "../ui.js";
import path from "node:path";
import fs from "node:fs";
import url from "node:url";
import { coerceHardkasDependencyVersions } from "../lib/scaffold-versions.js";
import { EMPTY_EXTENSION_REGISTRY, type ExtensionRegistry, extensionStateOf } from "../extensions/registry.js";
import { KNOWN_EXTENSIONS } from "../extensions/api.js";
import { extensionUnavailableError } from "../extensions/refusal.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/**
 * L2-EXT stage 2 (design §3.7): a template id is the core's, else a loaded extension's; one a known extension provides
 * while it is not loaded is a typed refusal that copies nothing. An id in both places is a programming error.
 */
function resolveTemplate(template: string, extensions: ExtensionRegistry): { dir: string; nextSteps?: readonly string[] } {
  const possiblePaths = [
    path.join(__dirname, "../templates", template), // from dist
    path.join(__dirname, "../../templates", template) // from src/commands
  ];
  const core = possiblePaths.find((p) => fs.existsSync(p));
  const fromExtensions = extensions.loaded.flatMap((ext) => (ext.extension.templates?.() ?? []).filter((t) => t.id === template));
  if (core && fromExtensions.length > 0) {
    throw new Error(`Template '${template}' is defined by both the core and an extension.`);
  }
  if (core) return { dir: core };
  if (fromExtensions[0]) return { dir: fromExtensions[0].dir, ...(fromExtensions[0].nextSteps ? { nextSteps: fromExtensions[0].nextSteps } : {}) };
  const owner = KNOWN_EXTENSIONS.find((k) => k.templates.includes(template));
  const ownerState = owner ? extensionStateOf(extensions, owner.id) : undefined;
  if (owner && ownerState?.status === "loaded") {
    throw new Error(`Template '${template}' is not provided by the installed ${owner.packageName}@${ownerState.version}.`);
  }
  if (owner) throw extensionUnavailableError(owner, ownerState, `The '${template}' template`);
  throw new Error(`Template '${template}' not found.`);
}

export function registerCreateCommand(program: Command, extensions: ExtensionRegistry = EMPTY_EXTENSION_REGISTRY) {
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
        
        // In dist, we are at packages/cli/dist/index.js (or similar); the templates ship in packages/cli/templates.
        const resolved = resolveTemplate(template, extensions);
        const templateDir = resolved.dir;

        if (fs.existsSync(destDir)) {
          throw new Error(`Destination directory '${dest}' already exists.`);
        }

        // Copy recursively
        fs.cpSync(templateDir, destDir, { recursive: true });

        // Update package.json name and enforce coordinated HardKAS version
        // coherence for every `@hardkas/*` dependency. Static templates carry
        // a scaffold placeholder rather than a real version specifier; this
        // step normalises them to the CLI's own exact version. See
        // `scaffold-versions.ts` for the invariant.
        const pkgFile = path.join(destDir, "package.json");
        if (fs.existsSync(pkgFile)) {
          const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf-8"));
          pkg.name = path.basename(destDir);
          coerceHardkasDependencyVersions(pkg);
          fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2), "utf-8");
        }

        // Handle .npmignore -> .gitignore
        const npmIgnore = path.join(destDir, ".npmignore");
        const gitIgnore = path.join(destDir, ".gitignore");
        if (fs.existsSync(npmIgnore)) {
          fs.renameSync(npmIgnore, gitIgnore);
        }
        // L2-EXT stage 5: package managers drop dot-ignore files from a tarball, so a template ships `_gitignore`
        const underscoreIgnore = path.join(destDir, "_gitignore");
        if (fs.existsSync(underscoreIgnore) && !fs.existsSync(gitIgnore)) {
          fs.renameSync(underscoreIgnore, gitIgnore);
        }

        if (options.install) {
          if (!options.json) UI.info("Running npm install...");
          const { execSync } = await import("node:child_process");
          execSync("npm install", { stdio: options.json ? "ignore" : "inherit", cwd: destDir });
        }

        const nextSteps = [
          `cd ${dest}`,
          ...(options.install ? [] : ["npm install"]),
          ...(resolved.nextSteps ?? ["npx hardkas test"])
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
        // An extension's template while the extension is not loaded: the CLI's one typed refusal (exit ≠ 0), never
        // the legacy create envelope (its exit-0 gap is CLI-CONTRACT-2B, out of this change).
        if (typeof e?.code === "string" && e.code.startsWith("EXTENSION_")) throw e;
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
