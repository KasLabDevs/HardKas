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
  readonly archive: "zip" | "tar.gz" | "binary";
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// L2-EXT stage 3 · streaming extraction to disk, for assets too large to hold in memory (Foundry: ~120 MB archive,
// ~270 MB of binaries). The asset is a verified file on disk; each pinned entry is decompressed straight into the
// staging directory under its pinned name, its size and SHA-256 checked while it is written (an entry that grows past
// its pinned size is cut off at once), and nothing else is extracted.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PinnedFileDigest {
  readonly sha256: string;
  readonly size: number;
}

export interface PinnedStreamArchive {
  readonly archive: "zip" | "tar.gz" | "binary";
  readonly assetSubdir: string;
  readonly files: Readonly<Record<string, PinnedFileDigest>>;
}

const archiveError = (code: string, message: string) =>
  new HardkasCliError(code, message, { exitCode: HardkasExitCode.CORRUPTION_DETECTED });

/** Writes one pinned file from a byte stream, enforcing its pinned size and digest as it goes. */
async function writePinnedFile(source: AsyncIterable<Buffer | Uint8Array>, dest: string, name: string, pin: PinnedFileDigest): Promise<void> {
  const { createHash } = await import("node:crypto");
  const fs = await import("node:fs/promises");
  const hash = createHash("sha256");
  const fh = await fs.open(dest, "wx");
  let written = 0;
  try {
    for await (const chunk of source) {
      written += chunk.length;
      if (written > pin.size) throw archiveError("TOOLCHAIN_CONTENT_MISMATCH", `${name}: larger than its pinned size ${pin.size}`);
      hash.update(chunk);
      await fh.write(chunk);
    }
  } finally {
    await fh.close();
  }
  if (written !== pin.size) throw archiveError("TOOLCHAIN_CONTENT_MISMATCH", `${name}: size ${written}, expected ${pin.size}`);
  if (hash.digest("hex") !== pin.sha256) throw archiveError("TOOLCHAIN_CONTENT_MISMATCH", `${name}: sha256 does not match the pin`);
}

interface ZipEntry {
  readonly name: string;
  readonly flags: number;
  readonly method: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly localOffset: number;
}

/** The central directory of a zip file on disk (no zip64, no multi-disk: refused rather than guessed). */
async function readZipDirectory(file: string): Promise<ZipEntry[]> {
  const fs = await import("node:fs/promises");
  const fh = await fs.open(file, "r");
  try {
    const { size } = await fh.stat();
    const tailLen = Math.min(size, 0xffff + 22);
    const tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw archiveError("TOOLCHAIN_ARCHIVE_INVALID", "zip: no end-of-central-directory record");
    const disk = tail.readUInt16LE(eocd + 4);
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (disk !== 0 || count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      throw archiveError("TOOLCHAIN_ARCHIVE_UNSUPPORTED", "zip: multi-disk or zip64 archives are not supported");
    }
    if (cdOffset + cdSize > size) throw archiveError("TOOLCHAIN_ARCHIVE_INVALID", "zip: central directory out of range");
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);
    const entries: ZipEntry[] = [];
    for (let off = 0, i = 0; i < count; i++) {
      if (off + 46 > cd.length || cd.readUInt32LE(off) !== 0x02014b50) throw archiveError("TOOLCHAIN_ARCHIVE_INVALID", "zip: corrupt central directory");
      const nameLen = cd.readUInt16LE(off + 28);
      const extraLen = cd.readUInt16LE(off + 30);
      const commentLen = cd.readUInt16LE(off + 32);
      entries.push({
        name: cd.subarray(off + 46, off + 46 + nameLen).toString("utf8"),
        flags: cd.readUInt16LE(off + 8),
        method: cd.readUInt16LE(off + 10),
        compressedSize: cd.readUInt32LE(off + 20),
        size: cd.readUInt32LE(off + 24),
        localOffset: cd.readUInt32LE(off + 42)
      });
      off += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } finally {
    await fh.close();
  }
}

async function extractZipToDir(ref: PinnedStreamArchive, file: string, wanted: Map<string, string>, destDir: string): Promise<Set<string>> {
  const fs = await import("node:fs");
  const fsp = await import("node:fs/promises");
  const zlib = await import("node:zlib");
  const path = await import("node:path");
  const done = new Set<string>();
  for (const entry of await readZipDirectory(file)) {
    const pinName = wanted.get(entry.name);
    if (pinName === undefined) continue;
    if (done.has(pinName)) throw archiveError("TOOLCHAIN_ARCHIVE_INVALID", `zip: '${entry.name}' appears twice`);
    const pin = ref.files[pinName]!;
    if (entry.flags & 0x1) throw archiveError("TOOLCHAIN_ARCHIVE_UNSUPPORTED", `zip: '${entry.name}' is encrypted`);
    if (entry.method !== 0 && entry.method !== 8) throw archiveError("TOOLCHAIN_ARCHIVE_UNSUPPORTED", `zip: '${entry.name}' uses compression method ${entry.method}`);
    if (entry.size !== pin.size) throw archiveError("TOOLCHAIN_CONTENT_MISMATCH", `${pinName}: size ${entry.size}, expected ${pin.size}`);
    const fh = await fsp.open(file, "r");
    const local = Buffer.alloc(30);
    try {
      await fh.read(local, 0, 30, entry.localOffset);
    } finally {
      await fh.close();
    }
    if (local.readUInt32LE(0) !== 0x04034b50) throw archiveError("TOOLCHAIN_ARCHIVE_INVALID", `zip: bad local header for '${entry.name}'`);
    const start = entry.localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
    const raw = fs.createReadStream(file, entry.compressedSize > 0 ? { start, end: start + entry.compressedSize - 1 } : { start, end: start - 1 });
    const body = entry.method === 8 ? raw.pipe(zlib.createInflateRaw()) : raw;
    try {
      await writePinnedFile(body, path.join(destDir, pinName), pinName, pin);
    } finally {
      raw.destroy();
    }
    done.add(pinName);
  }
  return done;
}

