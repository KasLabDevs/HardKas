import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Single source of truth for the upstream toolchains HardKAS manages.
 *
 * HardKAS does not ship these; it installs the official release asset, checks
 * it against the digests below and loads nothing that does not match. Change a
 * pin only together with evidence of the new release (tag, asset digest as
 * published by GitHub, and the per-file digests of the extracted package).
 */
export interface ManagedToolchainFile {
  /** SHA-256 of the file as extracted from the release asset. */
  readonly sha256: string;
  readonly size: number;
}

export interface ManagedToolchainReference {
  readonly id: string;
  readonly version: string;
  readonly releaseTag: string;
  readonly assetName: string;
  readonly url: string;
  /** SHA-256 of the release asset, as published on the GitHub release. */
  readonly assetSha256: string;
  /** Container format of the release asset. */
  readonly archive: "zip" | "tar.gz";
  /** Directory inside the asset whose files are installed. */
  readonly assetSubdir: string;
  /** Module or program used from the install directory. */
  readonly entry: string;
  /** Pinned files installed as executables (mode 0755 on POSIX). */
  readonly executables?: readonly string[] | undefined;
  readonly files: Readonly<Record<string, ManagedToolchainFile>>;
}

/** Official rusty-kaspa WASM SDK, Node.js build, matching KASPAD_REFERENCE_VERSION. */
export const KASPA_WASM_REFERENCE: ManagedToolchainReference = {
  id: "kaspa-wasm",
  version: "2.0.1",
  releaseTag: "v2.0.1",
  assetName: "kaspa-wasm32-sdk-v2.0.1.zip",
  url: "https://github.com/kaspanet/rusty-kaspa/releases/download/v2.0.1/kaspa-wasm32-sdk-v2.0.1.zip",
  assetSha256: "7eaffac9cd920ef2fdf540c6e10f2a2b7761170ebc62ec57dfa0f71c64567a71",
  archive: "zip",
  assetSubdir: "kaspa-wasm32-sdk/nodejs/kaspa/",
  entry: "kaspa.js",
  files: {
    "kaspa.js": { sha256: "1e0ad892861bf3e0a63ba8ed51366efc2b812c5a34c6895385ee2f9d026d2fc1", size: 539663 },
    "kaspa_bg.wasm": { sha256: "9427733cb0cb1c78cc3f2cc9f77f4153426636925ced0256c5c30e4edc199eaa", size: 11516828 },
    "kaspa.d.ts": { sha256: "419603c791100bb19eeacbbfb49e3dc734d832a0bffc0d11582c73af6c30e704", size: 221917 },
    "package.json": { sha256: "f200a3dcc702735e41a70b72af2f6cc99dd970579d198cc9f1fdb2e532d0c479", size: 372 },
    "LICENSE": { sha256: "fb06b99a835c4cdade7f2f180fd87c0198d552cf1e0cd14c34716411b009a92f", size: 749 }
  }
};

/**
 * Official SilverScript release HardKAS compiles with.
 *
 * `languageVersion` is what silverc writes as `compiler_version` and checks
 * `pragma silverscript` against; it is not the release tag. silverc has no
 * `--version`, so the compiler's identity is the pinned release asset below.
 */
export const SILVERSCRIPT_RELEASE = {
  repository: "kaspanet/silverscript",
  releaseTag: "v1.0.0",
  commit: "3ed973335b59269293564805cc2c58a14595ec03",
  languageVersion: "0.1.0",
  abiSchemaVersion: 1
} as const;

const SILVERC_DOWNLOAD = `https://github.com/${SILVERSCRIPT_RELEASE.repository}/releases/download/${SILVERSCRIPT_RELEASE.releaseTag}/`;

/**
 * Official silverc release assets, by `${process.platform}-${process.arch}`.
 * Only platforms whose extracted binary has been digested are pinned; on any
 * other platform the compiler is unavailable rather than unverified.
 */
