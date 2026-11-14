/**
 * rc2 audit E-10: the local torture bucket ran the CLI from `../../cli/dist/index.js` beside @hardkas/testing, a path
 * only a flat node_modules has; under pnpm's isolated layout `hardkas torture` failed its first case (INIT_FAILED).
 * `torture matrix` and `torture replay` now pass the CLI's own entry to every case (`cliEntry`), resolved by the
 * package's own name (`@hardkas/cli/bin`, Node's self-reference), which holds under any layout. The buckets are
 * replaced here by one that records its context, as in torture-isolation-p20.test.ts: no node, no network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const seen = vi.hoisted(() => ({ ctx: [] as any[] }));

vi.mock("@hardkas/testing", async (importOriginal) => {
  const actual: any = await importOriginal();
  const bucket = {
    name: "e10-records-ctx",
    expectedInvariant: "records the context it is given",
    async run(ctx: any) {
      seen.ctx.push({ ...ctx, prng: undefined });
      return { flow: "record the context", mutation: "none" };
    }
  };
  return { ...actual, getAllTortureBuckets: () => [bucket] };
});

const { runTortureMatrix, runTortureReplay, resolveOwnCliEntry } = await import("../src/runners/torture-runner.js");

const roots: string[] = [];
function tmp(prefix: string) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  roots.push(d);
  return d;
}

describe("rc2 audit E-10 · resolveOwnCliEntry", () => {
  afterEach(() => {
    for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
  });

  it("resolves the CLI's dist/index.js by its own name from a chunk of an installed CLI under pnpm's isolated layout", () => {
    const root = tmp("hk-own-cli-");
    const pkg = path.join(root, "node_modules", ".pnpm", "@hardkas+cli@9.9.9", "node_modules", "@hardkas", "cli");
    fs.mkdirSync(path.join(pkg, "dist"), { recursive: true });
    fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@hardkas/cli", type: "module", exports: { "./bin": "./dist/index.js" } }));
    fs.writeFileSync(path.join(pkg, "dist", "index.js"), "export {};\n");
    fs.writeFileSync(path.join(pkg, "dist", "chunk-TORTURE.js"), "export {};\n");
    expect(resolveOwnCliEntry(pathToFileURL(path.join(pkg, "dist", "chunk-TORTURE.js")).href)).toBe(path.join(pkg, "dist", "index.js"));
  });

  it("is undefined when the CLI's entry is not there (no build): the bucket then looks itself and fails typed", () => {
    const root = tmp("hk-own-cli-");
    const pkg = path.join(root, "node_modules", "@hardkas", "cli");
    fs.mkdirSync(path.join(pkg, "src"), { recursive: true });
    fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@hardkas/cli", type: "module", exports: { "./bin": "./dist/index.js" } }));
    fs.writeFileSync(path.join(pkg, "src", "x.js"), "export {};\n");
    expect(resolveOwnCliEntry(pathToFileURL(path.join(pkg, "src", "x.js")).href)).toBeUndefined();
  });

  it("in this repository, is packages/cli/dist/index.js when the CLI is built", () => {
    const built = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");
    const got = resolveOwnCliEntry();
    if (fs.existsSync(built)) expect(got && fs.realpathSync(got)).toBe(fs.realpathSync(built));
    else expect(got).toBeUndefined();
  });
});

describe("rc2 audit E-10 · torture passes the CLI's own entry to every case", () => {
  let project: string;
  let startedIn: string;
  beforeEach(() => {
    seen.ctx.length = 0;
    startedIn = process.cwd();
    project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-e10-torture-")));
    process.chdir(project);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    process.chdir(startedIn);
    vi.restoreAllMocks();
    fs.rmSync(project, { recursive: true, force: true });
  });

  it("matrix and replay give each case `cliEntry` = resolveOwnCliEntry() (left out when it cannot be resolved)", async () => {
    const own = resolveOwnCliEntry();
    await runTortureMatrix({ iterations: 2, seed: 7 });
    await runTortureReplay({ seed: 7, caseId: "case-001" });
    expect(seen.ctx).toHaveLength(3);
    for (const c of seen.ctx) {
      if (own === undefined) expect(c).not.toHaveProperty("cliEntry");
      else expect(c.cliEntry).toBe(own);
    }
  });
});
