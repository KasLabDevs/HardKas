import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// -----------------------------------------------------------------------------
// REMED-CLOSE H-01 · the fixtures whose SHA-256 the tests pin must reach every checkout byte for byte. Git on Windows
// with core.autocrlf=true rewrites text files with CRLF; a `* -text` .gitattributes in each pinned directory turns that
// off for its files, which keep the bytes they were committed with. The KCC vectors lacked it, so their digest checks
// failed on a Windows checkout; so did develop's v1-engine phase 2 fixtures (silverc level, S-4). Canonical level: reads
// the attribute files only.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const PINNED_DIRS = [
  "packages/core/test/fixtures/kcc",
  "packages/core/test/fixtures/silverscript-v1",
  "packages/accounts/test/fixtures/v1-engine/reference",
  "packages/accounts/test/fixtures/v1-engine/phase2",
  "fixtures/toccata-v2/silver",
  "examples/08-covenant-core/fixtures",
  "examples/09-silver-reference/contracts"
];

describe("H-01 · digest-pinned fixture directories keep their bytes on a core.autocrlf=true checkout", () => {
  it.each(PINNED_DIRS)("%s carries `* -text`", (dir) => {
    const attrs = fs.readFileSync(path.join(repoRoot, dir, ".gitattributes"), "utf8");
    expect(attrs.split(/\r?\n/).map((l) => l.trim())).toContain("* -text");
  });
});