export const SILVERC_REFERENCES: Readonly<Record<string, ManagedToolchainReference>> = {
  "win32-x64": {
    id: "silverc",
    version: "1.0.0",
    releaseTag: SILVERSCRIPT_RELEASE.releaseTag,
    assetName: "silverc-windows-x86_64.zip",
    url: `${SILVERC_DOWNLOAD}silverc-windows-x86_64.zip`,
    assetSha256: "3e0d660c15a9e7ac90f3960da24d348b076b1891481bfe758db18accc8a102e1",
    archive: "zip",
    assetSubdir: "",
    entry: "silverc.exe",
    executables: ["silverc.exe"],
    files: {
      "silverc.exe": { sha256: "ce1e0ef5f1f415f371d3d2426e788597a388635da8cbe93e72e95a4f754b29af", size: 6960128 }
    }
  },
  "linux-x64": {
    id: "silverc",
    version: "1.0.0",
    releaseTag: SILVERSCRIPT_RELEASE.releaseTag,
    assetName: "silverc-linux-x86_64.tar.gz",
    url: `${SILVERC_DOWNLOAD}silverc-linux-x86_64.tar.gz`,
    assetSha256: "058ffa17a390526f27280752f864b1bd680217cded14dfc5b7fd168d7e943fb5",
    archive: "tar.gz",
    assetSubdir: "",
    entry: "silverc",
    executables: ["silverc"],
    files: {
      silverc: { sha256: "4d205f9bb095ae6c9027cebdcf748f7ea472f8785b054e94d8124ee7bafb84cc", size: 8707424 }
    }
  }
};

/** The silverc pin for a platform (default: this process's). */
export function getSilvercReference(
  platform: string = process.platform,
  arch: string = process.arch
): ManagedToolchainReference {
  const ref = SILVERC_REFERENCES[`${platform}-${arch}`];
  if (!ref) {
    throw toolchainError(
      "SILVERC_PLATFORM_UNSUPPORTED",
      `no pinned silverc ${SILVERSCRIPT_RELEASE.releaseTag} asset for ${platform}-${arch} ` +
        `(pinned: ${Object.keys(SILVERC_REFERENCES).join(", ")})`
    );
  }
  return ref;
}

/** Schema of the provenance record written next to an installed toolchain. */
export const TOOLCHAIN_INSTALL_SCHEMA = "hardkas.toolchain.install.v1";
export const TOOLCHAIN_INSTALL_RECORD = "toolchain.json";

/** Root for user-level HardKAS state: `$HARDKAS_HOME`, else `~/.hardkas`. */
export function getHardkasHome(): string {
  const fromEnv = process.env.HARDKAS_HOME;
  return fromEnv && fromEnv.trim() !== "" ? path.resolve(fromEnv) : path.join(os.homedir(), ".hardkas");
}

/** Where a managed toolchain is installed: `<home>/toolchains/<id>/<version>`. */
export function getToolchainInstallDir(ref: ManagedToolchainReference, home: string = getHardkasHome()): string {
  return path.join(home, "toolchains", ref.id, ref.version);
}

export interface ToolchainInstallRecord {
  readonly schema: typeof TOOLCHAIN_INSTALL_SCHEMA;
  readonly id: string;
  readonly version: string;
  readonly releaseTag: string;
  readonly assetName: string;
  readonly assetSha256: string;
  readonly source: { readonly kind: "download" | "file"; readonly location: string };
  readonly files: Readonly<Record<string, ManagedToolchainFile>>;
  readonly installer: string;
  readonly installedAt: string;
}

export interface ToolchainVerification {
  readonly ok: boolean;
  readonly installed: boolean;
  readonly dir: string;
  readonly problems: readonly string[];
  readonly record?: ToolchainInstallRecord | undefined;
}

function toolchainError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Checks an installed toolchain against its pin: every pinned file present
 * with the pinned size and digest, nothing else besides the install record,
 * and a record that names this exact release asset.
 */
export async function verifyManagedToolchain(
  ref: ManagedToolchainReference,
  dir: string = getToolchainInstallDir(ref)
): Promise<ToolchainVerification> {
  return verifyManagedToolchainSync(ref, dir);
}

