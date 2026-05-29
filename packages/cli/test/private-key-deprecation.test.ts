import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, "../src/index.ts");
const tsx = path.resolve(__dirname, "../../../node_modules/.bin/tsx");

import { spawnSync } from "node:child_process";

import os from "node:os";

let tmpDir = "";

function runCommand(args: string) {
  if (!tmpDir) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-deprec-"));
    fs.writeFileSync(path.join(tmpDir, "hardkas.config.ts"), "export default {};");
  }
  const result = spawnSync(`"${tsx}"`, [`"${cliPath}"`, ...args.split(" ")], {
    shell: true,
    encoding: "utf8",
    cwd: tmpDir
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    combined: (result.stdout || "") + (result.stderr || "")
  };
}

describe("Private Key Deprecation", () => {
  it("should show deprecation warning in help text", () => {
    const help = runCommand("accounts real import --help");
    expect(help.combined).toContain("Deprecated. Unsafe: may leak through shell history");
  });

  it("should print a loud warning when using --private-key as an argument", () => {
    const uniqueName = `test-dep-${Date.now()}`;
    const output = runCommand(
      `accounts real import --name ${uniqueName} --address kaspa:sim_test --private-key 0000000000000000000000000000000000000000000000000000000000000001 --unsafe-plaintext --yes`
    );

    console.error("DEBUG STDOUT:", output.stdout);
    console.error("DEBUG STDERR:", output.stderr);
    expect(output.combined).toContain("SECURITY WARNING [PRIVATE_KEY_ARG_DEPRECATED]");
    expect(output.combined).toContain("--private-key may be recorded in shell history");
  });

  it("should include machine-readable warning in JSON output", () => {
    const uniqueName = `test-json-${Date.now()}`;
    const output = runCommand(
      `accounts real import --name ${uniqueName} --address kaspa:sim_test --private-key 0000000000000000000000000000000000000000000000000000000000000001 --json --yes --unsafe-plaintext`
    );

    const jsonStr = output.stdout;

    try {
      const result = JSON.parse(jsonStr);
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: "PRIVATE_KEY_ARG_DEPRECATED",
          severity: "warning"
        })
      );
    } catch (e) {
      console.error("DEBUG: output was:", output);
      console.error("DEBUG: jsonStr was:", jsonStr);
      throw e;
    }
  });

  it("should NOT show warning when using interactive input (simulated via empty call failing)", () => {
    const uniqueName = `test-int-${Date.now()}`;
    const output = runCommand(
      `accounts real import --name ${uniqueName} --address kaspa:sim_test`
    );
    expect(output.combined).not.toContain("PRIVATE_KEY_ARG_DEPRECATED");
  });
});
