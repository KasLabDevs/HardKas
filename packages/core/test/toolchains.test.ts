import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  KASPA_WASM_REFERENCE,
  KASPAD_REFERENCE_VERSION,
  getToolchainInstallDir,
  installManagedToolchain,
  verifyManagedToolchain,
  TOOLCHAIN_INSTALL_RECORD,
  SILVERSCRIPT_RELEASE,
  SILVERC_REFERENCES,
  getSilvercReference,
  type ManagedToolchainReference
} from "../src/index.js";

const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const bytes = (s: string) => new TextEncoder().encode(s);

const FILES = { "mod.js": bytes("module.exports = 42;\n"), "LICENSE": bytes("ISC\n") };
const ASSET = bytes("pretend release asset");

const REF: ManagedToolchainReference = {
  id: "fake-sdk",
  version: "1.0.0",
  releaseTag: "v1.0.0",
  assetName: "fake-sdk-v1.0.0.zip",
  url: "https://example.invalid/fake-sdk-v1.0.0.zip",
  assetSha256: sha(ASSET),
  archive: "zip",
  assetSubdir: "fake-sdk/",
  entry: "mod.js",
  files: Object.fromEntries(
    Object.entries(FILES).map(([name, data]) => [name, { sha256: sha(data), size: data.length }])
  )
};

