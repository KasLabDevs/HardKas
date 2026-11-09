import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { HARDKAS_VERSION } from "@hardkas/artifacts";
import { UI } from "../ui.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { invocationWorkspaceRoot } from "../workspace-root.js";
import { KNOWN_EXTENSIONS, knownExtension, type KnownExtension } from "../extensions/api.js";
import { EMPTY_EXTENSION_REGISTRY, type ExtensionRegistry, type ExtensionState, extensionStateOf, loadExtensions } from "../extensions/registry.js";
import { extensionUnavailableError } from "../extensions/refusal.js";

/**
 * L2-EXT stage 2 · `hardkas extension list|install|remove|doctor` (design §3.4, owner correction C2).
 *
 * `install` only ever installs a catalog package, at the CLI's exact version, with install scripts disabled. From a
 * local tarball it requires `--sha256` and checks it, and the tarball's own manifest (name, version, id, no lifecycle
 * scripts), before the package manager runs. It never downloads a toolchain or starts a process.
 */

type PackageManager = "pnpm" | "npm" | "yarn";

/** The project's package manager, from its lockfile (npm when there is none). */
export function detectPackageManager(workspaceRoot: string): PackageManager {
  if (fs.existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(workspaceRoot, "yarn.lock"))) return "yarn";
  return "npm";
}

/** A project root that is also a pnpm workspace root: pnpm refuses to add to it without -w (ERR_PNPM_ADDING_TO_ROOT). */
export function isPnpmWorkspaceRoot(workspaceRoot: string): boolean {
  return fs.existsSync(path.join(workspaceRoot, "pnpm-workspace.yaml"));
}

export function installCommand(pm: PackageManager, spec: string, opts: { pnpmWorkspaceRoot?: boolean } = {}): readonly string[] {
  if (pm === "pnpm") return ["pnpm", "add", "-D", ...(opts.pnpmWorkspaceRoot ? ["-w"] : []), "--ignore-scripts", spec];
  if (pm === "yarn") return ["yarn", "add", "-D", "--ignore-scripts", spec];
  return ["npm", "install", "-D", "--ignore-scripts", spec];
}

export function removeCommand(pm: PackageManager, packageName: string, opts: { pnpmWorkspaceRoot?: boolean } = {}): readonly string[] {
  if (pm === "pnpm") return ["pnpm", "remove", ...(opts.pnpmWorkspaceRoot ? ["-w"] : []), packageName];
  if (pm === "yarn") return ["yarn", "remove", packageName];
  return ["npm", "uninstall", packageName];
}

const LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall", "prepare"] as const;

/** `package/package.json` of an npm tarball (gzip + ustar), without extracting anything to disk. */
export function readTarballManifest(tgz: Buffer): any {
  const tar = zlib.gunzipSync(tgz);
  for (let off = 0; off + 512 <= tar.length; ) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start: number, len: number) => header.subarray(start, start + len).toString("utf8").replace(/\0.*$/s, "");
    const prefix = field(345, 155);
    const name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const type = field(156, 1);
    const body = off + 512;
    if ((type === "0" || type === "") && name.replace(/^\.\//, "") === "package/package.json") {
      return JSON.parse(tar.subarray(body, body + size).toString("utf8"));
    }
    off = body + Math.ceil(size / 512) * 512;
  }
  throw new HardkasCliError("EXTENSION_TARBALL_INVALID", "The tarball has no package/package.json: it is not an npm package.", {
    exitCode: HardkasExitCode.POLICY_DENIED
  });
}

