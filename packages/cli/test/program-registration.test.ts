import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, "../src/index.ts");
const tsx = path.resolve(__dirname, "../../../node_modules/.bin/tsx");

function runHardkas(args: string = "") {
  try {
    return execSync(`"${tsx}" "${cliPath}" ${args}`, { encoding: "utf8" });
  } catch (e: any) {
    return e.stdout + e.stderr;
  }
}

describe("CLI registration integrity", () => {
  it("registers all expected top-level commands", () => {
    const result = runHardkas("--help");

    expect(result).toContain("capabilities");
    expect(result).toContain("console");
    expect(result).toContain("deploy");
    expect(result).toContain("networks");
    expect(result).toContain("new");
    expect(result).toContain("localnet");
  });
});
