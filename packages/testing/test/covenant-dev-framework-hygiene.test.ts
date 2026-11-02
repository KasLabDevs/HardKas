import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// -----------------------------------------------------------------------------
// F4 (H-B5) · the Covenant Dev Framework keeps its evidence outside the tree: a manifest inside the tree cannot describe
// the commit it is part of, and the one the DELTA carried went stale and held personal paths. No evidence manifest at the
// repository root, and no personal absolute path in the framework's own files. (Older files elsewhere in the repository
// are outside this check.) Canonical level.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const SELF = path.basename(__filename);

const FRAMEWORK_SOURCES = [
  "packages/core/src/silverscript-vm-debugger.ts",
  "packages/core/src/silverscript-static-analyzer.ts",
  "packages/testing/src/covenant-testbed.ts",
  "packages/testing/src/covenant-fuzz.ts",
  "packages/testing/src/consensus-submission.ts",
  "packages/testing/src/isolated-simnet.ts",
  "packages/cli/src/commands/silver-dev-framework.ts"
];
const FRAMEWORK_TEST = /(covenant|silverscript-vm|silverscript-runner|silver-dev|silver-runner|silver-test|silver-debug|silver-fuzz|exact-integers|gate-levels)/;

function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

function frameworkFiles(): string[] {
  const tests = ["core", "testing", "cli"].flatMap((p) =>
    filesUnder(path.join(repoRoot, "packages", p, "test")).filter((f) => FRAMEWORK_TEST.test(path.basename(f)) && path.basename(f) !== SELF)
  );
  return [
    ...FRAMEWORK_SOURCES.map((f) => path.join(repoRoot, f)),
    ...filesUnder(path.join(repoRoot, "examples", "10-covenant-dev-framework")),
    ...tests
  ].filter((f) => fs.existsSync(f));
}

// A user's home on Windows, macOS or Linux, written out in full.
const PERSONAL_PATH = /\b[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}[^\\/\s"'`]+|(^|[\s"'`(])\/(home|Users)\/[A-Za-z0-9._-]+\//m;

describe("F4 · the framework carries no stale evidence and no personal paths", () => {
  it("H1 no evidence manifest at the repository root", () => {
    const manifests = fs.readdirSync(repoRoot).filter((n) => /evidence/i.test(n) && /\.json$/i.test(n));
    expect(manifests).toEqual([]);
  });

  it("H2 no personal absolute path in the framework's sources, example and tests", () => {
    const files = frameworkFiles();
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) => PERSONAL_PATH.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(repoRoot, f));
    expect(offenders).toEqual([]);
  });
});
