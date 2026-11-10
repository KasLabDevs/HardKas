import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCli } from "./first-contact-helpers.js";

// ESCALÓN 3 · P1. Every case runs in its own directory under the OS temp dir (it used to be `<cwd>/.hardkas-test-config`,
// inside the repository). A generated config must load with the real loader, in a directory with no node_modules;
// an existing config is never lost: `--force` keeps a backup, and no backup is ever overwritten.
describe("Config Commands", () => {
  let tempDir: string;
  const cfg = () => path.join(tempDir, "hardkas.config.ts");
  const json = (r: { stdout: string }) => JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
  /** Loads the directory's config through the CLI (the real loader): the path it loaded, or its error. */
  const loads = (dir = tempDir) => {
    const r = runCli(["config", "show", "--json"], dir);
    return r.status === 0 ? json(r).result.path : `FAILED: ${r.stdout}${r.stderr}`;
  };
  const USER_CONFIG = "// the user's config: TN10 endpoint and a syntax error\nexport default { networks: { tn10: { kind: \"kaspa-node\", network: \"testnet-10\", rpcUrl: \"ws://127.0.0.1:17210\" } } ;\n";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-e3-config-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should init a config file that loads with no dependencies installed", () => {
    const r = runCli(["config", "init"], tempDir);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("Created hardkas.config.ts");
    expect(fs.readFileSync(cfg(), "utf8")).not.toMatch(/^import /m);
    expect(loads()).toBe(cfg());
  });

  it("should refuse to overwrite without --force, and change nothing", () => {
    fs.writeFileSync(cfg(), USER_CONFIG);
    const r = runCli(["config", "init", "--json"], tempDir);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("CONFIG_EXISTS");
    expect(fs.readFileSync(cfg(), "utf8")).toBe(USER_CONFIG);
    expect(fs.readdirSync(tempDir)).toEqual(["hardkas.config.ts"]);
  });

  it("init --force keeps the original in a backup, and a second --force never overwrites the first backup", () => {
    fs.writeFileSync(cfg(), USER_CONFIG);
    const first = runCli(["config", "init", "--force", "--json"], tempDir);
    expect(first.status, first.out).toBe(0);
    expect(json(first).result.backup).toBe(`${cfg()}.backup`);
    expect(fs.readFileSync(`${cfg()}.backup`, "utf8")).toBe(USER_CONFIG);
    expect(loads()).toBe(cfg());

    const second = runCli(["config", "init", "--force", "--json"], tempDir);
    expect(second.status, second.out).toBe(0);
    expect(json(second).result.backup).toBe(`${cfg()}.backup.1`);
    expect(fs.readFileSync(`${cfg()}.backup`, "utf8")).toBe(USER_CONFIG);
  });

  it("init never shadows a config of another name, even with --force", () => {
    const mjs = path.join(tempDir, "hardkas.config.mjs");
    fs.writeFileSync(mjs, "export default { networks: {} };\n");
    for (const args of [["config", "init"], ["config", "init", "--force"]]) {
      const r = runCli([...args, "--json"], tempDir);
      expect(r.status).not.toBe(0);
      expect(r.out).toContain("CONFIG_EXISTS");
    }
    expect(fs.existsSync(cfg())).toBe(false);
  });

  it("should repair a missing config file with one that loads", () => {
    const r = runCli(["config", "repair"], tempDir);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("Repaired: Created fresh hardkas.config.ts");
    expect(loads()).toBe(cfg());
  });

  it("should repair an invalid config file by backing it up", () => {
    fs.writeFileSync(cfg(), "invalid typescript content");
    const r = runCli(["config", "repair"], tempDir);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("Repaired: Created fresh");
    expect(fs.readFileSync(`${cfg()}.backup`, "utf8")).toBe("invalid typescript content");
    expect(loads()).toBe(cfg());
  });

  it("repair run twice keeps the original: the second run finds a valid config and changes nothing", () => {
    fs.writeFileSync(cfg(), USER_CONFIG);
    const first = runCli(["config", "repair", "--json"], tempDir);
    expect(first.status, first.out).toBe(0);
    expect(json(first).result).toMatchObject({ status: "repaired_invalid", backup: `${cfg()}.backup` });
    const repaired = fs.readFileSync(cfg(), "utf8");

    const second = runCli(["config", "repair", "--json"], tempDir);
    expect(second.status, second.out).toBe(0);
    expect(json(second).result.status).toBe("valid");
    // Before ESCALÓN 3 the second run overwrote .backup with the template, and the user's config was gone.
    expect(fs.readFileSync(`${cfg()}.backup`, "utf8")).toBe(USER_CONFIG);
    expect(fs.readFileSync(cfg(), "utf8")).toBe(repaired);
    expect(fs.readdirSync(tempDir).sort()).toEqual(["hardkas.config.ts", "hardkas.config.ts.backup"]);
  });

  it("repair never overwrites an existing backup", () => {
    fs.writeFileSync(`${cfg()}.backup`, "an older backup");
    fs.writeFileSync(cfg(), USER_CONFIG);
    const r = runCli(["config", "repair", "--json"], tempDir);
    expect(r.status, r.out).toBe(0);
    expect(json(r).result.backup).toBe(`${cfg()}.backup.1`);
    expect(fs.readFileSync(`${cfg()}.backup`, "utf8")).toBe("an older backup");
    expect(fs.readFileSync(`${cfg()}.backup.1`, "utf8")).toBe(USER_CONFIG);
  });

  it("repair works on the config the loader reads (a .mjs), never writing a .ts that would shadow it", () => {
    const mjs = path.join(tempDir, "hardkas.config.mjs");
    fs.writeFileSync(mjs, "export default { broken: ;\n");
    const r = runCli(["config", "repair", "--json"], tempDir);
    expect(r.status, r.out).toBe(0);
    expect(json(r).result).toMatchObject({ status: "repaired_invalid", path: mjs, backup: `${mjs}.backup` });
    expect(fs.existsSync(cfg())).toBe(false);
    expect(loads()).toBe(mjs);
  });

  it("dev init writes a config that loads, and keeps an existing one of any name untouched", () => {
    fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ name: "e3-dapp", type: "module" }));
    const r = runCli(["dev", "init"], tempDir);
    expect(r.status, r.out).toBe(0);
    expect(fs.readFileSync(cfg(), "utf8")).toContain("sim_developer");
    expect(loads()).toBe(cfg());

    const other = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-e3-devinit-"));
    try {
      fs.writeFileSync(path.join(other, "package.json"), JSON.stringify({ name: "e3-dapp-2" }));
      const mjs = path.join(other, "hardkas.config.mjs");
      fs.writeFileSync(mjs, USER_CONFIG);
      const again = runCli(["dev", "init"], other);
      expect(again.status, again.out).toBe(0);
      expect(again.out).toContain("hardkas.config.mjs already exists; it is kept unchanged");
      expect(fs.readFileSync(mjs, "utf8")).toBe(USER_CONFIG);
      expect(fs.existsSync(path.join(other, "hardkas.config.ts"))).toBe(false);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });
});
