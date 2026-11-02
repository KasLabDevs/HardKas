import path from "node:path";
import type { ManagedToolchainReference } from "@hardkas/cli/extension-kit";
import { HardkasCliError, HardkasExitCode } from "@hardkas/cli/extension-kit";
import { foundryReferenceFor, isMusl } from "./foundry.js";
import { solcReferenceFor } from "./solc.js";

/**
 * L2-EXT stages 4-5 · a pinned toolchain the extension runs, only once the core's manager says it is installed AND
 * matches its pin (every file, by SHA-256). Never installs or downloads anything: without it, a typed refusal that
 * names the exact install command.
 */
export interface VerifiedToolchain {
  readonly ref: ManagedToolchainReference;
  readonly dir: string;
  /** Absolute path of one of its pinned executables. */
  bin(name: string): string;
}

const LABEL: Record<string, string> = { foundry: "Foundry", solc: "solc" };

export function toolchainReferenceHere(id: "foundry" | "solc"): ManagedToolchainReference | undefined {
  const musl = isMusl();
  return id === "foundry" ? foundryReferenceFor(process.platform, process.arch, musl) : solcReferenceFor(process.platform, process.arch, musl);
}

export async function verifiedToolchain(id: "foundry" | "solc", nothingWas: string): Promise<VerifiedToolchain> {
  const ref = toolchainReferenceHere(id);
  const label = LABEL[id]!;
  if (!ref) {
    throw new HardkasCliError("TOOLCHAIN_PLATFORM_UNSUPPORTED", `no pinned ${label} release for ${process.platform}-${process.arch}${isMusl() ? " (musl libc)" : ""}`, {
      exitCode: HardkasExitCode.USAGE_ERROR
    });
  }
  const { verifyManagedToolchainSync } = await import("@hardkas/core");
  const v = verifyManagedToolchainSync(ref);
  if (!v.installed) {
    throw new HardkasCliError("TOOLCHAIN_NOT_INSTALLED", `${label} ${ref.version} is not installed (install it with: hardkas toolchain install ${id}); ${nothingWas}.`, {
      suggestion: `Install it explicitly: hardkas toolchain install ${id}`
    });
  }
  if (!v.ok) {
    throw new HardkasCliError(
      "TOOLCHAIN_VERIFY_FAILED",
      `the installed ${label} does not match its pin (${v.problems.join("; ")}); ${nothingWas}. Reinstall it: hardkas toolchain install ${id} --force`,
      { exitCode: HardkasExitCode.CORRUPTION_DETECTED, suggestion: `Reinstall it: hardkas toolchain install ${id} --force` }
    );
  }
  return {
    ref,
    dir: v.dir,
    bin(name) {
      if (!ref.files[name]) throw new Error(`${name} is not a pinned file of ${id}`);
      return path.join(v.dir, name);
    }
  };
}
