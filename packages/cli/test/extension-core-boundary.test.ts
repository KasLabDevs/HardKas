import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { cliDist, childEnv, repoRoot } from "./first-contact-helpers.js";

// L2-EXT stage 2 · P1/P2 of the extension design, on the built CLI:
//   P1  the core does not depend on, and does not load, @hardkas/l2, viem or @hardkas/ext-l2;
//   P2  without the extension, its commands, template and doctor module answer EXTENSION_NOT_INSTALLED (exit ≠ 0).
// What a run loaded is recorded by test/fixtures/module-recorder.mjs (every resolved module URL).

const RECORDER = path.join(__dirname, "fixtures", "module-recorder.mjs");
const L2_CODE = /\/(packages|@hardkas)\/(l2|ext-l2)\/|\/node_modules\/viem\/|\/\.pnpm\/viem@/;

let ws: string;

function cli(args: string[], name: string) {
  const log = path.join(ws, `${name}.modules.log`);
  const nodeOptions = `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(RECORDER).href}`.trim();
  const r = spawnSync(process.execPath, [cliDist, ...args], {
    cwd: ws,
    encoding: "utf8",
    timeout: 120_000,
    env: childEnv({ HARDKAS_HOME: path.join(ws, ".home"), HARDKAS_MODULE_LOG: log, NODE_OPTIONS: nodeOptions })
  });
  const modules = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((u) => u.replace(/\\/g, "/")) : [];
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", modules };
}

const envelope = (stdout: string) => {
  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
};

beforeAll(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ext-core-"));
  fs.writeFileSync(path.join(ws, "package.json"), JSON.stringify({ name: "core-only", version: "1.0.0", private: true }));
});

afterAll(() => {
  fs.rmSync(ws, { recursive: true, force: true });
});

describe("L2-EXT stage 2 · the core without the l2 extension", () => {
  it("P1 · @hardkas/cli and @hardkas/sdk declare neither @hardkas/l2 nor viem", () => {
    for (const pkg of ["cli", "sdk"]) {
      const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "packages", pkg, "package.json"), "utf8"));
      const deps = { ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies };
      expect(Object.keys(deps).filter((d) => d === "@hardkas/l2" || d === "viem" || d === "@hardkas/ext-l2"), pkg).toEqual([]);
    }
  });

  it("P1 · L1 commands and the refusals load no L2 code (the recorder saw the CLI itself, so it was recording)", { timeout: 300_000 }, () => {
    const runs = {
      help: cli(["--help"], "help"),
      capabilities: cli(["capabilities", "--json"], "capabilities"),
      extensionList: cli(["extension", "list", "--json"], "extension-list"),
      l2: cli(["l2", "networks", "--json"], "l2")
    };
    for (const [name, r] of Object.entries(runs)) {
      expect(r.modules.some((u) => u.includes("/packages/cli/dist/")), `${name}: the recorder saw no CLI module`).toBe(true);
      expect(r.modules.filter((u) => L2_CODE.test(u)), name).toEqual([]);
    }
    expect(runs.help.status).toBe(0);
    // a command line of the help is two spaces and the name (wrapped descriptions are indented much further)
    expect(runs.help.stdout).toMatch(/^ {2}tx\s/m);
    expect(runs.help.stdout).not.toMatch(/^ {2}l2\s/m);
    expect(runs.help.stdout).not.toMatch(/^ {2}local\s/m);
  });

  it.each([
    ["l2 networks", ["l2", "networks", "--json"]],
    ["l2 tx send (a write command)", ["l2", "tx", "send", "signed.json", "--yes", "--json"]],
    ["local wizard", ["local", "wizard", "--json"]],
    ["dev doctor", ["dev", "doctor", "--json"]],
    ["doctor l2", ["doctor", "l2", "--json"]],
    ["create l2-evm", ["create", "l2-evm", "my-l2", "--json"]]
  ])("P2 · `%s` → EXTENSION_NOT_INSTALLED, exit ≠ 0, nothing created", { timeout: 120_000 }, (name, args) => {
    const r = cli(args, name.replace(/\W+/g, "-"));
    const e = envelope(r.stdout);
    expect({ status: r.status, ok: e?.ok, code: e?.code }, r.stdout + r.stderr).toEqual({ status: 1, ok: false, code: "EXTENSION_NOT_INSTALLED" });
    expect(e?.message).toContain("@hardkas/ext-l2");
    expect(fs.existsSync(path.join(ws, "my-l2"))).toBe(false);
  });

  it("P2 · the refusal names HARDKAS_EXPERIMENTAL_L2 when it is set: the variable no longer registers L2 commands", { timeout: 120_000 }, () => {
    const log = path.join(ws, "exp.modules.log");
    const r = spawnSync(process.execPath, [cliDist, "l2", "networks", "--json"], {
      cwd: ws,
      encoding: "utf8",
      timeout: 120_000,
      env: childEnv({ HARDKAS_HOME: path.join(ws, ".home"), HARDKAS_EXPERIMENTAL_L2: "1", HARDKAS_MODULE_LOG: log })
    });
    const e = envelope(r.stdout);
    expect(e?.code).toBe("EXTENSION_NOT_INSTALLED");
    expect(e?.message).toContain("HARDKAS_EXPERIMENTAL_L2");
  });

  it("an existing L1 command is unchanged: `metamask` stays an unknown command (the core never had it registered)", { timeout: 120_000 }, () => {
    const r = cli(["metamask", "network"], "metamask");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("unknown command 'metamask'");
  });
});
