import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";
import { DEFAULT_SCAFFOLD_PACKAGE_NAME, scaffoldPackageName } from "../src/lib/scaffold-package-name.js";

// INIT-PACKAGE-NAME (packed-consumer check, 21-nov-2026) · `hardkas init <path>` wrote its argument as the new
// package.json `name`, so `hardkas init C:\work\proj` gave `"name": "C:\\work\\proj"` (and `init .` gave "."), names npm
// does not accept. The name is now the project folder's, made a valid npm package name.

/** npm's rules for a NEW package name (validate-npm-package-name), as the scaffold must meet them. */
const VALID_NPM_NAME = /^(?![._])[a-z0-9_.~-]{1,214}$/;

describe("INIT-PACKAGE-NAME · scaffoldPackageName", () => {
  it.each([
    ["my-app", "my-app"],
    [path.join(os.tmpdir(), "nested", "My App"), "my-app"],
    [path.join(os.tmpdir(), "Proyecto Ñandú (v2)"), "proyecto-and-v2"],
    [".hidden-project", "hidden-project"],
    ["__x__", "x__"],
    ["node_modules", DEFAULT_SCAFFOLD_PACKAGE_NAME],
    ["favicon.ico", DEFAULT_SCAFFOLD_PACKAGE_NAME],
    ["...", DEFAULT_SCAFFOLD_PACKAGE_NAME],
    ["http", "hardkas-http"],
    ["fs", "hardkas-fs"]
  ])("%s → %s", (input, expected) => {
    const name = scaffoldPackageName(input);
    expect(name).toBe(expected);
    expect(name).toMatch(VALID_NPM_NAME);
  });

  it.runIf(process.platform === "win32")("a Windows absolute path: the last folder only", () => {
    expect(scaffoldPackageName("C:\\Users\\someone\\work\\My App")).toBe("my-app");
  });

  it("a very long folder name is cut to npm's 214 characters, never ending in a dash", () => {
    const name = scaffoldPackageName("a".repeat(213) + "-" + "b".repeat(50));
    expect(name.length).toBeLessThanOrEqual(214);
    expect(name).toMatch(VALID_NPM_NAME);
    expect(name.endsWith("-")).toBe(false);
  });
});

describe("INIT-PACKAGE-NAME · hardkas init writes a valid package name", () => {
  const dirs: string[] = [];
  const tmp = (prefix: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });
  const init = (cwd: string, home: string, args: string[]) => {
    const r = spawnSync(process.execPath, [cliDist, "init", ...args, "--skip-toolchain"], {
      cwd,
      env: childEnv({ HARDKAS_HOME: home }),
      encoding: "utf8",
      timeout: 120_000
    });
    return { status: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
  };
  const nameIn = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).name;

  it("an absolute path: the folder's name, not the path", { timeout: 180_000 }, () => {
    const home = tmp("hk-initname-home-");
    const parent = tmp("hk-initname-");
    const target = path.join(parent, "My Kaspa App");
    const r = init(os.tmpdir(), home, [target]);
    expect(r.status, r.out).toBe(0);
    expect(nameIn(target)).toBe("my-kaspa-app");
  });

  it("`init .`: the current folder's name, not \".\"", { timeout: 180_000 }, () => {
    const home = tmp("hk-initname-home-");
    const ws = path.join(tmp("hk-initname-"), "dot-project");
    fs.mkdirSync(ws);
    const r = init(ws, home, ["."]);
    expect(r.status, r.out).toBe(0);
    expect(nameIn(ws)).toBe("dot-project");
  });

  it("no argument: hardkas-project, as before", { timeout: 180_000 }, () => {
    const home = tmp("hk-initname-home-");
    const ws = tmp("hk-initname-");
    const r = init(ws, home, []);
    expect(r.status, r.out).toBe(0);
    expect(nameIn(ws)).toBe(DEFAULT_SCAFFOLD_PACKAGE_NAME);
  });
});
