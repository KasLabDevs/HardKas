import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";
import { KNOWN_EXTENSIONS } from "../src/extensions/api.js";

// INT9 · open item of front D and of the consumer rehearsal: `hardkas extension install l2` without --from ran the
// package manager for @hardkas/ext-l2@<version>, which this release does not publish (catalog `published: false`), and
// ended in EXTENSION_PACKAGE_MANAGER_FAILED (a registry 404). It now refuses before any package manager runs, with a
// typed code and the offline way (--from <tgz> --sha256 <hex>). The dry run still prints the plan, now saying the
// package is not published. The package manager is pointed at a closed loopback registry, offline, so even the red run
// cannot reach the network.

let dir: string;
let project: string;

function cli(args: string[]) {
  const r = spawnSync(process.execPath, [cliDist, ...args], {
    cwd: project,
    encoding: "utf8",
    timeout: 120_000,
    env: childEnv({
      HARDKAS_HOME: path.join(dir, ".home"),
      npm_config_offline: "true",
      npm_config_registry: "http://127.0.0.1:9/",
      npm_config_audit: "false",
      npm_config_fund: "false"
    })
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-int9-ext-unpublished-"));
  project = path.join(dir, "project");
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "p", version: "1.0.0" }));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("INT9 · extension install of an extension this release does not publish", () => {
  it("the catalog says l2 is not published (precondition)", () => {
    expect(KNOWN_EXTENSIONS.find((k) => k.id === "l2")?.published).toBe(false);
  });

  it("from the registry, with --yes: EXTENSION_NOT_PUBLISHED (exit 2), no package manager run, no node_modules", { timeout: 120_000 }, () => {
    const r = cli(["extension", "install", "l2", "--yes", "--json"]);
    expect({ status: r.status, code: r.json?.code }, r.stdout + r.stderr).toEqual({ status: 2, code: "EXTENSION_NOT_PUBLISHED" });
    expect(r.stdout + r.stderr).toMatch(/--from/);
    expect(r.stdout + r.stderr).not.toMatch(/EXTENSION_PACKAGE_MANAGER_FAILED/);
    expect(fs.existsSync(path.join(project, "node_modules"))).toBe(false);
  });

  it("the dry run still prints the plan and says the package is not published", { timeout: 120_000 }, () => {
    const r = cli(["extension", "install", "l2", "--dry-run", "--json"]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.json?.result).toMatchObject({ id: "l2", package: "@hardkas/ext-l2", published: false });
  });
});
