import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// -----------------------------------------------------------------------------
// Wave 9 · DEF-18 · CI-only extension of the single-envelope invariant.
//
// Gate B passed: `commands/ci.ts:97` (pre-Wave-9) explicitly stripped
// HardkasCliError into `new Error("Command failed")`, destroying the typed
// code CI_VERIFY_FAILED. Wave 9 removes only that specific branch; the
// adjacent CI_ERROR wrapping for non-HardkasCliError exceptions is
// preserved.
//
// This regression file locks the invariant end-to-end via a deterministic
// local failure that reaches CI_VERIFY_FAILED (running `hardkas ci verify`
// in an empty workspace triggers `runDoctorChecks` failure → hasErrors →
// the explicit throw).
//
// Wave 9 does NOT touch replay diff (Gate A failed:
// DEF18_WRAPPER_DESTRUCTION_BUT_NO_TYPED_VALUE — no typed code below the
// wrapper to preserve). Nor any other command.
// -----------------------------------------------------------------------------

const cliDist = path.resolve(__dirname, "../dist/index.js");

let emptyWs: string;

beforeAll(async () => {
  emptyWs = await fsp.mkdtemp(path.join(os.tmpdir(), "hk-wave9-ci-"));
});

afterAll(async () => {
  if (emptyWs) await fsp.rm(emptyWs, { recursive: true, force: true });
});

function runHardkas(args: string) {
  try {
    const stdout = execSync(`node "${cliDist}" ${args}`, {
      encoding: "utf8",
      stdio: "pipe",
      cwd: emptyWs,
      env: { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1" }
    });
    return { code: 0, stdout, stderr: "" };
  } catch (e: any) {
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? ""
    };
  }
}

describe("Wave 9 · DEF-18 · CI single authoritative failure envelope", () => {
  // Note: `hardkas ci verify` does NOT currently declare a `--json` option
  // (neither at top-level nor on the `verify` subcommand). Passing `--json`
  // causes Commander to reject it as an unknown option before the action
  // runs. Wave 9 therefore locks the HUMAN-mode single-envelope invariant
  // only — that IS where the pre-Wave-9 typed-error destruction was
  // observable to users. Adding `--json` support to CI is an intentional
  // API expansion, out of DEF-18 scope; recorded as OUTPUT-OWNERSHIP-MIGRATION
  // backlog.

  it("human mode · CI_VERIFY_FAILED · typed diagnostic visible · non-zero exit", () => {
    const r = runHardkas("ci verify");
    expect(r.code).toBe(1);
    // Pre-Wave-9 the visible failure was "Command failed" (the wrapper
    // stripped the typed HardkasCliError). Wave 9 lets the typed error
    // propagate to the top-level renderer at ui.ts:229-233, which prints
    //   `\n  ✗ [<code>] <message>`
    // on stderr. Both the code and the descriptive message must survive.
    const combined = r.stdout + r.stderr;
    expect(combined).toContain("CI_VERIFY_FAILED");
    expect(combined).toContain("CI Verification Failed");
    expect(combined).not.toContain("Command failed");
  });

  it("human mode · exit code is non-zero (typed HardkasCliError.exitCode preserved)", () => {
    const r = runHardkas("ci verify");
    // HardkasCliError.exitCode = HardkasExitCode.RUNTIME_FAILURE = 1.
    // Wave 9 must not regress this from typed exit → unspecified exit.
    expect(r.code).toBe(1);
  });

  it("stdout is not corrupted with envelope duplication (no `{ok:` string)", () => {
    // Human mode should produce narrative output on stdout (headers/steps),
    // not a JSON envelope. Belt-and-suspenders against any accidental
    // envelope emission that might sneak in via a future refactor.
    const r = runHardkas("ci verify");
    expect(r.stdout).not.toContain('"ok":');
    expect(r.stdout).not.toContain('"code":');
  });

  it("adjacent non-HardkasCliError branch is preserved (CI_ERROR wrapper text still in ci.ts source)", () => {
    // The Wave 9 edit only changed the HardkasCliError branch of the outer
    // catch. The other branch (non-HardkasCliError → wrapped as
    // HardkasCliError("CI_ERROR", ...)) must remain functional. Without a
    // deterministic way to inject an exotic exception into the middle of
    // the ci verify action, we assert that the CI_ERROR wrapper path still
    // exists in source. (The CLI dist bundles chunks under other filenames
    // so we read the ci.ts source directly.)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/commands/ci.ts"),
      "utf-8"
    );
    expect(src).toContain('"CI_ERROR"');
    // Prove the strip-to-generic branch is gone as ACTIVE code (comments
    // that reference the old pattern for documentation are OK; the
    // regression must ensure no live statement writes it).
    // Strip line comments and block comments, then check.
    const stripped = src
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(stripped).not.toContain('throw new Error("Command failed")');
  });
});
