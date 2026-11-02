import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { UI, getOutput, invocationWorkspaceRoot, HardkasCliError, HardkasExitCode } from "@hardkas/cli/extension-kit";

/**
 * L2-EXT stage 5 · `hardkas l2 compile [--check]`: the workspace's Foundry project, compiled offline by the verified
 * forge with the verified solc 0.8.38. Installs nothing: without either toolchain it refuses with the install command.
 */
export function registerL2CompileCommand(l2: Command): void {
  l2.command("compile")
    .description(`Compile the workspace's Solidity project offline with the pinned, verified forge + solc ${UI.maturity("experimental")}`)
    .option("--check", "Rebuild into a temporary directory and compare the bytecode with the recorded build", false)
    .option("--json", "Output as JSON", false)
    .action(async (options: { check: boolean; json: boolean }) => {
      const root = invocationWorkspaceRoot();
      if (!fs.existsSync(path.join(root, "foundry.toml"))) {
        throw new HardkasCliError("L2_PROJECT_NOT_FOUND", `no foundry.toml in ${root} (create one with: hardkas create l2-evm <dir>)`, {
          exitCode: HardkasExitCode.USAGE_ERROR
        });
      }
      const { verifiedToolchain } = await import("../toolchains/verified.js");
      const nothing = "nothing was compiled";
      const tools = { forge: await verifiedToolchain("foundry", nothing), solc: await verifiedToolchain("solc", nothing) };
      const build = await import("../compile/forge-build.js");

      if (options.check) {
        const { recorded, rebuilt, differences } = await build.checkReproducible(root, tools);
        if (differences.length > 0) {
          throw new HardkasCliError("L2_BUILD_NOT_REPRODUCIBLE", `the rebuild differs from the recorded build:\n  ${differences.join("\n  ")}`, {
            exitCode: HardkasExitCode.CORRUPTION_DETECTED
          });
        }
        const result = { reproducible: true, contracts: Object.keys(rebuilt.contracts).length, solc: recorded.solc.version, evmVersions: rebuilt.evmVersions };
        if (options.json) getOutput().writeJson({ ok: true, command: "l2 compile --check", result });
        else UI.success(`Reproducible: ${result.contracts} contract(s) rebuilt with identical bytecode (solc ${result.solc})`);
        return;
      }

      const { manifest, manifestPath } = await build.compileProject(root, tools);
      const result = { manifest: manifestPath, contracts: Object.keys(manifest.contracts), solc: manifest.solc.version, evmVersions: manifest.evmVersions };
      if (options.json) getOutput().writeJson({ ok: true, command: "l2 compile", result });
      else {
        UI.success(`Compiled ${result.contracts.length} contract(s) offline with solc ${result.solc} (evm ${result.evmVersions.join(", ")})`);
        UI.field("build record", manifestPath);
      }
    });
}