/** Synchronous form of {@link verifyManagedToolchain}, for synchronous loaders. */
export function verifyManagedToolchainSync(
  ref: ManagedToolchainReference,
  dir: string = getToolchainInstallDir(ref)
): ToolchainVerification {
  let entries: string[];
  try {
    entries = fsSync.readdirSync(dir);
  } catch {
    return { ok: false, installed: false, dir, problems: [`not installed at ${dir}`] };
  }

  const problems: string[] = [];
  for (const [name, pin] of Object.entries(ref.files)) {
    try {
      const data = fsSync.readFileSync(path.join(dir, name));
      if (data.length !== pin.size) problems.push(`${name}: size ${data.length}, expected ${pin.size}`);
      else if (sha256Hex(data) !== pin.sha256) problems.push(`${name}: sha256 does not match the pin`);
    } catch {
      problems.push(`${name}: missing`);
    }
  }
  for (const name of entries) {
    if (name !== TOOLCHAIN_INSTALL_RECORD && !(name in ref.files)) problems.push(`${name}: not part of the pinned package`);
  }

  let record: ToolchainInstallRecord | undefined;
  try {
    record = JSON.parse(fsSync.readFileSync(path.join(dir, TOOLCHAIN_INSTALL_RECORD), "utf8"));
    if (record?.schema !== TOOLCHAIN_INSTALL_SCHEMA) problems.push(`${TOOLCHAIN_INSTALL_RECORD}: unknown schema`);
    else if (record.id !== ref.id || record.version !== ref.version || record.assetSha256 !== ref.assetSha256) {
      problems.push(`${TOOLCHAIN_INSTALL_RECORD}: records a different release asset`);
    }
  } catch {
    problems.push(`${TOOLCHAIN_INSTALL_RECORD}: missing or unreadable`);
  }

  return { ok: problems.length === 0, installed: true, dir, problems, record };
}

/**
 * Installs a toolchain from files already extracted from its release asset.
 *
 * Fails closed: the asset digest and every file must match the pin before
 * anything is written. Files are staged next to the target and swapped in with
 * renames, so an interrupted install never leaves a half-written toolchain
 * where the loader looks for it.
 */
export async function installManagedToolchain(
  ref: ManagedToolchainReference,
  input: {
    readonly assetSha256: string;
    readonly files: Readonly<Record<string, Uint8Array>>;
    readonly source: ToolchainInstallRecord["source"];
    readonly installer: string;
    readonly home?: string | undefined;
  }
): Promise<{ dir: string; record: ToolchainInstallRecord }> {
  if (input.assetSha256 !== ref.assetSha256) {
    throw toolchainError(
      "TOOLCHAIN_ASSET_DIGEST_MISMATCH",
      `${ref.assetName} has sha256 ${input.assetSha256}, expected ${ref.assetSha256}`
    );
  }
  const expected = Object.keys(ref.files).sort();
  const received = Object.keys(input.files).sort();
  if (expected.join("\n") !== received.join("\n")) {
    throw toolchainError(
      "TOOLCHAIN_CONTENT_MISMATCH",
      `expected files [${expected.join(", ")}], got [${received.join(", ")}]`
    );
  }
  for (const [name, pin] of Object.entries(ref.files)) {
    const data = input.files[name]!;
    if (data.length !== pin.size || sha256Hex(data) !== pin.sha256) {
      throw toolchainError("TOOLCHAIN_CONTENT_MISMATCH", `${name} does not match the pinned digest`);
    }
  }

  const dir = getToolchainInstallDir(ref, input.home);
  const parent = path.dirname(dir);
  await fs.mkdir(parent, { recursive: true });
  const nonce = `${process.pid}-${Date.now().toString(36)}`;
  const staging = path.join(parent, `.staging-${ref.version}-${nonce}`);
  const previous = path.join(parent, `.previous-${ref.version}-${nonce}`);

  const record: ToolchainInstallRecord = {
    schema: TOOLCHAIN_INSTALL_SCHEMA,
    id: ref.id,
    version: ref.version,
    releaseTag: ref.releaseTag,
    assetName: ref.assetName,
    assetSha256: ref.assetSha256,
    source: input.source,
    files: ref.files,
    installer: input.installer,
    installedAt: new Date().toISOString()
  };

  try {
    await fs.mkdir(staging);
    for (const [name, data] of Object.entries(input.files)) {
      await fs.writeFile(path.join(staging, name), data);
      if (ref.executables?.includes(name)) await fs.chmod(path.join(staging, name), 0o755);
    }
    await fs.writeFile(path.join(staging, TOOLCHAIN_INSTALL_RECORD), JSON.stringify(record, null, 2) + "\n");
    const staged = await verifyManagedToolchain(ref, staging);
    if (!staged.ok) {
      throw toolchainError("TOOLCHAIN_CONTENT_MISMATCH", `staged install failed verification: ${staged.problems.join("; ")}`);
    }

    let hadPrevious = false;
    try {
      await fs.rename(dir, previous);
      hadPrevious = true;
    } catch (e: any) {
      if (e?.code !== "ENOENT") throw e;
    }
    try {
      await fs.rename(staging, dir);
    } catch (e) {
      if (hadPrevious) await fs.rename(previous, dir).catch(() => {});
      throw e;
    }
    if (hadPrevious) await fs.rm(previous, { recursive: true, force: true });
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
  }

  return { dir, record };
}
