import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { HARDKAS_VERSION } from "@hardkas/artifacts";
import { cliDist, childEnv } from "./first-contact-helpers.js";
import { installCommand, readTarballManifest, vetExtensionTarball } from "../src/commands/extension.js";
import { KNOWN_EXTENSIONS } from "../src/extensions/api.js";

// L2-EXT stage 2 · owner correction C2 for `hardkas extension install`: only the catalog package, at the CLI's exact
// version, install scripts disabled; from a local tarball only with a matching --sha256 and a manifest that is the
// extension and declares no install-time script. Every refusal happens before any package manager runs.

const KNOWN = KNOWN_EXTENSIONS.find((k) => k.id === "l2")!;

/** A minimal npm tarball: gzip(ustar) with the given files under package/. */
function makeTgz(files: Record<string, string>): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const body = Buffer.from(content, "utf8");
    const header = Buffer.alloc(512);
    header.write(`package/${name}`, 0, 100, "utf8");
    header.write("0000644\0", 100, 8, "ascii");
    header.write("0000000\0", 108, 8, "ascii");
    header.write("0000000\0", 116, 8, "ascii");
    header.write(body.length.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
    header.write("00000000000\0", 136, 12, "ascii");
    header.write("0", 156, 1, "ascii");
    header.write("ustar\0" + "00", 257, 8, "ascii");
    header.fill(" ", 148, 156);
    let sum = 0;
    for (const b of header) sum += b;
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks));
}

const manifest = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    name: "@hardkas/ext-l2",
    version: HARDKAS_VERSION,
    hardkas: { extension: { id: "l2", apiVersion: 1, entry: "./dist/extension.js" } },
    ...over
  });
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

let dir: string;
const tgz = (name: string, pkgJson: string) => {
  const file = path.join(dir, `${name}.tgz`);
  fs.writeFileSync(file, makeTgz({ "package.json": pkgJson, "dist/extension.js": "export default {};\n" }));
  return file;
};

