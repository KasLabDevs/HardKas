import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { ManagedToolchainReference } from "@hardkas/core";
import { ensureManagedToolchain } from "../src/toolchain-install.js";
import { buildHardkasProgram } from "../src/program.js";
import { KNOWN_EXTENSIONS } from "../src/extensions/api.js";
import type { ExtensionRegistry } from "../src/extensions/registry.js";

// L2-EXT stage 3 · the toolchain manager streams (download to a file, hash, extraction file by file) and fails closed:
// the asset digest is checked before anything is extracted, every file against its pin while it is written, and a
// failure leaves nothing installed, staged or downloaded. Synthetic assets and a loopback server: no real network.

const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

function makeZip(entries: { name: string; data: Buffer; method?: 0 | 8; flags?: number }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const method = e.method ?? 8;
    const comp = method === 8 ? zlib.deflateRawSync(e.data) : e.data;
    const name = Buffer.from(e.name, "utf8");
    const crc = zlib.crc32 ? zlib.crc32(e.data) : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(e.flags ?? 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(e.flags ?? 0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

function makeTarGz(entries: { name: string; data: Buffer; type?: string }[]): Buffer {
  const blocks: Buffer[] = [];
  for (const e of entries) {
    const h = Buffer.alloc(512);
    h.write(e.name, 0, 100, "utf8");
    h.write("0000755\0", 100, 8, "ascii");
    h.write(e.data.length.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
    h.write(e.type ?? "0", 156, 1, "ascii");
    h.write("ustar\0" + "00", 257, 8, "ascii");
    h.fill(" ", 148, 156);
    let s = 0;
    for (const b of h) s += b;
    h.write(s.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
    blocks.push(h, e.data, Buffer.alloc((512 - (e.data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks));
}

// two pinned files (one large enough to cross many chunks), plus entries that must never be written
const TOOL = crypto.randomBytes(3 * 1024 * 1024 + 123);
const LIB = Buffer.from("library payload\n");
const EXTRA = [
  { name: "README.md", data: Buffer.from("not pinned") },
  { name: "../escape.txt", data: Buffer.from("traversal attempt") },
  { name: "nested/tool.bin", data: Buffer.from("same base name, other path") }
];
const pinFiles = { "tool.bin": { sha256: sha(TOOL), size: TOOL.length }, "lib.txt": { sha256: sha(LIB), size: LIB.length } };

let root: string;
let server: http.Server;
let base: string;
const served = new Map<string, Buffer>();

function refFor(name: string, asset: Buffer, archive: "zip" | "tar.gz", over: Partial<ManagedToolchainReference> = {}): ManagedToolchainReference {
  served.set(`/${name}`, asset);
  return {
    id: `fake-${name.replace(/\W+/g, "-")}`,
    version: "1.0.0",
    releaseTag: "v1.0.0",
    assetName: name,
    url: `${base}/${name}`,
    assetSha256: sha(asset),
    archive,
    assetSubdir: "",
    entry: "tool.bin",
    executables: ["tool.bin"],
    files: pinFiles,
    ...over
  };
}
const write = (name: string, b: Buffer) => {
  const f = path.join(root, name);
  fs.writeFileSync(f, b);
  return f;
};
const homeDir = () => process.env.HARDKAS_HOME!;
const leftovers = (ref: ManagedToolchainReference) => {
  const parent = path.join(homeDir(), "toolchains", ref.id);
  const downloads = path.join(homeDir(), "toolchains", ".downloads");
  return {
    installed: fs.existsSync(path.join(parent, ref.version)),
    staging: fs.existsSync(parent) ? fs.readdirSync(parent).filter((n) => n.startsWith(".staging")) : [],
    downloads: fs.existsSync(downloads) ? fs.readdirSync(downloads) : []
  };
};

let prevHome: string | undefined;
beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tc-stream-"));
  prevHome = process.env.HARDKAS_HOME;
  server = http.createServer((req, res) => {
    const body = served.get(req.url ?? "");
    if (!body) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader("content-length", String(body.length));
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  if (prevHome === undefined) delete process.env.HARDKAS_HOME;
  else process.env.HARDKAS_HOME = prevHome;
  fs.rmSync(root, { recursive: true, force: true });
});
beforeEach(() => {
  process.env.HARDKAS_HOME = fs.mkdtempSync(path.join(root, "home-"));
});

describe("L2-EXT stage 3 · streaming toolchain install", () => {
  for (const archive of ["zip", "tar.gz"] as const) {
    const asset = () =>
      archive === "zip"
        ? makeZip([{ name: "tool.bin", data: TOOL }, { name: "lib.txt", data: LIB, method: 0 }, ...EXTRA])
        : makeTarGz([{ name: "tool.bin", data: TOOL }, { name: "lib.txt", data: LIB }, ...EXTRA]);

    it(`${archive} from a file: exactly the pinned files installed and verified; other entries never written`, async () => {
      const a = asset();
      const ref = refFor(`ok-file.${archive}`, a, archive);
      const r = await ensureManagedToolchain(ref, { fromFile: write(`ok-file.${archive}`, a) });
      expect(r.status).toBe("installed");
      expect(fs.readdirSync(r.dir).sort()).toEqual(["lib.txt", "tool.bin", "toolchain.json"]);
      expect(sha(fs.readFileSync(path.join(r.dir, "tool.bin")))).toBe(pinFiles["tool.bin"].sha256);
      expect(fs.existsSync(path.join(homeDir(), "toolchains", "escape.txt"))).toBe(false);
      expect(fs.existsSync(path.join(root, "escape.txt"))).toBe(false);
      expect(leftovers(ref)).toEqual({ installed: true, staging: [], downloads: [] });
      expect((await ensureManagedToolchain(ref, { fromFile: write(`ok-file.${archive}`, a) })).status).toBe("already-installed");
    });

    it(`${archive} downloaded (loopback): streamed to a file under HARDKAS_HOME, verified, then the download is removed`, async () => {
      const ref = refFor(`ok-dl.${archive}`, asset(), archive);
      const seen: string[] = [];
      const r = await ensureManagedToolchain(ref, { onFetch: (s) => seen.push(s.kind) });
      expect({ status: r.status, seen }).toEqual({ status: "installed", seen: ["download"] });
      expect(leftovers(ref)).toEqual({ installed: true, staging: [], downloads: [] });
    });

    it(`${archive} with one byte changed: TOOLCHAIN_ASSET_DIGEST_MISMATCH before extraction; nothing installed, staged or kept`, async () => {
      const a = asset();
      const ref = refFor(`tampered.${archive}`, a, archive);
      const t = Buffer.from(a);
      t[Math.floor(t.length / 2)] ^= 0x01;
      served.set(`/tampered.${archive}`, t);
      for (const opts of [{ fromFile: write(`tampered.${archive}`, t) }, {}]) {
        await expect(ensureManagedToolchain(ref, opts)).rejects.toMatchObject({ code: "TOOLCHAIN_ASSET_DIGEST_MISMATCH" });
        expect(leftovers(ref)).toEqual({ installed: false, staging: [], downloads: [] });
      }
    });

    it(`${archive} whose file differs from its pin (asset digest pinned as is): TOOLCHAIN_CONTENT_MISMATCH, nothing installed`, async () => {
      const a = asset();
      const ref = refFor(`badfile.${archive}`, a, archive, {
        files: { ...pinFiles, "tool.bin": { sha256: "0".repeat(64), size: TOOL.length } }
      });
      await expect(ensureManagedToolchain(ref, { fromFile: write(`badfile.${archive}`, a) })).rejects.toMatchObject({ code: "TOOLCHAIN_CONTENT_MISMATCH" });
      expect(leftovers(ref)).toEqual({ installed: false, staging: [], downloads: [] });
    });

    it(`${archive} with a file larger than its pin: cut off as TOOLCHAIN_CONTENT_MISMATCH`, async () => {
      const a = asset();
      const ref = refFor(`bigger.${archive}`, a, archive, { files: { ...pinFiles, "tool.bin": { sha256: pinFiles["tool.bin"].sha256, size: 1000 } } });
      await expect(ensureManagedToolchain(ref, { fromFile: write(`bigger.${archive}`, a) })).rejects.toMatchObject({ code: "TOOLCHAIN_CONTENT_MISMATCH" });
      expect(leftovers(ref).installed).toBe(false);
    });

    it(`${archive} without a pinned file: TOOLCHAIN_CONTENT_MISMATCH`, async () => {
      const a = archive === "zip" ? makeZip([{ name: "tool.bin", data: TOOL }]) : makeTarGz([{ name: "tool.bin", data: TOOL }]);
      const ref = refFor(`missing.${archive}`, a, archive);
      await expect(ensureManagedToolchain(ref, { fromFile: write(`missing.${archive}`, a) })).rejects.toMatchObject({ code: "TOOLCHAIN_CONTENT_MISMATCH" });
      expect(leftovers(ref)).toEqual({ installed: false, staging: [], downloads: [] });
    });
  }

  it("an encrypted zip entry is refused (TOOLCHAIN_ARCHIVE_UNSUPPORTED)", async () => {
    const a = makeZip([{ name: "tool.bin", data: TOOL, flags: 1 }, { name: "lib.txt", data: LIB }]);
    const ref = refFor("encrypted.zip", a, "zip");
    await expect(ensureManagedToolchain(ref, { fromFile: write("encrypted.zip", a) })).rejects.toMatchObject({ code: "TOOLCHAIN_ARCHIVE_UNSUPPORTED" });
    expect(leftovers(ref).installed).toBe(false);
  });

  it("no network (an unreachable host): TOOLCHAIN_DOWNLOAD_FAILED, and no partial download is left", async () => {
    const ref = { ...refFor("unreachable.zip", makeZip([{ name: "tool.bin", data: TOOL }]), "zip"), url: "http://127.0.0.1:1/unreachable.zip" };
    await expect(ensureManagedToolchain(ref)).rejects.toMatchObject({ code: "TOOLCHAIN_DOWNLOAD_FAILED" });
    expect(leftovers(ref)).toEqual({ installed: false, staging: [], downloads: [] });
  });

  it("an installed file changed afterwards: the verifier reports it (no longer matches the pin)", async () => {
    const a = makeZip([{ name: "tool.bin", data: TOOL }, { name: "lib.txt", data: LIB }]);
    const ref = refFor("drift.zip", a, "zip");
    const r = await ensureManagedToolchain(ref, { fromFile: write("drift.zip", a) });
    // one byte flipped, same size: only the (chunked) digest can see it
    const target = path.join(r.dir, "tool.bin");
    const data = fs.readFileSync(target);
    data[data.length - 7] ^= 0x01;
    fs.writeFileSync(target, data);
    const { verifyManagedToolchain } = await import("@hardkas/core");
    const v = await verifyManagedToolchain(ref);
    expect({ ok: v.ok, problems: v.problems }).toEqual({ ok: false, problems: ["tool.bin: sha256 does not match the pin"] });
  });

  it("the extractor itself refuses a file that does not match its pin (not only the final verification)", async () => {
    const { extractPinnedFilesToDir } = await import("../src/toolchain-archive.js");
    for (const archive of ["zip", "tar.gz"] as const) {
      const a = archive === "zip" ? makeZip([{ name: "tool.bin", data: TOOL }]) : makeTarGz([{ name: "tool.bin", data: TOOL }]);
      const file = write(`direct.${archive}`, a);
      const dest = fs.mkdtempSync(path.join(root, "direct-"));
      const ref = { archive, assetSubdir: "", files: { "tool.bin": { sha256: "f".repeat(64), size: TOOL.length } } };
      await expect(extractPinnedFilesToDir(ref, file, dest)).rejects.toMatchObject({ code: "TOOLCHAIN_CONTENT_MISMATCH" });
    }
  });
});

// L2-EXT stage 5 · a release asset that is the program itself (solc): one pinned file, whose digest is the asset's
describe("L2-EXT stage 5 · single-binary toolchain assets", () => {
  const binRef = (name: string, asset: Buffer, over: Partial<ManagedToolchainReference> = {}) =>
    refFor(name, asset, "zip", { archive: "binary", entry: "tool.bin", executables: ["tool.bin"], files: { "tool.bin": { sha256: sha(asset), size: asset.length } }, ...over });

  it("from a file: installed under its one pinned name, verified; nothing else in the install directory", async () => {
    const ref = binRef("solc-like.exe", TOOL);
    const r = await ensureManagedToolchain(ref, { fromFile: write("solc-like.exe", TOOL) });
    expect(r.status).toBe("installed");
    expect(fs.readdirSync(r.dir).sort()).toEqual(["tool.bin", "toolchain.json"]);
    expect(sha(fs.readFileSync(path.join(r.dir, "tool.bin")))).toBe(sha(TOOL));
    expect(leftovers(ref)).toEqual({ installed: true, staging: [], downloads: [] });
  });

  it("downloaded (loopback): streamed, verified, the download removed", async () => {
    const ref = binRef("solc-dl.exe", TOOL);
    expect((await ensureManagedToolchain(ref)).status).toBe("installed");
    expect(leftovers(ref)).toEqual({ installed: true, staging: [], downloads: [] });
  });

  it("one byte changed (file or download): TOOLCHAIN_ASSET_DIGEST_MISMATCH before anything is written; nothing kept", async () => {
    const ref = binRef("solc-tampered.exe", TOOL);
    const t = Buffer.from(TOOL);
    t[12345] ^= 0x01;
    served.set("/solc-tampered.exe", t);
    for (const opts of [{ fromFile: write("solc-tampered.exe", t) }, {}]) {
      await expect(ensureManagedToolchain(ref, opts)).rejects.toMatchObject({ code: "TOOLCHAIN_ASSET_DIGEST_MISMATCH" });
      expect(leftovers(ref)).toEqual({ installed: false, staging: [], downloads: [] });
    }
  });

  it("the copy itself checks the pin (size and digest), not only the final verification", async () => {
    const { extractPinnedFilesToDir } = await import("../src/toolchain-archive.js");
    const file = write("direct.exe", TOOL);
    for (const pin of [{ sha256: "f".repeat(64), size: TOOL.length }, { sha256: sha(TOOL), size: 1000 }]) {
      const dest = fs.mkdtempSync(path.join(root, "direct-bin-"));
      await expect(extractPinnedFilesToDir({ archive: "binary", assetSubdir: "", files: { "tool.bin": pin } }, file, dest)).rejects.toMatchObject({
        code: "TOOLCHAIN_CONTENT_MISMATCH"
      });
    }
  });

  it("a binary pin must name exactly one file (TOOLCHAIN_ARCHIVE_INVALID)", async () => {
    const { extractPinnedFilesToDir } = await import("../src/toolchain-archive.js");
    const dest = fs.mkdtempSync(path.join(root, "two-bin-"));
    await expect(extractPinnedFilesToDir({ archive: "binary", assetSubdir: "", files: pinFiles }, write("two.exe", TOOL), dest)).rejects.toMatchObject({
      code: "TOOLCHAIN_ARCHIVE_INVALID"
    });
  });
});

describe("L2-EXT stage 3 · `hardkas toolchain` and extension toolchains", () => {
  const known = KNOWN_EXTENSIONS.find((k) => k.id === "l2")!;
  const registryWith = (toolchains: () => ManagedToolchainReference[]): ExtensionRegistry => {
    const extension = { apiVersion: 1 as const, id: "l2", toolchains };
    const context = { cliVersion: "x", workspaceRoot: root, loadedConfig: undefined };
    return { states: [{ status: "loaded", known, version: "x", packageDir: root, extension }], loaded: [{ known, version: "x", packageDir: root, extension, context }] };
  };

  it("`toolchain install foundry` without the l2 extension: EXTENSION_NOT_INSTALLED (nothing fetched)", async () => {
    await expect(buildHardkasProgram().parseAsync(["toolchain", "install", "foundry"], { from: "user" })).rejects.toMatchObject({
      code: "EXTENSION_NOT_INSTALLED"
    });
    expect(fs.existsSync(path.join(homeDir(), "toolchains"))).toBe(false);
  });

  it("with the extension loaded but no pin for this platform: TOOLCHAIN_PLATFORM_UNSUPPORTED (nothing fetched)", async () => {
    const program = buildHardkasProgram({ extensions: registryWith(() => []) });
    await expect(program.parseAsync(["toolchain", "install", "foundry"], { from: "user" })).rejects.toMatchObject({
      code: "TOOLCHAIN_PLATFORM_UNSUPPORTED"
    });
    expect(fs.existsSync(path.join(homeDir(), "toolchains"))).toBe(false);
  });

  it("an extension pin is installed by the same manager (from a file)", async () => {
    const a = makeZip([{ name: "tool.bin", data: TOOL }, { name: "lib.txt", data: LIB }]);
    const ref = { ...refFor("ext-pin.zip", a, "zip"), id: "foundry" };
    const program = buildHardkasProgram({ extensions: registryWith(() => [ref]) });
    await program.parseAsync(["toolchain", "install", "foundry", "--from-file", write("ext-pin.zip", a), "--json"], { from: "user" });
    const { verifyManagedToolchain } = await import("@hardkas/core");
    expect((await verifyManagedToolchain(ref)).ok).toBe(true);
  });

  it("an extension pin with a core toolchain's id is refused (pinned twice)", async () => {
    const program = buildHardkasProgram({
      extensions: registryWith(() => [{ ...refFor("dup.zip", makeZip([]), "zip"), id: "kaspa-wasm" }])
    });
    await expect(program.parseAsync(["toolchain", "status", "--json"], { from: "user" })).rejects.toThrow(/pinned twice/);
  });
});
