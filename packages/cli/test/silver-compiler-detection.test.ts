import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function runDoctor(args: string[] = []) {
  const distCli = path.resolve(__dirname, "../dist/index.js");
  if (!fs.existsSync(distCli)) {
    return "";
  }

  return execFileSync(process.execPath, [distCli, "silver", "doctor", ...args], {
    encoding: "utf8",
    stdio: "pipe",
    timeout: 60_000
  });
}

function runCompile(args: string[] = []) {
  const distCli = path.resolve(__dirname, "../dist/index.js");
  if (!fs.existsSync(distCli)) {
    return "";
  }

  try {
    return execFileSync(process.execPath, [distCli, "silver", "compile", ...args], {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 60_000
    });
  } catch (e: any) {
    return e.stdout || e.stderr || e.message;
  }
}

describe("silver compiler detection", () => {
  it("reports SILVERSCRIPT_COMPILER_READY for an explicit executable compiler path", () => {
    const output = runDoctor(["--compiler-path", process.execPath]);

    expect(output).toContain("SILVERSCRIPT_COMPILER_READY");
  });

  it("reports a stable unavailable status and install hint when compiler is missing", () => {
    const output = runDoctor(["--compiler-path", "definitely-missing-silverc"]);

    expect(output).toContain("SILVERSCRIPT_COMPILER_UNAVAILABLE");
    expect(output).toContain("HARDKAS_SILVERC_PATH");
    expect(output).toContain(".hardkas/bin/silverc");
  });

  it("reports SILVERSCRIPT_COMPILER_UNAVAILABLE as JSON when compiler is missing", () => {
    // create a fake .sil file
    fs.writeFileSync("test.sil", "contract Test {}");
    const output = runCompile(["test.sil", "--compiler-path", "definitely-missing-silverc", "--json"]);
    fs.unlinkSync("test.sil");

    const parsed = JSON.parse(output);
    expect(parsed.error).toBe("SILVER_COMPILER_NOT_FOUND");
    expect(parsed.hint).toContain("HARDKAS_SILVERC_PATH");
  });
});
