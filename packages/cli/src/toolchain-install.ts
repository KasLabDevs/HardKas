import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { ManagedToolchainReference } from "@hardkas/core";
import { HardkasCliError, HardkasExitCode } from "./cli-errors.js";
import { extractPinnedFilesToDir } from "./toolchain-archive.js";

const MAX_ASSET_BYTES = 256 * 1024 * 1024;

export interface ToolchainAssetSource {
  readonly kind: "download" | "file";
  readonly location: string;
}

export interface EnsuredToolchain {
  /** `already-installed`: a verified install of this exact pin was present and nothing was fetched. */
  readonly status: "already-installed" | "installed";
  readonly id: string;
  readonly version: string;
  readonly dir: string;
  readonly assetSha256: string;
  readonly source?: ToolchainAssetSource | undefined;
  readonly record?: unknown;
}

/** SHA-256 and size of a byte stream, written to `dest` when given; refuses more than `maxBytes`. */
async function hashStream(
  source: AsyncIterable<Uint8Array>,
  label: string,
  dest?: string
): Promise<{ sha256: string; size: number }> {
  const hash = createHash("sha256");
  const out = dest ? await fsp.open(dest, "wx") : undefined;
  let size = 0;
  try {
    for await (const chunk of source) {
      size += chunk.length;
      if (size > MAX_ASSET_BYTES) {
        throw new HardkasCliError("TOOLCHAIN_DOWNLOAD_FAILED", `${label} is larger than ${MAX_ASSET_BYTES} bytes`, {
          exitCode: HardkasExitCode.RUNTIME_FAILURE
        });
      }
      hash.update(chunk);
      if (out) await out.write(chunk);
    }
  } finally {
    await out?.close();
  }
  return { sha256: hash.digest("hex"), size };
}

/**
 * L2-EXT stage 3: the release asset is streamed to a file under HARDKAS_HOME while it is hashed (it was read whole
 * into memory: Foundry's asset is ~120 MB). The caller compares the digest with the pin before anything is extracted.
 */
async function downloadAsset(url: string, dest: string): Promise<{ sha256: string; size: number }> {
  let response: Response;
  try {
    response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10 * 60 * 1000) });
  } catch (e: any) {
    throw new HardkasCliError("TOOLCHAIN_DOWNLOAD_FAILED", `could not download ${url}: ${e?.cause?.message ?? e?.message ?? String(e)}`, {
      exitCode: HardkasExitCode.RUNTIME_FAILURE
    });
  }
  if (!response.ok || !response.body) {
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
  try {
    return await hashStream(Readable.fromWeb(response.body as any), url, dest);
  } catch (e: any) {
    if (e instanceof HardkasCliError) throw e;
    throw new HardkasCliError("TOOLCHAIN_DOWNLOAD_FAILED", `download of ${url} failed: ${e?.message ?? String(e)}`, {
      exitCode: HardkasExitCode.RUNTIME_FAILURE
    });
  }
}

/**
 * Leaves exactly the pinned toolchain installed and verified, or throws.
 *
 * A verified install of the same pin is reused as is. Otherwise the official
 * release asset (downloaded, or read from `fromFile`) must match the pinned
 * digest before anything is extracted, and the installed files must match the
 * pin afterwards. Another installed version never counts: the pin decides.
 *
 * L2-EXT stage 3: every step streams (download to a file, hash, extraction file by file into a staging directory), so
 * memory stays flat whatever the asset size; a download that does not match is deleted, and nothing is extracted.
 */
export async function ensureManagedToolchain(
  ref: ManagedToolchainReference,
  options: {
    readonly fromFile?: string | undefined;
    readonly force?: boolean | undefined;
    /** Called right before the asset is read or downloaded. */
    readonly onFetch?: ((source: ToolchainAssetSource) => void) | undefined;
  } = {}
): Promise<EnsuredToolchain> {
  const { verifyManagedToolchain, createToolchainStaging, finalizeManagedToolchainInstall, getToolchainInstallDir, getHardkasHome } =
    await import("@hardkas/core");
  const { HARDKAS_VERSION } = await import("@hardkas/artifacts");

  const existing = await verifyManagedToolchain(ref);
  if (existing.ok && !options.force) {
    return { status: "already-installed", id: ref.id, version: ref.version, dir: existing.dir, assetSha256: ref.assetSha256 };
  }

  // 1. Obtain the release asset as a file on disk, hashing it on the way.
  const source: ToolchainAssetSource = options.fromFile
    ? { kind: "file", location: path.resolve(options.fromFile) }
    : { kind: "download", location: ref.url };
  options.onFetch?.(source);
  let assetFile: string;
  let downloaded: string | undefined;
  let assetSha256: string;
  if (source.kind === "file") {
    assetFile = source.location;
    let stream: fs.ReadStream;
    try {
      await fsp.access(assetFile);
      stream = fs.createReadStream(assetFile);
    } catch (e: any) {
      throw new HardkasCliError("TOOLCHAIN_ASSET_NOT_FOUND", `cannot read ${assetFile}: ${e?.message ?? String(e)}`, {
        exitCode: HardkasExitCode.USAGE_ERROR
      });
    }
    assetSha256 = (await hashStream(stream, assetFile)).sha256;
  } else {
    const downloads = path.join(getHardkasHome(), "toolchains", ".downloads");
    await fsp.mkdir(downloads, { recursive: true });
    downloaded = path.join(downloads, `${ref.assetName}.${process.pid}-${Date.now().toString(36)}.partial`);
    assetFile = downloaded;
    try {
      assetSha256 = (await downloadAsset(ref.url, downloaded)).sha256;
    } catch (e) {
      await fsp.rm(downloaded, { force: true }).catch(() => {});
      throw e;
    }
  }

  try {
    // 2. The asset must be exactly the pinned release before anything is extracted.
    if (assetSha256 !== ref.assetSha256) {
      throw new HardkasCliError(
        "TOOLCHAIN_ASSET_DIGEST_MISMATCH",
        `${ref.assetName}: sha256 ${assetSha256}, expected ${ref.assetSha256}. Nothing was installed.`,
        { exitCode: HardkasExitCode.CORRUPTION_DETECTED }
      );
    }

    // 3. Extract only the pinned file names, streaming, into a staging directory next to the install directory.
    //    Entry names are matched exactly and files are written under our own names, so an entry cannot choose its path.
    const staging = await createToolchainStaging(ref);
    try {
      await extractPinnedFilesToDir(ref, assetFile, staging);
    } catch (e) {
      await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
      throw e;
    }

    // 4-6. Content check against the pin, atomic install, provenance record (in core).
    const { dir, record } = await finalizeManagedToolchainInstall(ref, {
      assetSha256,
      stagingDir: staging,
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

    return { status: "installed", id: ref.id, version: ref.version, dir, assetSha256, source, record };
  } finally {
    if (downloaded) await fsp.rm(downloaded, { force: true }).catch(() => {});
  }
}
