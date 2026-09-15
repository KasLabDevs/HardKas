import { Command } from "commander";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { getOutput } from "../output.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { extractPinnedFiles } from "../toolchain-archive.js";

const MAX_ASSET_BYTES = 256 * 1024 * 1024;

async function getManagedToolchains() {
  const { KASPA_WASM_REFERENCE, SILVERC_REFERENCES } = await import("@hardkas/core");
  const refs: Record<string, typeof KASPA_WASM_REFERENCE> = { [KASPA_WASM_REFERENCE.id]: KASPA_WASM_REFERENCE };
  // silverc is per platform; where it is not pinned it is simply not offered.
  const silverc = SILVERC_REFERENCES[`${process.platform}-${process.arch}`];
  if (silverc) refs[silverc.id] = silverc;
  return refs;
}

async function fetchAsset(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!response.ok) {
    throw new HardkasCliError("TOOLCHAIN_DOWNLOAD_FAILED", `GET ${url} returned HTTP ${response.status}`, {
      exitCode: HardkasExitCode.RUNTIME_FAILURE
    });
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_ASSET_BYTES) {
    throw new HardkasCliError("TOOLCHAIN_DOWNLOAD_FAILED", `${url} is larger than ${MAX_ASSET_BYTES} bytes`, {
      exitCode: HardkasExitCode.RUNTIME_FAILURE
    });
  }
  return new Uint8Array(await response.arrayBuffer());
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

      const { verifyManagedToolchain, installManagedToolchain, getToolchainInstallDir } = await import("@hardkas/core");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");

      const existing = await verifyManagedToolchain(ref);
      if (existing.ok && !opts.force) {
        if (opts.json) out.writeJson({ status: "TOOLCHAIN_ALREADY_INSTALLED", id: ref.id, version: ref.version, dir: existing.dir });
        else out.writeLine(`${pc.green("✔")} ${ref.id} ${ref.version} already installed and verified at ${existing.dir}`);
        return;
      }

      // 1. Obtain the release asset.
      let asset: Uint8Array;
      let source: { kind: "download" | "file"; location: string };
      if (opts.fromFile) {
        const file = path.resolve(opts.fromFile);
        asset = new Uint8Array(await fs.readFile(file));
        source = { kind: "file", location: file };
      } else {
        out.writeLine(`Downloading ${ref.assetName} from ${ref.url} ...`);
        asset = await fetchAsset(ref.url);
        source = { kind: "download", location: ref.url };
      }

      // 2. The asset must be exactly the pinned release before anything is extracted.
      const assetSha256 = createHash("sha256").update(asset).digest("hex");
      if (assetSha256 !== ref.assetSha256) {
        throw new HardkasCliError(
          "TOOLCHAIN_ASSET_DIGEST_MISMATCH",
          `${ref.assetName}: sha256 ${assetSha256}, expected ${ref.assetSha256}. Nothing was installed.`,
          { exitCode: HardkasExitCode.CORRUPTION_DETECTED }
        );
      }

      // 3. Extract only the pinned file names. Entry names are matched exactly and
      //    files are written under our own names, so an entry cannot choose its path.
      const files = await extractPinnedFiles(ref, asset);

      // 4-6. Content check against the pin, atomic install, provenance record (in core).
      const { dir, record } = await installManagedToolchain(ref, {
        assetSha256,
        files,
        source,
        installer: `hardkas ${HARDKAS_VERSION}`
      });

      const verified = await verifyManagedToolchain(ref, dir);
      if (!verified.ok) {
        throw new HardkasCliError(
          "TOOLCHAIN_VERIFY_FAILED",
          `Installed toolchain at ${getToolchainInstallDir(ref)} failed verification: ${verified.problems.join("; ")}`,
          { exitCode: HardkasExitCode.CORRUPTION_DETECTED }
        );
      }

      if (opts.json) {
        out.writeJson({ status: "TOOLCHAIN_INSTALLED", dir, record });
      } else {
        out.writeLine(`${pc.green("✔")} Installed ${ref.id} ${ref.version} at ${dir}`);
        out.writeLine(`  asset   ${ref.assetName} sha256 ${assetSha256}`);
        out.writeLine(`  source  ${source.location}`);
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
