import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ManagedToolchainReference } from "@hardkas/core";
import { HardkasCliError, HardkasExitCode } from "./cli-errors.js";
import { extractPinnedFiles } from "./toolchain-archive.js";

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

async function fetchAsset(url: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10 * 60 * 1000) });
  } catch (e: any) {
    throw new HardkasCliError("TOOLCHAIN_DOWNLOAD_FAILED", `could not download ${url}: ${e?.cause?.message ?? e?.message ?? String(e)}`, {
      exitCode: HardkasExitCode.RUNTIME_FAILURE
    });
  }
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

/**
 * Leaves exactly the pinned toolchain installed and verified, or throws.
 *
 * A verified install of the same pin is reused as is. Otherwise the official
 * release asset (downloaded, or read from `fromFile`) must match the pinned
 * digest before anything is extracted, and the installed files must match the
 * pin afterwards. Another installed version never counts: the pin decides.
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
  const { verifyManagedToolchain, installManagedToolchain, getToolchainInstallDir } = await import("@hardkas/core");
  const { HARDKAS_VERSION } = await import("@hardkas/artifacts");

  const existing = await verifyManagedToolchain(ref);
  if (existing.ok && !options.force) {
    return { status: "already-installed", id: ref.id, version: ref.version, dir: existing.dir, assetSha256: ref.assetSha256 };
  }

  // 1. Obtain the release asset.
  const source: ToolchainAssetSource = options.fromFile
    ? { kind: "file", location: path.resolve(options.fromFile) }
    : { kind: "download", location: ref.url };
  options.onFetch?.(source);
  const asset = source.kind === "file" ? new Uint8Array(await fs.readFile(source.location)) : await fetchAsset(ref.url);

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

  return { status: "installed", id: ref.id, version: ref.version, dir, assetSha256, source, record };
}
