import { HardkasCliError, HardkasExitCode } from "./cli-errors.js";

/**
 * Extraction of pinned files from a toolchain release asset.
 *
 * Only the pinned file names are taken, matched exactly and written under the
 * pin's own names, so an archive entry can neither choose its path nor point
 * elsewhere. This is a mechanism, not a trust decision: the asset digest is
 * checked before extraction and every file digest after.
 */

export interface PinnedArchive {
  readonly archive: "zip" | "tar.gz";
  readonly assetSubdir: string;
  readonly files: Readonly<Record<string, unknown>>;
}

/**
 * Regular files of a (gunzipped) ustar archive whose full name is wanted.
 * Links, directories and every other entry type are skipped.
 */
export function readTarEntries(tar: Uint8Array, wanted: ReadonlySet<string>): Record<string, Uint8Array> {
  const text = (from: number, to: number) => Buffer.from(tar.subarray(from, to)).toString("latin1").replace(/\0[\s\S]*$/, "");
  const out: Record<string, Uint8Array> = {};
  for (let off = 0; off + 512 <= tar.length; ) {
    if (tar.subarray(off, off + 512).every((b) => b === 0)) break;
    const name = text(off, off + 100);
    const prefix = text(off + 345, off + 500);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const size = parseInt(text(off + 124, off + 136).trim() || "0", 8);
    const type = text(off + 156, off + 157) || "0";
    if (!Number.isSafeInteger(size) || size < 0 || off + 512 + size > tar.length) {
      throw new HardkasCliError("TOOLCHAIN_ARCHIVE_INVALID", `tar entry '${fullName}' has an invalid size`, {
        exitCode: HardkasExitCode.CORRUPTION_DETECTED
      });
    }
    if (type === "0" && wanted.has(fullName)) out[fullName] = tar.slice(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

/** Exactly the pinned files of a release asset, keyed by their pinned names. */
export async function extractPinnedFiles(ref: PinnedArchive, asset: Uint8Array): Promise<Record<string, Uint8Array>> {
  const wanted = new Map(Object.keys(ref.files).map((name) => [ref.assetSubdir + name, name]));
  const { unzipSync, gunzipSync } = await import("fflate");
  const extracted =
    ref.archive === "zip"
      ? unzipSync(asset, { filter: (entry) => wanted.has(entry.name) })
      : readTarEntries(gunzipSync(asset), new Set(wanted.keys()));
  const files: Record<string, Uint8Array> = {};
  for (const [entryName, data] of Object.entries(extracted)) {
    files[wanted.get(entryName)!] = data;
  }
  return files;
}