describe("managed toolchains", () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-toolchain-"));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  const install = (overrides: Partial<Parameters<typeof installManagedToolchain>[1]> = {}) =>
    installManagedToolchain(REF, {
      assetSha256: REF.assetSha256,
      files: FILES,
      source: { kind: "file", location: "/tmp/fake.zip" },
      installer: "test",
      home,
      ...overrides
    });

  it("pins the WASM SDK of the same release as the reference node", () => {
    expect(KASPA_WASM_REFERENCE.releaseTag).toBe(KASPAD_REFERENCE_VERSION);
    expect(KASPA_WASM_REFERENCE.assetSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(KASPA_WASM_REFERENCE.files[KASPA_WASM_REFERENCE.entry]).toBeDefined();
  });

  it("reports a missing install as not installed", async () => {
    const v = await verifyManagedToolchain(REF, getToolchainInstallDir(REF, home));
    expect(v).toMatchObject({ ok: false, installed: false });
  });

  it("installs, records provenance and verifies", async () => {
    const { dir, record } = await install();
    expect(dir).toBe(getToolchainInstallDir(REF, home));
    expect(record).toMatchObject({ id: "fake-sdk", version: "1.0.0", assetSha256: REF.assetSha256 });
    const v = await verifyManagedToolchain(REF, dir);
    expect(v.problems).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("refuses an asset whose digest is not the pinned one and writes nothing", async () => {
    await expect(install({ assetSha256: sha("something else") })).rejects.toMatchObject({
      code: "TOOLCHAIN_ASSET_DIGEST_MISMATCH"
    });
    expect(existsSync(path.join(home, "toolchains"))).toBe(false);
  });

  it("refuses content that differs from the pin", async () => {
    await expect(
      install({ files: { ...FILES, "mod.js": bytes("module.exports = 'evil';\n") } })
    ).rejects.toMatchObject({ code: "TOOLCHAIN_CONTENT_MISMATCH" });
    await expect(install({ files: { "mod.js": FILES["mod.js"] } })).rejects.toMatchObject({
      code: "TOOLCHAIN_CONTENT_MISMATCH"
    });
    await expect(
      install({ files: { ...FILES, "extra.js": bytes("x") } })
    ).rejects.toMatchObject({ code: "TOOLCHAIN_CONTENT_MISMATCH" });
    expect(existsSync(getToolchainInstallDir(REF, home))).toBe(false);
  });

  it("detects a tampered, extra or missing file after install", async () => {
    const { dir } = await install();

    await fs.writeFile(path.join(dir, "mod.js"), "module.exports = 'evil';\n");
    expect((await verifyManagedToolchain(REF, dir)).problems.join()).toMatch(/mod\.js/);

    await install();
    await fs.writeFile(path.join(dir, "injected.js"), "x");
    expect((await verifyManagedToolchain(REF, dir)).problems.join()).toMatch(/injected\.js/);

    await install();
    await fs.rm(path.join(dir, "LICENSE"));
    expect((await verifyManagedToolchain(REF, dir)).problems.join()).toMatch(/LICENSE: missing/);
  });

  it("rejects an install record for a different release", async () => {
    const { dir } = await install();
    const recordPath = path.join(dir, TOOLCHAIN_INSTALL_RECORD);
    const record = JSON.parse(await fs.readFile(recordPath, "utf8"));
    await fs.writeFile(recordPath, JSON.stringify({ ...record, assetSha256: sha("other") }));
    const v = await verifyManagedToolchain(REF, dir);
    expect(v.ok).toBe(false);
    expect(v.problems.join()).toMatch(/different release asset/);
  });

  it("replaces an existing install and leaves no staging directories", async () => {
    const { dir } = await install();
    await fs.writeFile(path.join(dir, "mod.js"), "tampered");
    await install();
    expect((await verifyManagedToolchain(REF, dir)).ok).toBe(true);
    const siblings = await fs.readdir(path.dirname(dir));
    expect(siblings).toEqual([REF.version]);
  });

  it("keeps a working install when a reinstall is refused", async () => {
    const { dir } = await install();
    await expect(install({ assetSha256: sha("wrong") })).rejects.toThrow();
    expect((await verifyManagedToolchain(REF, dir)).ok).toBe(true);
  });

  it.skipIf(process.platform === "win32")("installs pinned executables with mode 0755", async () => {
    const execRef: ManagedToolchainReference = { ...REF, executables: ["mod.js"] };
    const { dir } = await installManagedToolchain(execRef, {
      assetSha256: REF.assetSha256,
      files: FILES,
      source: { kind: "file", location: "/tmp/fake.zip" },
      installer: "test",
      home
    });
    expect((await fs.stat(path.join(dir, "mod.js"))).mode & 0o777).toBe(0o755);
    expect((await fs.stat(path.join(dir, "LICENSE"))).mode & 0o111).toBe(0);
  });
});

describe("silverc pin", () => {
  it("pins the official v1.0.0 release assets for the supported platforms", () => {
    expect(SILVERSCRIPT_RELEASE).toMatchObject({
      repository: "kaspanet/silverscript",
      releaseTag: "v1.0.0",
      commit: "3ed973335b59269293564805cc2c58a14595ec03",
      languageVersion: "0.1.0",
      abiSchemaVersion: 1
    });
    expect(Object.keys(SILVERC_REFERENCES).sort()).toEqual(["linux-x64", "win32-x64"]);
    for (const ref of Object.values(SILVERC_REFERENCES)) {
      expect(ref.id).toBe("silverc");
      expect(ref.releaseTag).toBe(SILVERSCRIPT_RELEASE.releaseTag);
      expect(ref.url).toBe(`https://github.com/kaspanet/silverscript/releases/download/v1.0.0/${ref.assetName}`);
      expect(ref.assetSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.keys(ref.files)).toEqual([ref.entry]);
      expect(ref.executables).toEqual([ref.entry]);
    }
    expect(SILVERC_REFERENCES["win32-x64"]!.assetSha256).toBe("3e0d660c15a9e7ac90f3960da24d348b076b1891481bfe758db18accc8a102e1");
    expect(SILVERC_REFERENCES["linux-x64"]!.assetSha256).toBe("058ffa17a390526f27280752f864b1bd680217cded14dfc5b7fd168d7e943fb5");
  });

  it("has no silverc for an unpinned platform instead of an unverified one", () => {
    expect(getSilvercReference("win32", "x64").assetName).toBe("silverc-windows-x86_64.zip");
    expect(() => getSilvercReference("darwin", "arm64")).toThrow(expect.objectContaining({ code: "SILVERC_PLATFORM_UNSUPPORTED" }));
  });
});
