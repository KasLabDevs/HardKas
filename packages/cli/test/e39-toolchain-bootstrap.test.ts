import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { strToU8, zipSync } from "fflate";
import {
  KASPA_WASM_REFERENCE,
  getToolchainInstallDir,
  verifyManagedToolchainSync,
  type ManagedToolchainReference
} from "@hardkas/core";
import { ensureManagedToolchain } from "../src/toolchain-install.js";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// E39 — on a machine with no HardKAS home, the README's first step failed: the generated test,
// signing and planning load the pinned kaspa-wasm, and nothing installed it. `init` now leaves
// that exact pin installed and verified, or stops with an error that names the fix. Another
// installed version never stands in for the pin.

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/** A tiny release asset with the same shape as the real one: pinned files under a subdirectory, plus one that is not pinned. */
function fakeRelease(version: string): { ref: ManagedToolchainReference; asset: Uint8Array } {
  const files: Record<string, Uint8Array> = {
    "index.js": strToU8(`module.exports = { version: "${version}" };\n`),
    LICENSE: strToU8("ISC\n")
  };
  const asset = zipSync({ "pkg/index.js": files["index.js"]!, "pkg/LICENSE": files.LICENSE!, "pkg/README.md": strToU8("not pinned\n") });
  return {
    asset,
    ref: {
      id: "e39-fake-sdk",
      version,
      releaseTag: `v${version}`,
      assetName: `e39-fake-sdk-v${version}.zip`,
      url: `https://example.invalid/e39-fake-sdk-v${version}.zip`,
      assetSha256: sha256(asset),
      archive: "zip",
      assetSubdir: "pkg/",
      entry: "index.js",
      files: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, { sha256: sha256(data), size: data.length }]))
    }
  };
}

describe("E39 · ensureManagedToolchain leaves exactly the pin installed", () => {
  let home: string;
  let assets: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.HARDKAS_HOME;
    home = fs.mkdtempSync(path.join(os.tmpdir(), "hk-e39-home-"));
    assets = fs.mkdtempSync(path.join(os.tmpdir(), "hk-e39-assets-"));
    process.env.HARDKAS_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.HARDKAS_HOME;
    else process.env.HARDKAS_HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(assets, { recursive: true, force: true });
  });

  const write = (name: string, data: Uint8Array) => {
    const file = path.join(assets, name);
    fs.writeFileSync(file, data);
    return file;
  };

  it("installs the pinned files of the release asset into an empty home and verifies them", async () => {
    const { ref, asset } = fakeRelease("2.0.0");
    const fetched: string[] = [];
    const result = await ensureManagedToolchain(ref, { fromFile: write(ref.assetName, asset), onFetch: (s) => fetched.push(s.kind) });

    expect(result.status).toBe("installed");
    expect(fetched).toEqual(["file"]);
    expect(result.dir).toBe(getToolchainInstallDir(ref));
    expect(verifyManagedToolchainSync(ref, result.dir).ok).toBe(true);
    // README.md is in the asset but not in the pin, so it is not installed.
    expect(fs.readdirSync(result.dir).sort()).toEqual(["LICENSE", "index.js", "toolchain.json"]);
  });

  it("reuses a verified install of the same pin without reading any asset", async () => {
    const { ref, asset } = fakeRelease("2.0.0");
    await ensureManagedToolchain(ref, { fromFile: write(ref.assetName, asset) });

    const fetched: string[] = [];
    const again = await ensureManagedToolchain(ref, { onFetch: (s) => fetched.push(s.kind) });
    expect(again.status).toBe("already-installed");
    expect(fetched).toEqual([]);
  });

  it("refuses an asset whose SHA-256 is not the pinned one and installs nothing", async () => {
    const { ref } = fakeRelease("2.0.0");
    await expect(ensureManagedToolchain(ref, { fromFile: write("other.zip", strToU8("not the release")) })).rejects.toMatchObject({
      code: "TOOLCHAIN_ASSET_DIGEST_MISMATCH"
    });
    expect(fs.existsSync(getToolchainInstallDir(ref))).toBe(false);
  });

  it("the pin wins: an install of another version is neither reused nor touched", async () => {
    const previous = fakeRelease("1.0.0");
    const current = fakeRelease("2.0.0");
    const previousInstall = await ensureManagedToolchain(previous.ref, { fromFile: write(previous.ref.assetName, previous.asset) });

    const result = await ensureManagedToolchain(current.ref, { fromFile: write(current.ref.assetName, current.asset) });
    expect(result.status).toBe("installed");
    expect(result.dir).not.toBe(previousInstall.dir);
    expect(verifyManagedToolchainSync(current.ref, result.dir).ok).toBe(true);
    expect(verifyManagedToolchainSync(previous.ref, previousInstall.dir).ok).toBe(true);
  });
});

