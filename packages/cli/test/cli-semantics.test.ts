import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("CLI Semantic Constraints", () => {
  let tmpDir: string;
  let bin: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-semantic-"));
    fs.writeFileSync(
      path.join(tmpDir, "hardkas.config.js"),
      `
      module.exports = { default: { network: "simulated" } };
    `
    );
    bin = path.resolve(__dirname, "../dist/index.js");
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  function run(args: string[]): { stdout: string; stderr: string; status: number } {
    try {
      const output = execSync(`node ${bin} ${args.join(" ")}`, {
        cwd: tmpDir,
        encoding: "utf-8",
        stdio: "pipe"
      });
      return { stdout: output, stderr: "", status: 0 };
    } catch (e: unknown) {
      return {
        stdout: ((e as any).stdout)?.toString() || "",
        stderr: ((e as any).stderr)?.toString() || "",
        status: e.status || 1
      };
    }
  }

  it("fails deterministically on unknown flags with exit code 2 and no raw stack trace", () => {
    const res = run(["doctor", "--invalid-flag-that-does-not-exist"]);
    expect(res.status).toBe(1);
    expect(res.stderr).not.toContain("Error:");
    expect(res.stderr).not.toContain("    at ");
    expect(res.stderr.toLowerCase()).toContain("unknown option");
  });

  // NEW-11: this was `dev doctor --json`; its L1 checks are `doctor workspace` in the core (the alias, with the l2
  // extension, keeps the case in packages/ext-l2/test/extension-installed.test.ts).
  it("JSON stdout is strictly valid and without ANSI escapes", () => {
    const res = run(["doctor", "workspace", "--json"]);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain("\x1b[");
    const parsed = JSON.parse(res.stdout);
    expect(parsed.schemaVersion).toBe("hardkas.devDoctor.v1");
  });

  // L2-EXT stage 2: without the extension `dev doctor` is its typed refusal, just as strictly valid JSON.
  it("`dev doctor --json` without the l2 extension: one strictly valid JSON refusal", () => {
    const res = run(["dev", "doctor", "--json"]);
    expect(res.status).toBe(1);
    expect(res.stdout).not.toContain("\x1b[");
    const parsed = JSON.parse(res.stdout);
    expect({ ok: parsed.ok, code: parsed.code }).toEqual({ ok: false, code: "EXTENSION_NOT_INSTALLED" });
  });

  it("respects workspace flag independently of CWD", () => {
    const wsDir = path.join(tmpDir, "my-workspace");
    fs.mkdirSync(wsDir);
    fs.writeFileSync(
      path.join(wsDir, "hardkas.config.js"),
      `
      export default { defaultNetwork: "kaspa-testnet-10" };
    `
    );

    const res = run([
      "config",
      "show",
      "--config",
      "my-workspace/hardkas.config.js",
      "--json"
    ]);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.result.config.defaultNetwork).toBe("kaspa-testnet-10");
  });

  it("errors in JSON mode go strictly to stderr", () => {
    const res = run(["tx", "receipt", "--json"]); // missing required <txId> arg
    expect(res.status).toBe(1);
    // stdout should be empty because we never got far enough to print JSON or it was killed
    expect(res.stdout.trim()).toBe("");
    expect(res.stderr.toLowerCase()).toContain("required");
  });
});
