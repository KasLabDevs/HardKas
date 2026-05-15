import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, "../src/index.ts");
const tsx = path.resolve(__dirname, "../../../node_modules/.bin/tsx");

function runCommand(args: string) {
  try {
    const lockPath = path.resolve(__dirname, "../.hardkas/locks/accounts.lock");
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  } catch (e) {}

  let res = "";
  try {
    res = execSync(`"${tsx}" "${cliPath}" ${args}`, { encoding: "utf8", stdio: "pipe" });
  } catch (e: any) {
    res = (e.stdout || "") + (e.stderr || "");
  }
  return res;
}

describe("Private Key Deprecation", () => {
  it("should show deprecation warning in help text", () => {
    const help = runCommand("accounts real import --help");
    expect(help).toContain("Deprecated. Unsafe: may leak through shell history");
  });

  it("should print a loud warning when using --private-key as an argument", () => {
    const uniqueName = `test-dep-${Date.now()}`;
    // We provide a dummy address so it reaches the key acquisition step
    const output = runCommand(`accounts real import --name ${uniqueName} --address kaspa:sim_test --private-key 0000000000000000000000000000000000000000000000000000000000000001 --unsafe-plaintext --yes`);
    
    expect(output).toContain("SECURITY WARNING [PRIVATE_KEY_ARG_DEPRECATED]");
    expect(output).toContain("--private-key may be recorded in shell history");
  });

  it("should include machine-readable warning in JSON output", () => {
    const uniqueName = `test-json-${Date.now()}`;
    const output = runCommand(`accounts real import --name ${uniqueName} --address kaspa:sim_test --private-key 0000000000000000000000000000000000000000000000000000000000000001 --json --yes --unsafe-plaintext`);
    
    const startIndex = output.indexOf("{");
    const endIndex = output.lastIndexOf("}");
    const jsonStr = startIndex !== -1 && endIndex !== -1 ? output.substring(startIndex, endIndex + 1) : output;
    
    try {
      const result = JSON.parse(jsonStr);
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toContainEqual(expect.objectContaining({
        code: "PRIVATE_KEY_ARG_DEPRECATED",
        severity: "warning"
      }));
    } catch (e) {
      console.error("DEBUG: output was:", output);
      console.error("DEBUG: jsonStr was:", jsonStr);
      throw e;
    }
  });

  it("should NOT show warning when using interactive input (simulated via empty call failing)", () => {
      const uniqueName = `test-int-${Date.now()}`;
      // This will fail because it tries to prompt, and we are in non-interactive CI
      const output = runCommand(`accounts real import --name ${uniqueName} --address kaspa:sim_test`);
      expect(output).not.toContain("PRIVATE_KEY_ARG_DEPRECATED");
  });
});

