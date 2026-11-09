import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadExtensions, type ExtensionState } from "../src/extensions/registry.js";
import { buildHardkasProgram } from "../src/program.js";

// L2-EXT stage 2 · the registry's checks (design §3.3, owner correction C2) on real files: a project, its package.json
// and a fake `@hardkas/ext-l2` in node_modules. `importEntry` records whether the entry would have been imported; an
// entry is only imported after every check passed.

const VERSION = "9.9.9-test.1";
let ws: string;
let outside: string;
let imported: string[];

const importEntry = async (url: string) => {
  imported.push(url);
  return import(url);
};

function project(pkg: Record<string, unknown> = { devDependencies: { "@hardkas/ext-l2": VERSION } }) {
  fs.writeFileSync(path.join(ws, "package.json"), JSON.stringify({ name: "p", version: "1.0.0", ...pkg }));
}

function fakeExtension(
  at: string,
  opts: { manifest?: Record<string, unknown>; pkg?: Record<string, unknown>; entrySource?: string; entryFile?: string } = {}
) {
  fs.mkdirSync(path.join(at, "dist"), { recursive: true });
  const entryFile = opts.entryFile ?? "dist/extension.js";
  fs.writeFileSync(
    path.join(at, "package.json"),
    JSON.stringify({
      name: "@hardkas/ext-l2",
      version: VERSION,
      type: "module",
      hardkas: { extension: { id: "l2", apiVersion: 1, entry: `./${entryFile}`, ...opts.manifest } },
      ...opts.pkg
    })
  );
  fs.writeFileSync(
    path.join(at, "dist", "extension.js"),
    opts.entrySource ??
      `export default { apiVersion: 1, id: "l2", registerCommands(p) { p.command("l2").description("fake l2").command("ping").action(() => {}); } };\n`
  );
}

const installed = () => path.join(ws, "node_modules", "@hardkas", "ext-l2");
const load = (config?: Record<string, unknown>) =>
  loadExtensions({
    workspaceRoot: ws,
    loadedConfig: config ? ({ cwd: ws, config } as any) : undefined,
    cliVersion: VERSION,
    importEntry
  });
const l2 = (states: readonly ExtensionState[]) => states.find((s) => s.known.id === "l2")!;

beforeEach(() => {
  // RC1 · R3: the long form of the temp directory. Where TEMP is an 8.3 short name (GitHub's Windows runner:
  // C:\Users\RUNNER~1\...), pathToFileURL writes `~` as %7E and the dynamic import under vitest (vite-node) fails to
  // load that URL ("Failed to load url …%7E1…"), which the registry then reports as load_failed. Node's own loader
  // imports it; the registry is not at fault.
  ws = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "hk-ext-reg-")));
  outside = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "hk-ext-out-")));
  imported = [];
});

