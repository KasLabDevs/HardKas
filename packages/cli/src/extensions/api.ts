import type { Command } from "commander";
import type { LoadedHardkasConfig } from "@hardkas/config";
import type { ManagedToolchainReference } from "@hardkas/core";

/**
 * L2-EXT stage 2 · the contract between the HardKAS CLI (core) and a first-party extension.
 *
 * An extension is an npm package from the catalog below, installed in the project (devDependency) at the CLI's exact
 * version. Its `package.json` declares `"hardkas": { "extension": { "id", "apiVersion", "entry" } }`; the entry's default
 * export is a `HardkasExtension`. The core never loads one that is absent, disabled or incompatible, and loads nothing
 * of it before every check passed.
 */
export const HARDKAS_EXTENSION_API_VERSION = 1 as const;

export interface HardkasExtensionContext {
  readonly cliVersion: string;
  /** The invocation's one workspace root (WORKSPACE-AUTHORITY-1, WA-I0). */
  readonly workspaceRoot: string;
  readonly loadedConfig: LoadedHardkasConfig | undefined;
}

export interface HardkasExtensionTemplate {
  readonly id: string;
  readonly description: string;
  /** Absolute directory inside the installed package. */
  readonly dir: string;
  /** What `hardkas create` prints after `cd <dest>` (L2-EXT stage 5); the core's default otherwise. */
  readonly nextSteps?: readonly string[];
}

export interface HardkasExtensionDoctorCheck {
  readonly id: string;
  run(ctx: HardkasExtensionContext): Promise<{ ok: boolean; detail: string; fix?: string }>;
}

export interface HardkasExtension {
  readonly apiVersion: typeof HARDKAS_EXTENSION_API_VERSION;
  /** Must equal the manifest's and the catalog's id. */
  readonly id: string;
  registerCommands?(program: Command, ctx: HardkasExtensionContext): void;
  templates?(): readonly HardkasExtensionTemplate[];
  /**
   * L2-EXT stage 3: pins of the toolchains it needs, for THIS platform only (installed by the core's toolchain manager,
   * never by the extension, and only on `hardkas toolchain install <id>`). A catalog toolchain id it omits is reported
   * as not available on this platform.
   */
  toolchains?(): readonly ManagedToolchainReference[];
  doctorChecks?(): readonly HardkasExtensionDoctorCheck[];
}

/** One catalog entry: what the core answers for while the extension is not loaded. */
export interface KnownExtension {
  readonly id: string;
  readonly packageName: string;
  /** Top-level commands the extension owns (the core registers a hidden refusal for each one). */
  readonly rootCommands: readonly string[];
  /** Subcommands it adds to core groups, as [group, subcommand]. */
  readonly subcommands: readonly (readonly [string, string])[];
  /** `hardkas create` template ids it provides. */
  readonly templates: readonly string[];
  /** `hardkas toolchain install` ids it provides (L2-EXT stage 3). */
  readonly toolchains: readonly string[];
  readonly summary: string;
  /**
   * INT9: whether this release publishes the package to the registry (docs/status/versioning.md). When it does not,
   * `hardkas extension install <id>` cannot fetch it, so no refusal recommends that command as the next step.
   */
  readonly published: boolean;
}

/**
 * The first-party catalog (D7: no third-party extensions in v1). `node_modules` is not a trusted source of code to run
 * inside the CLI, so only these package names are ever resolved.
 */
export const KNOWN_EXTENSIONS: readonly KnownExtension[] = [
  {
    id: "l2",
    packageName: "@hardkas/ext-l2",
    // `local` (wizard) is the one-version alias of `l2 wizard` (D6). `metamask` is not listed: the core has not
    // registered it since SURFACE-TRUTH-1B, so without the extension it stays an unknown command, as today.
    rootCommands: ["l2", "local"],
    subcommands: [["dev", "doctor"]],
    templates: ["l2-evm"],
    toolchains: ["foundry", "solc"],
    summary: "Igra L2 (EVM) lab: profiles, JSON-RPC, EVM transactions and contracts",
    // L1-CORE-1 B5 / INT9: @hardkas/ext-l2 and its dependency @hardkas/l2 are private in this release.
    published: false
  }
];

export function knownExtension(id: string): KnownExtension | undefined {
  return KNOWN_EXTENSIONS.find((e) => e.id === id);
}