describe("E39 · hardkas init and the pinned kaspa-wasm", () => {
  // The canonical gate runs with a HARDKAS_HOME that holds the pinned kaspa-wasm
  // (scripts/gate-hermetic.mjs --home). No case here touches the network.
  const gateHome = process.env.HARDKAS_HOME;
  const pin = KASPA_WASM_REFERENCE;
  const dirs: string[] = [];
  const tmp = (prefix: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  const hardkas = (cwd: string, home: string, args: string[]) => {
    const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv({ HARDKAS_HOME: home }), encoding: "utf8", timeout: 120_000 });
    return { status: r.status, stdout: r.stdout ?? "", out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
  };

  it("reuses a verified install of the pin and says so", () => {
    const source = getToolchainInstallDir(pin, gateHome);
    expect(verifyManagedToolchainSync(pin, source).ok, `the gate must provide HARDKAS_HOME with kaspa-wasm ${pin.version}`).toBe(true);
    const home = tmp("hk-e39-init-home-");
    fs.cpSync(source, getToolchainInstallDir(pin, home), { recursive: true });

    const r = hardkas(tmp("hk-e39-init-ws-"), home, ["init", "."]);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain(`kaspa-wasm ${pin.version} already installed and verified at ${getToolchainInstallDir(pin, home)}`);
  });

  it("with --skip-toolchain on an empty home, creates the project and says what is missing and how to install it", () => {
    const home = tmp("hk-e39-init-home-");
    const ws = tmp("hk-e39-init-ws-");
    const r = hardkas(ws, home, ["init", ".", "--skip-toolchain"]);

    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain(`Skipped (--skip-toolchain): kaspa-wasm ${pin.version} is not installed`);
    expect(r.out).toContain("hardkas toolchain install kaspa-wasm");
    expect(fs.existsSync(path.join(ws, "hardkas.config.ts"))).toBe(true);
    expect(fs.existsSync(getToolchainInstallDir(pin, home))).toBe(false);
  });

  it("stops with an error that names the retry command when the install fails, after creating the project", () => {
    const home = tmp("hk-e39-init-home-");
    const ws = tmp("hk-e39-init-ws-");
    const bogus = path.join(tmp("hk-e39-init-asset-"), pin.assetName);
    fs.writeFileSync(bogus, "not the release asset");

    const r = hardkas(ws, home, ["init", ".", "--toolchain-from-file", bogus]);
    expect(r.status, r.out).not.toBe(0);
    expect(r.out).toContain("[TOOLCHAIN_ASSET_DIGEST_MISMATCH]");
    expect(r.out).toContain("The project files were created");
    expect(r.out).toContain("Retry with: hardkas toolchain install kaspa-wasm");
    expect(fs.existsSync(path.join(ws, "hardkas.config.ts"))).toBe(true);
    expect(fs.existsSync(getToolchainInstallDir(pin, home))).toBe(false);
  });

  it("--json reports the toolchain step", () => {
    const r = hardkas(tmp("hk-e39-init-ws-"), tmp("hk-e39-init-home-"), ["init", ".", "--skip-toolchain", "--json"]);
    expect(r.status, r.out).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.result.toolchain).toMatchObject({ id: "kaspa-wasm", version: pin.version, status: "skipped" });
  });

  it("accounts real generate without the pinned SDK names WASM_TOOLCHAIN_NOT_INSTALLED and the install command", () => {
    const home = tmp("hk-e39-init-home-");
    const ws = tmp("hk-e39-init-ws-");
    expect(hardkas(ws, home, ["init", ".", "--skip-toolchain"]).status).toBe(0);

    const r = hardkas(ws, home, ["accounts", "real", "generate", "--name", "ana", "--unsafe-plaintext", "--yes"]);
    expect(r.status, r.out).not.toBe(0);
    expect(r.out).toContain("WASM_TOOLCHAIN_NOT_INSTALLED");
    expect(r.out).toContain("hardkas toolchain install kaspa-wasm");
    expect(r.out).not.toContain("WALLET_BACKEND_UNAVAILABLE");
    expect(r.out).not.toContain("accounts real import");
  });
});
