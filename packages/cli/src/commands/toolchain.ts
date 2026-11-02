import { Command } from "commander";
import pc from "picocolors";
import { getOutput } from "../output.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { ensureManagedToolchain } from "../toolchain-install.js";
import { EMPTY_EXTENSION_REGISTRY, type ExtensionRegistry, extensionStateOf } from "../extensions/registry.js";
import { KNOWN_EXTENSIONS } from "../extensions/api.js";
import { extensionUnavailableError } from "../extensions/refusal.js";

async function getManagedToolchains(extensions: ExtensionRegistry) {
  const { KASPA_WASM_REFERENCE, SILVERC_REFERENCES } = await import("@hardkas/core");
  const refs: Record<string, typeof KASPA_WASM_REFERENCE> = { [KASPA_WASM_REFERENCE.id]: KASPA_WASM_REFERENCE };
  // silverc is per platform; where it is not pinned it is simply not offered.
  const silverc = SILVERC_REFERENCES[`${process.platform}-${process.arch}`];
  if (silverc) refs[silverc.id] = silverc;
  // L2-EXT stage 3 (design §3.5): the pins of the loaded extensions, for this platform, installed by this same manager
  for (const ext of extensions.loaded) {
    for (const ref of ext.extension.toolchains?.() ?? []) {
      if (refs[ref.id]) throw new Error(`toolchain id '${ref.id}' is pinned twice (core and the '${ext.known.id}' extension)`);
      refs[ref.id] = ref;
    }
  }
  return refs;
}

/** The typed reason an id that is not offered here is missing: an extension's toolchain, or unknown. */
function unavailableToolchain(id: string, refs: Record<string, unknown>, extensions: ExtensionRegistry): HardkasCliError {
  const owner = KNOWN_EXTENSIONS.find((k) => k.toolchains.includes(id));
  if (owner) {
    const state = extensionStateOf(extensions, owner.id);
    if (state?.status !== "loaded") return extensionUnavailableError(owner, state, `The '${id}' toolchain`);
    return new HardkasCliError(
      "TOOLCHAIN_PLATFORM_UNSUPPORTED",
      `The '${owner.id}' extension pins no '${id}' release asset for ${process.platform}-${process.arch}: it is not offered on this platform rather than installed unverified.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
  return new HardkasCliError("TOOLCHAIN_UNKNOWN", `Unknown toolchain '${id}'. Managed toolchains: ${Object.keys(refs).join(", ")}`, {
    exitCode: HardkasExitCode.USAGE_ERROR
  });
}

export function registerToolchainCommands(program: Command, extensions: ExtensionRegistry = EMPTY_EXTENSION_REGISTRY) {
  const toolchainCmd = program
    .command("toolchain")
    .description("Install and verify the upstream toolchains HardKAS pins (official Kaspa release assets; an installed extension adds its own, e.g. the l2 extension's foundry)");

  toolchainCmd
    .command("install <id>")
    .description("Install a pinned toolchain, verifying the release asset and every file against the pin")
    .option("--from-file <asset>", "Use a release asset already on disk instead of downloading it")
    .option("--force", "Reinstall even if a verified install is present", false)
    .option("--json", "Output as JSON", false)
    .action(async (id: string, opts: { fromFile?: string; force: boolean; json: boolean }) => {
      const out = getOutput();
      const refs = await getManagedToolchains(extensions);
      const ref = refs[id];
      if (!ref) throw unavailableToolchain(id, refs, extensions);

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
      const refs = await getManagedToolchains(extensions);

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
