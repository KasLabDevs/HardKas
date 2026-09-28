import { Command } from "commander";
import pc from "picocolors";
import { getOutput } from "../output.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { ensureManagedToolchain } from "../toolchain-install.js";

async function getManagedToolchains() {
  const { KASPA_WASM_REFERENCE, SILVERC_REFERENCES } = await import("@hardkas/core");
  const refs: Record<string, typeof KASPA_WASM_REFERENCE> = { [KASPA_WASM_REFERENCE.id]: KASPA_WASM_REFERENCE };
  // silverc is per platform; where it is not pinned it is simply not offered.
  const silverc = SILVERC_REFERENCES[`${process.platform}-${process.arch}`];
  if (silverc) refs[silverc.id] = silverc;
  return refs;
}

export function registerToolchainCommands(program: Command) {
  const toolchainCmd = program
    .command("toolchain")
    .description("Install and verify the upstream toolchains HardKAS pins (official Kaspa release assets)");

  toolchainCmd
    .command("install <id>")
    .description("Install a pinned toolchain, verifying the release asset and every file against the pin")
    .option("--from-file <asset>", "Use a release asset already on disk instead of downloading it")
    .option("--force", "Reinstall even if a verified install is present", false)
    .option("--json", "Output as JSON", false)
    .action(async (id: string, opts: { fromFile?: string; force: boolean; json: boolean }) => {
      const out = getOutput();
      const refs = await getManagedToolchains();
      const ref = refs[id];
      if (!ref) {
        throw new HardkasCliError(
          "TOOLCHAIN_UNKNOWN",
          `Unknown toolchain '${id}'. Managed toolchains: ${Object.keys(refs).join(", ")}`,
          { exitCode: HardkasExitCode.USAGE_ERROR }
        );
      }

      const result = await ensureManagedToolchain(ref, {
        fromFile: opts.fromFile,
        force: opts.force,
        onFetch: (source) => {
          if (source.kind === "download") out.writeLine(`Downloading ${ref.assetName} from ${ref.url} ...`);
        }
      });

      if (result.status === "already-installed") {
        if (opts.json) out.writeJson({ status: "TOOLCHAIN_ALREADY_INSTALLED", id: ref.id, version: ref.version, dir: result.dir });
        else out.writeLine(`${pc.green("✔")} ${ref.id} ${ref.version} already installed and verified at ${result.dir}`);
        return;
      }

      if (opts.json) {
        out.writeJson({ status: "TOOLCHAIN_INSTALLED", dir: result.dir, record: result.record });
      } else {
        out.writeLine(`${pc.green("✔")} Installed ${ref.id} ${ref.version} at ${result.dir}`);
        out.writeLine(`  asset   ${ref.assetName} sha256 ${result.assetSha256}`);
        out.writeLine(`  source  ${result.source?.location}`);
      }
    });

  toolchainCmd
    .command("status")
    .description("Show whether each pinned toolchain is installed and matches its pin")
    .option("--json", "Output as JSON", false)
    .action(async (opts: { json: boolean }) => {
      const out = getOutput();
      const { verifyManagedToolchain } = await import("@hardkas/core");
      const refs = await getManagedToolchains();

      const results = [];
      for (const ref of Object.values(refs)) {
        const v = await verifyManagedToolchain(ref);
        results.push({
          id: ref.id,
          version: ref.version,
          releaseTag: ref.releaseTag,
          assetSha256: ref.assetSha256,
          dir: v.dir,
          installed: v.installed,
          verified: v.ok,
          problems: v.problems,
          installedAt: v.record?.installedAt,
          source: v.record?.source
        });
      }

      if (opts.json) {
        out.writeJson({ toolchains: results });
      } else {
        for (const r of results) {
          const state = r.verified
            ? pc.green("verified")
            : r.installed
              ? pc.red("DOES NOT MATCH PIN")
              : pc.yellow("not installed");
          out.writeLine(`${pc.bold(r.id)} ${r.version} (${r.releaseTag})  ${state}`);
          out.writeLine(`  dir  ${r.dir}`);
          for (const p of r.installed ? r.problems : []) out.writeLine(`  - ${p}`);
          if (!r.installed) out.writeLine(`  install with: hardkas toolchain install ${r.id}`);
        }
      }

      if (results.some((r) => r.installed && !r.verified)) {
        throw new HardkasCliError("TOOLCHAIN_VERIFY_FAILED", "An installed toolchain does not match its pin", {
          exitCode: HardkasExitCode.CORRUPTION_DETECTED
        });
      }
    });
}