/** C2: the checks a local tarball passes before any package manager sees it. */
export function vetExtensionTarball(file: string, sha256: string | undefined, known: KnownExtension, cliVersion: string): { sha256: string } {
  if (!sha256) {
    throw new HardkasCliError("EXTENSION_SHA256_REQUIRED", "Installing an extension from a local tarball requires --sha256 <hash> of that file.", {
      exitCode: HardkasExitCode.USAGE_ERROR,
      suggestion: "Pass the SHA-256 published with the release (e.g. Get-FileHash / sha256sum of the .tgz)."
    });
  }
  if (!/^[0-9a-fA-F]{64}$/.test(sha256)) {
    throw new HardkasCliError("EXTENSION_SHA256_INVALID", "--sha256 must be 64 hex characters.", { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new HardkasCliError("EXTENSION_TARBALL_NOT_FOUND", `No such tarball: ${file}`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  const bytes = fs.readFileSync(file);
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  if (actual !== sha256.toLowerCase()) {
    throw new HardkasCliError("EXTENSION_SHA256_MISMATCH", `The tarball's SHA-256 is ${actual}, not the expected ${sha256.toLowerCase()}: nothing was installed.`, {
      exitCode: HardkasExitCode.POLICY_DENIED,
      context: { expected: sha256.toLowerCase(), found: actual }
    });
  }
  const manifest = readTarballManifest(bytes);
  const refuse = (detail: string) =>
    new HardkasCliError("EXTENSION_TARBALL_INVALID", `The tarball is not an installable ${known.packageName}: ${detail}. Nothing was installed.`, {
      exitCode: HardkasExitCode.POLICY_DENIED
    });
  if (manifest?.name !== known.packageName) throw refuse(`it is named ${JSON.stringify(manifest?.name)}`);
  if (manifest?.version !== cliVersion) throw refuse(`its version is ${manifest?.version}, the CLI's is ${cliVersion}`);
  if (manifest?.hardkas?.extension?.id !== known.id) throw refuse(`its manifest does not declare the '${known.id}' extension`);
  const scripts = LIFECYCLE_SCRIPTS.filter((s) => typeof manifest?.scripts?.[s] === "string");
  if (scripts.length > 0) throw refuse(`it declares install-time scripts (${scripts.join(", ")})`);
  return { sha256: actual };
}

function requireKnown(id: string): KnownExtension {
  const known = knownExtension(id);
  if (!known) {
    throw new HardkasCliError("EXTENSION_UNKNOWN", `'${id}' is not a HardKAS extension. Known: ${KNOWN_EXTENSIONS.map((k) => k.id).join(", ")}.`, {
      exitCode: HardkasExitCode.USAGE_ERROR
    });
  }
  return known;
}

function requireNodeProject(workspaceRoot: string): void {
  if (!fs.existsSync(path.join(workspaceRoot, "package.json"))) {
    throw new HardkasCliError("NOT_NODE_PROJECT", `${workspaceRoot} has no package.json: extensions are installed in the project.`, {
      exitCode: HardkasExitCode.USAGE_ERROR,
      suggestion: "Run it from a Node project (npm init -y), or pass --workspace <project>."
    });
  }
}

async function confirmOrRefuse(command: readonly string[], options: { yes?: boolean; json?: boolean }): Promise<void> {
  if (options.yes) return;
  if (!process.stdin.isTTY || options.json) {
    throw new HardkasCliError("EXTENSION_CONFIRMATION_REQUIRED", `This runs: ${command.join(" ")}. Re-run with --yes to confirm (or --dry-run to only print it).`, {
      exitCode: HardkasExitCode.USAGE_ERROR
    });
  }
  const { default: enquirer } = await import("enquirer");
  const answer = (await enquirer.prompt({ type: "confirm", name: "ok", message: `Run: ${command.join(" ")}?`, initial: false })) as { ok: boolean };
  if (!answer.ok) throw new HardkasCliError("EXTENSION_CANCELLED", "Cancelled: nothing was installed or removed.", { exitCode: HardkasExitCode.USAGE_ERROR });
}

async function runPackageManager(command: readonly string[], cwd: string, json: boolean): Promise<void> {
  const { execa } = await import("execa");
  const [file, ...args] = command;
  try {
    // install scripts are off for every package of the install, not only the extension's own
    await execa(file!, args, { cwd, stdio: json ? "pipe" : "inherit", env: { npm_config_ignore_scripts: "true" } });
  } catch (e: any) {
    const tail = String(e?.stderr ?? e?.message ?? e).split(/\r?\n/).slice(-15).join("\n");
    throw new HardkasCliError("EXTENSION_PACKAGE_MANAGER_FAILED", `${command.join(" ")} failed:\n${tail}`, { cause: e });
  }
}

async function reloadState(workspaceRoot: string, id: string): Promise<ExtensionState | undefined> {
  let loadedConfig;
  try {
    const { loadHardkasConfig } = await import("@hardkas/config");
    loadedConfig = await loadHardkasConfig({ workspaceRoot });
  } catch {
    loadedConfig = undefined;
  }
  return extensionStateOf(await loadExtensions({ workspaceRoot, loadedConfig, cliVersion: HARDKAS_VERSION }), id);
}

function stateRow(s: ExtensionState): Record<string, unknown> {
  const row: Record<string, unknown> = { id: s.known.id, package: s.known.packageName, status: s.status };
  if (s.status === "loaded") row.version = s.version;
  if (s.status === "incompatible") Object.assign(row, { reason: s.reason, detail: s.detail, expected: s.expected, found: s.found });
  if (s.status === "not_installed") row.declared = s.declared;
  return row;
}

async function writeJson(value: unknown): Promise<void> {
  const { getOutput } = await import("../output.js");
  getOutput().writeJson(value);
}

/** `doctor <id>` and `extension doctor`: the checks of the loaded extensions (or the typed reason one is not loaded). */
export async function runExtensionDoctor(registry: ExtensionRegistry, id: string | undefined, opts: { json?: boolean }): Promise<void> {
  const targets = id === undefined ? registry.loaded : registry.loaded.filter((e) => e.known.id === id);
  if (id !== undefined && targets.length === 0) {
    throw extensionUnavailableError(requireKnown(id), extensionStateOf(registry, id), `'hardkas doctor ${id}'`);
  }
  const report = [];
  for (const ext of targets) {
    const checks = [];
    for (const check of ext.extension.doctorChecks?.() ?? []) {
      try {
        checks.push({ id: check.id, ...(await check.run(ext.context)) });
      } catch (e) {
        checks.push({ id: check.id, ok: false, detail: (e as Error)?.message ?? String(e) });
      }
    }
    report.push({ id: ext.known.id, package: ext.known.packageName, version: ext.version, checks });
  }
  const ok = report.every((r) => r.checks.every((c) => c.ok));
  if (opts.json) {
    await writeJson({ schema: "hardkas.extensionDoctor.v1", ok, extensions: report });
  } else if (report.length === 0) {
    UI.info("No extension is loaded in this project (hardkas extension list).");
  } else {
    for (const r of report) {
      UI.header(`${r.id} (${r.package}@${r.version})`);
      for (const c of r.checks) {
        if (c.ok) UI.success(`${c.id}: ${c.detail}`);
        else UI.error(`${c.id}: ${c.detail}`, (c as { fix?: string }).fix);
      }
    }
  }
  if (!ok) process.exitCode = 1;
}

export function registerExtensionCommands(program: Command, registry: ExtensionRegistry = EMPTY_EXTENSION_REGISTRY) {
  const ext = program
    .command("extension")
    .description(`First-party extensions installed in the project (the Igra L2 lab is the 'l2' extension) ${UI.maturity("experimental")}`);

  ext
    .command("list")
    .description("List the known extensions and their state in this project (installed, version, enabled, compatible)")
    .option("--json", "Output as JSON", false)
    .action(async (options: { json?: boolean }) => {
      const rows = registry.states.map(stateRow);
      if (options.json) {
        await writeJson({ ok: true, command: "extension list", result: { cliVersion: HARDKAS_VERSION, extensions: rows } });
        return;
      }
      for (const s of registry.states) {
        const detail = s.status === "loaded" ? `${s.version}` : s.status === "incompatible" ? `${s.reason}: ${s.detail}` : s.status;
        UI.field(`${s.known.id} (${s.known.packageName})`, s.status === "loaded" ? `loaded ${detail}` : detail);
      }
    });

  ext
    .command("install <id>")
    .description("Install an extension in this project at the CLI's exact version, with install scripts disabled; it downloads no toolchain and starts nothing")
    .option("--from <tgz>", "Install from a local npm tarball (offline); requires --sha256")
    .option("--sha256 <hex>", "SHA-256 the --from tarball must have")
    .option("--yes", "Run the package manager without asking", false)
    .option("--dry-run", "Only print the checks' result and the command that would run", false)
    .option("--json", "Output as JSON", false)
    .action(async (id: string, options: { from?: string; sha256?: string; yes?: boolean; dryRun?: boolean; json?: boolean }) => {
      const known = requireKnown(id);
      if (options.sha256 && !options.from) {
        throw new HardkasCliError("EXTENSION_SHA256_WITHOUT_FROM", "--sha256 applies to a --from tarball only.", { exitCode: HardkasExitCode.USAGE_ERROR });
      }
      const workspaceRoot = invocationWorkspaceRoot();
      requireNodeProject(workspaceRoot);
      const pm = detectPackageManager(workspaceRoot);
      let spec = `${known.packageName}@${HARDKAS_VERSION}`;
      let verifiedSha256: string | undefined;
      if (options.from) {
        const file = path.resolve(options.from);
        verifiedSha256 = vetExtensionTarball(file, options.sha256, known, HARDKAS_VERSION).sha256;
        spec = file;
      }
      const command = installCommand(pm, spec, { pnpmWorkspaceRoot: isPnpmWorkspaceRoot(workspaceRoot) });
      const plan = {
        id: known.id,
        package: known.packageName,
        version: HARDKAS_VERSION,
        published: known.published,
        packageManager: pm,
        command,
        ...(verifiedSha256 ? { sha256: verifiedSha256 } : {})
      };
      // INT9 · a registry install of an extension this release does not publish can only fail (a registry 404 after the
      // package manager ran): refuse before it runs, and name the offline way.
      const unpublishedFromRegistry = !options.from && !known.published;
      const offlineWay = `hardkas extension install ${known.id} --from <tgz> --sha256 <hex>`;
      if (options.dryRun) {
        if (options.json) await writeJson({ ok: true, command: "extension install", mode: "dry-run", result: plan });
        else {
          UI.info(`Would run: ${command.join(" ")}`);
          if (unpublishedFromRegistry) UI.warning(`${known.packageName} is not published in this release; only ${offlineWay} can install it.`);
        }
        return;
      }
      if (unpublishedFromRegistry) {
        throw new HardkasCliError(
          "EXTENSION_NOT_PUBLISHED",
          `${known.packageName} is not published in this release, so it cannot be installed from a registry. Nothing was run. Install it from a local tarball: ${offlineWay}`,
          { exitCode: HardkasExitCode.USAGE_ERROR }
        );
      }
      await confirmOrRefuse(command, options);
      await runPackageManager(command, workspaceRoot, Boolean(options.json));
      const state = await reloadState(workspaceRoot, known.id);
      if (state?.status !== "loaded") {
        throw state?.status === "incompatible" || state?.status === "disabled"
          ? extensionUnavailableError(known, state, `The installed '${known.id}' extension`)
          : new HardkasCliError("EXTENSION_INSTALL_FAILED", `${known.packageName} is not in ${workspaceRoot}/node_modules after the install.`);
      }
      const nextSteps = [`hardkas ${known.id} --help`, `hardkas doctor ${known.id}`];
      if (options.json) {
        await writeJson({ ok: true, command: "extension install", result: { ...plan, state: stateRow(state), nextSteps } });
      } else {
        UI.success(`Installed ${known.packageName}@${state.version}: the '${known.id}' commands are available. No toolchain was downloaded and no process was started.`);
        UI.printNextSteps(nextSteps);
      }
    });

  ext
    .command("remove <id>")
    .description("Remove an extension from this project")
    .option("--yes", "Run the package manager without asking", false)
    .option("--dry-run", "Only print the command that would run", false)
    .option("--json", "Output as JSON", false)
    .action(async (id: string, options: { yes?: boolean; dryRun?: boolean; json?: boolean }) => {
      const known = requireKnown(id);
      const workspaceRoot = invocationWorkspaceRoot();
      requireNodeProject(workspaceRoot);
      const pm = detectPackageManager(workspaceRoot);
      const command = removeCommand(pm, known.packageName, { pnpmWorkspaceRoot: isPnpmWorkspaceRoot(workspaceRoot) });
      if (options.dryRun) {
        if (options.json) await writeJson({ ok: true, command: "extension remove", mode: "dry-run", result: { id: known.id, packageManager: pm, command } });
        else UI.info(`Would run: ${command.join(" ")}`);
        return;
      }
      await confirmOrRefuse(command, options);
      await runPackageManager(command, workspaceRoot, Boolean(options.json));
      if (options.json) await writeJson({ ok: true, command: "extension remove", result: { id: known.id, packageManager: pm, command } });
      else UI.success(`Removed ${known.packageName}.`);
    });

  ext
    .command("doctor")
    .description("Run the checks of the extensions loaded in this project")
    .option("--json", "Output as JSON", false)
    .action(async (options: { json?: boolean }) => {
      await runExtensionDoctor(registry, undefined, options);
    });
}