function cli(args: string[], cwd: string) {
  const r = spawnSync(process.execPath, [cliDist, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    env: childEnv({ HARDKAS_HOME: path.join(dir, ".home") })
  });
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ext-install-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("L2-EXT · extension install (C2)", () => {
  it("every package manager command disables install scripts and names only the given spec", () => {
    for (const pm of ["npm", "pnpm", "yarn"] as const) {
      const cmd = installCommand(pm, "@hardkas/ext-l2@1.2.3");
      expect(cmd).toContain("--ignore-scripts");
      expect(cmd[cmd.length - 1]).toBe("@hardkas/ext-l2@1.2.3");
    }
  });

  it("in a pnpm workspace root, pnpm gets -w (it refuses to add to the root otherwise); elsewhere it does not", () => {
    expect(installCommand("pnpm", "x.tgz", { pnpmWorkspaceRoot: true })).toEqual(["pnpm", "add", "-D", "-w", "--ignore-scripts", "x.tgz"]);
    expect(installCommand("pnpm", "x.tgz")).toEqual(["pnpm", "add", "-D", "--ignore-scripts", "x.tgz"]);
  });

  it("reads package/package.json from a tarball without extracting it", () => {
    expect(readTarballManifest(makeTgz({ "package.json": manifest() })).name).toBe("@hardkas/ext-l2");
  });

  it("a tarball without --sha256 is refused (usage)", () => {
    const file = tgz("nosha", manifest());
    expect(() => vetExtensionTarball(file, undefined, KNOWN, HARDKAS_VERSION)).toThrow(expect.objectContaining({ code: "EXTENSION_SHA256_REQUIRED", exitCode: 2 }));
    expect(() => vetExtensionTarball(file, "abc", KNOWN, HARDKAS_VERSION)).toThrow(expect.objectContaining({ code: "EXTENSION_SHA256_INVALID" }));
  });

  it("a tarball whose SHA-256 differs is refused (policy) with the expected and found hashes", () => {
    const file = tgz("mismatch", manifest());
    const wrong = "0".repeat(64);
    expect(() => vetExtensionTarball(file, wrong, KNOWN, HARDKAS_VERSION)).toThrow(
      expect.objectContaining({ code: "EXTENSION_SHA256_MISMATCH", exitCode: 3, context: { expected: wrong, found: sha(fs.readFileSync(file)) } })
    );
  });

  it.each([
    ["another package name", manifest({ name: "@evil/ext-l2" })],
    ["another version", manifest({ version: "0.0.1" })],
    ["no l2 extension manifest", manifest({ hardkas: {} })],
    ["a postinstall script", manifest({ scripts: { postinstall: "node evil.js" } })],
    ["a preinstall script", manifest({ scripts: { preinstall: "node evil.js" } })],
    ["a prepare script", manifest({ scripts: { prepare: "node evil.js" } })]
  ])("a tarball with %s is refused even with its correct SHA-256", (name, pkgJson) => {
    const file = tgz(name.replace(/\W+/g, "-"), pkgJson);
    expect(() => vetExtensionTarball(file, sha(fs.readFileSync(file)), KNOWN, HARDKAS_VERSION)).toThrow(
      expect.objectContaining({ code: "EXTENSION_TARBALL_INVALID", exitCode: 3 })
    );
  });

  it("the extension's tarball with its SHA-256 passes the checks", () => {
    const file = tgz("good", manifest());
    expect(vetExtensionTarball(file, sha(fs.readFileSync(file)).toUpperCase(), KNOWN, HARDKAS_VERSION)).toEqual({ sha256: sha(fs.readFileSync(file)) });
  });

  describe("through the CLI (nothing is installed: dry runs and refusals)", () => {
    let project: string;
    beforeAll(() => {
      project = path.join(dir, "project");
      fs.mkdirSync(project);
      fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "p", version: "1.0.0" }));
    });

    it("--dry-run prints the exact command: --ignore-scripts and the absolute tarball path", { timeout: 120_000 }, () => {
      const file = tgz("dry", manifest());
      const r = cli(["extension", "install", "l2", "--from", file, "--sha256", sha(fs.readFileSync(file)), "--dry-run", "--json"], project);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.json.result).toMatchObject({ id: "l2", package: "@hardkas/ext-l2", version: HARDKAS_VERSION, packageManager: "npm", sha256: sha(fs.readFileSync(file)) });
      expect(r.json.result.command).toEqual(["npm", "install", "-D", "--ignore-scripts", file]);
    });

    it("from the registry, the spec is the catalog package at the CLI's exact version", { timeout: 120_000 }, () => {
      const r = cli(["extension", "install", "l2", "--dry-run", "--json"], project);
      expect(r.json.result.command).toEqual(["npm", "install", "-D", "--ignore-scripts", `@hardkas/ext-l2@${HARDKAS_VERSION}`]);
    });

    it("a mismatched --sha256 is refused before any package manager runs (exit 3, no node_modules)", { timeout: 120_000 }, () => {
      const file = tgz("cli-mismatch", manifest());
      const r = cli(["extension", "install", "l2", "--from", file, "--sha256", "f".repeat(64), "--yes", "--json"], project);
      expect({ status: r.status, code: r.json?.code }).toEqual({ status: 3, code: "EXTENSION_SHA256_MISMATCH" });
      expect(fs.existsSync(path.join(project, "node_modules"))).toBe(false);
    });

    it("without --yes and without a terminal, it refuses instead of running the package manager", { timeout: 120_000 }, () => {
      const file = tgz("noyes", manifest());
      const r = cli(["extension", "install", "l2", "--from", file, "--sha256", sha(fs.readFileSync(file)), "--json"], project);
      expect({ status: r.status, code: r.json?.code }).toEqual({ status: 2, code: "EXTENSION_CONFIRMATION_REQUIRED" });
      expect(fs.existsSync(path.join(project, "node_modules"))).toBe(false);
    });

    it("an id outside the catalog is refused (no third-party extensions in v1)", { timeout: 120_000 }, () => {
      const r = cli(["extension", "install", "evil", "--dry-run", "--json"], project);
      expect({ status: r.status, code: r.json?.code }).toEqual({ status: 2, code: "EXTENSION_UNKNOWN" });
    });
  });
});
