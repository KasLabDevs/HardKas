import { describe, it, expect } from "vitest";
import { gzipSync, zipSync } from "fflate";
import { extractPinnedFiles, readTarEntries } from "../src/toolchain-archive.js";

const bytes = (s: string) => new TextEncoder().encode(s);

/** A ustar header + body for one entry (type "0" file, "2" symlink, "5" directory). */
function tarEntry(name: string, body: Uint8Array, type = "0", linkName = ""): Uint8Array {
  const header = new Uint8Array(512);
  const put = (off: number, s: string) => header.set(bytes(s), off);
  put(0, name);
  put(100, "0000755\0");
  put(124, body.length.toString(8).padStart(11, "0") + "\0");
  put(136, "00000000000\0");
  put(156, type);
  put(157, linkName);
  put(257, "ustar\0");
  put(263, "00");
  header.fill(0x20, 148, 156);
  const sum = header.reduce((a, b) => a + b, 0);
  put(148, sum.toString(8).padStart(6, "0") + "\0 ");
  const padded = new Uint8Array(Math.ceil(body.length / 512) * 512);
  padded.set(body);
  const out = new Uint8Array(512 + padded.length);
  out.set(header);
  out.set(padded, 512);
  return out;
}

function tar(...entries: Uint8Array[]): Uint8Array {
  const total = entries.reduce((n, e) => n + e.length, 0) + 1024;
  const out = new Uint8Array(total);
  let off = 0;
  for (const e of entries) {
    out.set(e, off);
    off += e.length;
  }
  return out;
}

const PIN = { archive: "tar.gz" as const, assetSubdir: "", files: { silverc: {} } };

describe("toolchain archive extraction", () => {
  it("takes only the exactly-named regular file from a tar.gz", async () => {
    const archive = gzipSync(
      tar(
        tarEntry("../silverc", bytes("traversal")),
        tarEntry("sub/silverc", bytes("nested")),
        tarEntry("silverc", new Uint8Array(0), "2", "/etc/passwd"),
        tarEntry("silverc", bytes("the real one")),
        tarEntry("extra", bytes("not pinned"))
      )
    );
    const files = await extractPinnedFiles(PIN, archive);
    expect(Object.keys(files)).toEqual(["silverc"]);
    expect(new TextDecoder().decode(files.silverc)).toBe("the real one");
  });

  it("never lets a link or directory entry stand in for a pinned file", async () => {
    const archive = gzipSync(tar(tarEntry("silverc", new Uint8Array(0), "2", "/bin/sh"), tarEntry("silverc", new Uint8Array(0), "5")));
    expect(await extractPinnedFiles(PIN, archive)).toEqual({});
  });

  it("rejects a truncated tar entry", () => {
    const entry = tarEntry("silverc", bytes("x".repeat(600)));
    expect(() => readTarEntries(entry.subarray(0, 700), new Set(["silverc"]))).toThrow(
      expect.objectContaining({ code: "TOOLCHAIN_ARCHIVE_INVALID" })
    );
  });

  it("takes only the exactly-named file from a zip, under its pinned name", async () => {
    const archive = zipSync({
      "../silverc.exe": bytes("traversal"),
      "bin/silverc.exe": bytes("nested"),
      "silverc.exe": bytes("the real one")
    });
    const files = await extractPinnedFiles({ archive: "zip", assetSubdir: "", files: { "silverc.exe": {} } }, archive);
    expect(Object.keys(files)).toEqual(["silverc.exe"]);
    expect(new TextDecoder().decode(files["silverc.exe"])).toBe("the real one");
  });
});
