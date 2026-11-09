import type { Command } from "commander";
import { HardkasCliError } from "../cli-errors.js";
import type { KnownExtension } from "./api.js";
import { type ExtensionRegistry, type ExtensionState, extensionStateOf } from "./registry.js";

/**
 * The typed error for a command, template or doctor module of an extension that is not loaded (P2): it names the
 * reason (not installed, disabled, incompatible) and the exact next step. Nothing of the extension is imported.
 */
export function extensionUnavailableError(known: KnownExtension, state: ExtensionState | undefined, what: string): HardkasCliError {
  const install = `hardkas extension install ${known.id}`;
  // INT9: a package this release does not publish cannot come from the registry, so the next step never says it can.
  const unpublished =
    `${known.packageName} is not published in this release, so '${install}' cannot fetch it from a registry; ` +
    `it works only with a local build or tarballs (docs/status/versioning.md, "Not published").`;
  if (state?.status === "disabled") {
    return new HardkasCliError(
      "EXTENSION_DISABLED",
      `${what} belongs to the '${known.id}' extension (${known.packageName}), which this project's hardkas.config disables (extensions.${known.id} = false).`,
      { suggestion: `Remove extensions.${known.id}: false from hardkas.config to enable it.`, context: { extension: known.id } }
    );
  }
  if (state?.status === "incompatible") {
    const context: Record<string, string> = { extension: known.id, reason: state.reason };
    if (state.expected !== undefined) context.expected = state.expected;
    if (state.found !== undefined) context.found = state.found;
    return new HardkasCliError(
      "EXTENSION_INCOMPATIBLE",
      `${what} belongs to the '${known.id}' extension, but the installed ${known.packageName} was not loaded: ${state.detail}.`,
      { suggestion: known.published ? `Reinstall it at the CLI's version: ${install}` : `Reinstall it at the CLI's version. ${unpublished}`, context }
    );
  }
  const experimental =
    process.env.HARDKAS_EXPERIMENTAL_L2 === "1" && known.id === "l2"
      ? " HARDKAS_EXPERIMENTAL_L2 no longer registers L2 commands: the extension does."
      : "";
  const declaredOnly = state?.status === "not_installed" && state.declared ? ` ${known.packageName} is declared in package.json but not installed.` : "";
  return new HardkasCliError(
    "EXTENSION_NOT_INSTALLED",
    `${what} belongs to the '${known.id}' extension (${known.packageName}: ${known.summary}), which is not installed in this project; it is not part of the HardKAS core.${declaredOnly}${experimental}`,
    {
      suggestion: known.published ? `Install it in this project: ${install}` : unpublished,
      context: { extension: known.id, package: known.packageName }
    }
  );
}

function refusingCommand(cmd: Command, known: KnownExtension, registry: ExtensionRegistry, what: string): void {
  cmd
    .helpOption(false)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument("[args...]")
    .action(() => {
      throw extensionUnavailableError(known, extensionStateOf(registry, known.id), what);
    });
}

/**
 * Registers a hidden refusal for every command an extension owns while it is not loaded, so `hardkas l2 …` answers
 * with the typed reason instead of "unknown command". Commands the core itself registered are never shadowed.
 */
export function registerExtensionRefusals(program: Command, registry: ExtensionRegistry, unavailable: readonly KnownExtension[]): void {
  for (const known of unavailable) {
    for (const name of known.rootCommands) {
      if (program.commands.some((c) => c.name() === name)) continue;
      refusingCommand(program.command(name, { hidden: true }), known, registry, `'hardkas ${name}'`);
    }
    for (const [group, sub] of known.subcommands) {
      const parent = program.commands.find((c) => c.name() === group);
      if (!parent || parent.commands.some((c) => c.name() === sub)) continue;
      refusingCommand(parent.command(sub, { hidden: true }), known, registry, `'hardkas ${group} ${sub}'`);
    }
  }
}