afterEach(() => {
  // the junction case links node_modules/@hardkas/ext-l2 to `outside`: remove the link before the trees
  try {
    const st = fs.lstatSync(installed());
    if (st.isSymbolicLink()) fs.unlinkSync(installed());
  } catch {
    /* not a link */
  }
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

describe("L2-EXT · extension registry", () => {
  it("a project that does not declare the package: not_installed, even if node_modules has it; nothing imported", async () => {
    project({});
    fakeExtension(installed());
    const r = await load();
    expect(l2(r.states)).toMatchObject({ status: "not_installed", declared: false });
    expect(r.loaded).toEqual([]);
    expect(imported).toEqual([]);
  });

  it("declared but not installed: not_installed (declared), nothing imported", async () => {
    project();
    const r = await load();
    expect(l2(r.states)).toMatchObject({ status: "not_installed", declared: true });
    expect(imported).toEqual([]);
  });

  it("disabled by hardkas.config (extensions.l2 = false): disabled, nothing imported", async () => {
    project();
    fakeExtension(installed());
    const r = await load({ extensions: { l2: false } });
    expect(l2(r.states).status).toBe("disabled");
    expect(imported).toEqual([]);
  });

  it.each([
    ["another version", { pkg: { version: "0.0.1" } }, "version_mismatch"],
    ["another name", { pkg: { name: "@evil/ext-l2" } }, "name_mismatch"],
    ["another manifest id", { manifest: { id: "other" } }, "manifest_invalid"],
    ["another extension API", { manifest: { apiVersion: 2 } }, "api_version_mismatch"],
    // node_modules/@hardkas/ext-l2/../../../outside.js is <project>/outside.js, which exists: refused for where it is
    ["an entry outside the package", { manifest: { entry: "../../../outside.js" } }, "entry_invalid"]
  ])("%s: incompatible (%s), nothing imported", async (_name, opts, reason) => {
    project();
    fakeExtension(installed(), opts as any);
    fs.writeFileSync(path.join(ws, "outside.js"), "export default {};\n");
    const r = await load();
    expect(l2(r.states)).toMatchObject({ status: "incompatible", reason: reason as string });
    expect(imported).toEqual([]);
  });

  it("a package linked from outside the project's node_modules: incompatible (outside_node_modules), nothing imported", async () => {
    project();
    fakeExtension(outside);
    fs.mkdirSync(path.dirname(installed()), { recursive: true });
    fs.symlinkSync(outside, installed(), "junction");
    const r = await load();
    expect(l2(r.states)).toMatchObject({ status: "incompatible", reason: "outside_node_modules" });
    expect(imported).toEqual([]);
  });

  it("an entry whose export is not this extension: incompatible (entry_invalid), not loaded", async () => {
    project();
    fakeExtension(installed(), { entrySource: `export default { apiVersion: 1, id: "other" };\n` });
    const r = await load();
    expect(l2(r.states)).toMatchObject({ status: "incompatible", reason: "entry_invalid" });
    expect(r.loaded).toEqual([]);
  });

  it("an entry that throws on import: incompatible (load_failed); the core program still builds", async () => {
    project();
    fakeExtension(installed(), { entrySource: `throw new Error("boom at import");\n` });
    const r = await load();
    expect(l2(r.states)).toMatchObject({ status: "incompatible", reason: "load_failed" });
    expect(buildHardkasProgram({ extensions: r }).commands.some((c) => c.name() === "tx")).toBe(true);
  });

  it("every check passes: loaded, the entry imported once, and its commands registered", async () => {
    project();
    fakeExtension(installed());
    const r = await load();
    expect(l2(r.states)).toMatchObject({ status: "loaded", version: VERSION });
    expect(imported).toHaveLength(1);
    const program = buildHardkasProgram({ extensions: r });
    expect(program.commands.find((c) => c.name() === "l2")?.commands.map((c) => c.name())).toEqual(["ping"]);
  });

  it("an incompatible extension's commands answer EXTENSION_INCOMPATIBLE with the expected and found versions", async () => {
    project();
    fakeExtension(installed(), { pkg: { version: "0.0.1" } });
    const program = buildHardkasProgram({ extensions: await load() });
    await expect(program.parseAsync(["l2", "networks"], { from: "user" })).rejects.toMatchObject({
      code: "EXTENSION_INCOMPATIBLE",
      context: expect.objectContaining({ reason: "version_mismatch", expected: VERSION, found: "0.0.1" })
    });
  });

  it("an extension whose registration clashes with a core command is reported incompatible; the core is intact", async () => {
    project();
    fakeExtension(installed(), {
      entrySource: `export default { apiVersion: 1, id: "l2", registerCommands(p) { p.command("l2"); p.command("tx"); } };\n`
    });
    const program = buildHardkasProgram({ extensions: await load() });
    expect(program.commands.filter((c) => c.name() === "tx")).toHaveLength(1);
    await expect(program.parseAsync(["l2"], { from: "user" })).rejects.toMatchObject({
      code: "EXTENSION_INCOMPATIBLE",
      context: expect.objectContaining({ reason: "load_failed" })
    });
  });

  it("a disabled extension's commands answer EXTENSION_DISABLED", async () => {
    project();
    fakeExtension(installed());
    const program = buildHardkasProgram({ extensions: await load({ extensions: { l2: false } }) });
    await expect(program.parseAsync(["l2", "networks"], { from: "user" })).rejects.toMatchObject({ code: "EXTENSION_DISABLED" });
  });
});