async function extractTarGzToDir(ref: PinnedStreamArchive, file: string, wanted: Map<string, string>, destDir: string): Promise<Set<string>> {
  const fs = await import("node:fs");
  const zlib = await import("node:zlib");
  const path = await import("node:path");
  const done = new Set<string>();
  const stream = fs.createReadStream(file).pipe(zlib.createGunzip());
  const it = stream[Symbol.asyncIterator]();
  let buf: Buffer = Buffer.alloc(0);
  let ended = false;
  // fill `buf` to at least n bytes (false at the end of the stream)
  const need = async (n: number): Promise<boolean> => {
    while (buf.length < n && !ended) {
      const r = await it.next();
      if (r.done) ended = true;
      else buf = buf.length === 0 ? (r.value as Buffer) : Buffer.concat([buf, r.value as Buffer]);
    }
    return buf.length >= n;
  };
  // the next `size` bytes of the stream, as chunks
  async function* body(size: number): AsyncGenerator<Buffer> {
    let left = size;
    while (left > 0) {
      if (!(await need(1))) throw archiveError("TOOLCHAIN_ARCHIVE_INVALID", "tar: truncated entry");
      const take = Math.min(left, buf.length);
      yield buf.subarray(0, take);
      buf = buf.subarray(take);
      left -= take;
    }
  }
  const skip = async (n: number) => {
    for await (const _ of body(n)) {
      /* discard */
    }
  };
  try {
    for (;;) {
      if (!(await need(512))) break;
      const header = buf.subarray(0, 512);
      if (header.every((b) => b === 0)) break;
      const text = (from: number, to: number) => header.subarray(from, to).toString("latin1").replace(/\0[\s\S]*$/, "");
      const name = text(0, 100);
      const prefix = text(345, 500);
      const fullName = prefix ? `${prefix}/${name}` : name;
      const size = parseInt(text(124, 136).trim() || "0", 8);
      const type = text(156, 157) || "0";
      if (!Number.isSafeInteger(size) || size < 0) throw archiveError("TOOLCHAIN_ARCHIVE_INVALID", `tar entry '${fullName}' has an invalid size`);
      buf = buf.subarray(512);
      const padded = Math.ceil(size / 512) * 512;
      const pinName = type === "0" ? wanted.get(fullName) : undefined;
      if (pinName !== undefined) {
        if (done.has(pinName)) throw archiveError("TOOLCHAIN_ARCHIVE_INVALID", `tar: '${fullName}' appears twice`);
        const pin = ref.files[pinName]!;
        if (size !== pin.size) throw archiveError("TOOLCHAIN_CONTENT_MISMATCH", `${pinName}: size ${size}, expected ${pin.size}`);
        await writePinnedFile(body(size), path.join(destDir, pinName), pinName, pin);
        await skip(padded - size);
        done.add(pinName);
      } else {
        await skip(padded);
      }
    }
  } finally {
    stream.destroy();
  }
  return done;
}

/**
 * Extracts exactly the pinned files of a verified release asset on disk into `destDir` (which must be empty), each
 * under its pinned name, by streaming. A pinned file that is missing, duplicated, or differs from its pin fails the
 * extraction; entries that are not pinned are never written.
 */
export async function extractPinnedFilesToDir(ref: PinnedStreamArchive, assetFile: string, destDir: string): Promise<void> {
  if (ref.archive === "binary") {
    // L2-EXT stage 5 · the asset is the program itself (solc): copied, by streaming, under its one pinned name
    const names = Object.keys(ref.files);
    if (names.length !== 1) throw archiveError("TOOLCHAIN_ARCHIVE_INVALID", `a binary asset pins exactly one file (pinned: ${names.length})`);
    const fs = await import("node:fs");
    const path = await import("node:path");
    const stream = fs.createReadStream(assetFile);
    try {
      await writePinnedFile(stream, path.join(destDir, names[0]!), names[0]!, ref.files[names[0]!]!);
    } finally {
      stream.destroy();
    }
    return;
  }
  const wanted = new Map(Object.keys(ref.files).map((name) => [ref.assetSubdir + name, name]));
  const done =
    ref.archive === "zip" ? await extractZipToDir(ref, assetFile, wanted, destDir) : await extractTarGzToDir(ref, assetFile, wanted, destDir);
  const missing = Object.keys(ref.files).filter((n) => !done.has(n));
  if (missing.length > 0) throw archiveError("TOOLCHAIN_CONTENT_MISMATCH", `the asset does not contain the pinned file(s): ${missing.join(", ")}`);
}

/** Exactly the pinned files of a release asset, keyed by their pinned names. */
export async function extractPinnedFiles(ref: PinnedArchive, asset: Uint8Array): Promise<Record<string, Uint8Array>> {
  if (ref.archive === "binary") {
    const names = Object.keys(ref.files);
    if (names.length !== 1) throw archiveError("TOOLCHAIN_ARCHIVE_INVALID", `a binary asset pins exactly one file (pinned: ${names.length})`);
    return { [names[0]!]: asset };
  }
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
