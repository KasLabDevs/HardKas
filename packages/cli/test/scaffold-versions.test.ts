import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  hardkasCliVersion,
  hardkasScaffoldDependencySpec,
  isFloatingDistTag,
  coerceHardkasDependencyVersions,
  SCAFFOLD_VERSION_PLACEHOLDER
} from "../src/lib/scaffold-versions.js";

const CLI_PKG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json"
);
const CLI_PKG_DIR = path.dirname(CLI_PKG_PATH);
const CLI_DEV_ENTRY = path.join(CLI_PKG_DIR, "src", "index.ts");
const HARDKAS_TAG_SET = ["latest", "next", "rc", "alpha", "beta", "canary", "dev", "stable", "current"];

/**
 * Run `hardkas init <tmpDir>` from the HardKAS repo root (so `tsx` resolves).
 * Passing an absolute path as the positional name makes init operate against
 * the temp dir without inheriting its cwd's node resolution.
 */
function runHardkasInit(tmpDirAbs: string): void {
  execSync(
    `node --import tsx "${CLI_DEV_ENTRY}" init "${tmpDirAbs}" --template basic --network simulated --accounts 3 --json`,
    { cwd: CLI_PKG_DIR, stdio: "pipe" }
  );
}

async function readJson(p: string): Promise<any> {
  const raw = await fs.readFile(p, "utf-8");
  return JSON.parse(raw);
}

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "hardkas-scaffold-test-"));
}

describe("scaffold-versions — unit", () => {
  it("resolves the CLI's own version from its package.json", async () => {
    const cliPkg = await readJson(CLI_PKG_PATH);
    expect(hardkasCliVersion()).toBe(cliPkg.version);
    expect(hardkasScaffoldDependencySpec()).toBe(cliPkg.version);
  });

  it("returns an exact version, not a floating dist-tag", () => {
    const spec = hardkasScaffoldDependencySpec();
    expect(isFloatingDistTag(spec)).toBe(false);
    for (const tag of HARDKAS_TAG_SET) {
      expect(spec.toLowerCase() === tag).toBe(false);
    }
    // Must look like a semver, not a range or tag.
    expect(spec.startsWith("^") || spec.startsWith("~") || spec.includes("*")).toBe(false);
    expect(spec.length).toBeGreaterThan(0);
  });

  it("classifies every known floating tag", () => {
    for (const tag of HARDKAS_TAG_SET) expect(isFloatingDistTag(tag)).toBe(true);
    // Explicit versions and semver ranges are NOT floating.
    expect(isFloatingDistTag("0.12.0-rc.21")).toBe(false);
    expect(isFloatingDistTag("^0.12.0")).toBe(false);
    expect(isFloatingDistTag("~1.2.3")).toBe(false);
    expect(isFloatingDistTag("")).toBe(false);
  });

  it("coerceHardkasDependencyVersions overwrites @hardkas/* in every dep section, leaves others untouched", () => {
    const cliVersion = hardkasScaffoldDependencySpec();
    const pkg = {
      name: "x",
      dependencies: {
        "@hardkas/sdk": "latest",
        "@hardkas/core": "^0.1.0",
        "@kaspa/core-lib": "^1.6.5",
        "zod": "^3"
      },
      devDependencies: {
        "@hardkas/testing": "alpha",
        "vitest": "^2.0.0"
      },
      peerDependencies: {
        "@hardkas/artifacts": SCAFFOLD_VERSION_PLACEHOLDER
      },
      optionalDependencies: {
        "@hardkas/simulator": "rc"
      }
    };
    coerceHardkasDependencyVersions(pkg);
    expect(pkg.dependencies["@hardkas/sdk"]).toBe(cliVersion);
    expect(pkg.dependencies["@hardkas/core"]).toBe(cliVersion);
    expect(pkg.dependencies["@kaspa/core-lib"]).toBe("^1.6.5");
    expect(pkg.dependencies["zod"]).toBe("^3");
    expect(pkg.devDependencies["@hardkas/testing"]).toBe(cliVersion);
    expect(pkg.devDependencies["vitest"]).toBe("^2.0.0");
    expect(pkg.peerDependencies["@hardkas/artifacts"]).toBe(cliVersion);
    expect(pkg.optionalDependencies["@hardkas/simulator"]).toBe(cliVersion);
  });

  it("coerceHardkasDependencyVersions is safe on pkgs with missing sections", () => {
    const pkg = { name: "y" };
    expect(() => coerceHardkasDependencyVersions(pkg as any)).not.toThrow();
  });
});

describe("scaffold-versions — static templates", () => {
  it("no template package.json under packages/cli/templates/* contains a floating dist-tag", async () => {
    const templatesRoot = path.resolve(path.dirname(CLI_PKG_PATH), "templates");
    const entries = await fs.readdir(templatesRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgFile = path.join(templatesRoot, entry.name, "package.json");
      try {
        const pkg = await readJson(pkgFile);
        for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
          const deps = pkg[field] || {};
          for (const [key, value] of Object.entries(deps)) {
            if (!key.startsWith("@hardkas/")) continue;
            expect(isFloatingDistTag(String(value)), `${entry.name}/package.json ${field}[${key}]`).toBe(false);
          }
        }
      } catch (err: any) {
        if (err.code === "ENOENT") continue;
        throw err;
      }
    }
  });

  it("`create.ts` post-processor produces coherent versions regardless of template on-disk shape", async () => {
    // `create.ts` runs `coerceHardkasDependencyVersions` after copying. Any
    // template pattern (SCAFFOLD_VERSION_PLACEHOLDER, `^X.Y.Z`, exact version,
    // even a stale range) yields the CLI's exact version in the emitted file.
    const cliVersion = hardkasScaffoldDependencySpec();
    const pkg = {
      name: "sample",
      dependencies: {
        "@hardkas/sdk": SCAFFOLD_VERSION_PLACEHOLDER,
        "@hardkas/core": "^0.12.0-rc.21",
        "@hardkas/tx-builder": "latest" // even a floating tag gets normalised
      },
      devDependencies: {
        "@hardkas/testing": "0.99.0-stale"
      }
    };
    coerceHardkasDependencyVersions(pkg);
    for (const value of Object.values(pkg.dependencies)) expect(value).toBe(cliVersion);
    for (const value of Object.values(pkg.devDependencies)) expect(value).toBe(cliVersion);
  });
});

describe("scaffold-versions — end-to-end via `hardkas init`", () => {
  it("generated package.json for `hardkas init` pins @hardkas/* to the CLI's exact version", async () => {
    const dir = await tmpDir();
    // Invoke the CLI in source form via tsx.
    runHardkasInit(dir);
    const pkg = await readJson(path.join(dir, "package.json"));
    const cliVersion = hardkasScaffoldDependencySpec();
    expect(pkg.dependencies["@hardkas/sdk"]).toBe(cliVersion);
    expect(pkg.devDependencies["@hardkas/testing"]).toBe(cliVersion);
    // Belt-and-braces: no floating tag survives anywhere in the generated file.
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      const deps = pkg[field] || {};
      for (const [key, value] of Object.entries(deps)) {
        if (!key.startsWith("@hardkas/")) continue;
        expect(isFloatingDistTag(String(value)), `${field}[${key}]`).toBe(false);
      }
    }
  });

  it("scaffold output HardKAS dep set is deterministic across runs on the same CLI", async () => {
    // The generated `package.json.name` reflects the positional path arg and
    // differs between runs; the coordinated HardKAS dep set does not.
    const dirA = await tmpDir();
    const dirB = await tmpDir();
    runHardkasInit(dirA);
    runHardkasInit(dirB);
    const a = await readJson(path.join(dirA, "package.json"));
    const b = await readJson(path.join(dirB, "package.json"));
    expect(a.dependencies["@hardkas/sdk"]).toBe(b.dependencies["@hardkas/sdk"]);
    expect(a.devDependencies["@hardkas/testing"]).toBe(b.devDependencies["@hardkas/testing"]);
    expect(a.dependencies["@kaspa/core-lib"]).toBe(b.dependencies["@kaspa/core-lib"]);
  });

  it("regression: `latest` never appears in generated @hardkas/* dep values (bug historically observed on rc.21)", async () => {
    const dir = await tmpDir();
    runHardkasInit(dir);
    const pkg = await readJson(path.join(dir, "package.json"));
    const values = [
      ...Object.entries(pkg.dependencies ?? {}),
      ...Object.entries(pkg.devDependencies ?? {})
    ].filter(([k]) => k.startsWith("@hardkas/")).map(([, v]) => String(v));
    for (const v of values) {
      expect(v.toLowerCase() === "latest").toBe(false);
    }
  });
});

describe("scaffold-versions — post-publish coherence property", () => {
  it("`CLI release X -> hardkas init -> generated @hardkas/* deps === X`", async () => {
    // This is the core invariant the qualification defect violated on rc.21.
    // Under this property, an already-published CLI cannot silently generate
    // a different dependency graph as npm dist-tags evolve.
    const cliPkg = await readJson(CLI_PKG_PATH);
    const dir = await tmpDir();
    runHardkasInit(dir);
    const pkg = await readJson(path.join(dir, "package.json"));
    expect(pkg.dependencies["@hardkas/sdk"]).toBe(cliPkg.version);
    expect(pkg.devDependencies["@hardkas/testing"]).toBe(cliPkg.version);
  });
});
