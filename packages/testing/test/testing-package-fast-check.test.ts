import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// -----------------------------------------------------------------------------
// F5 (H-C1) · the public types of @hardkas/testing use fast-check (its fuzz API takes and returns fast-check arbitraries).
// fast-check is therefore a declared runtime dependency, and the build keeps it external: the runtime and the types are
// one and the same instance, and a strict TypeScript consumer resolves its import. (The packed tarball itself is checked
// in a clean consumer by the block's validation.) Canonical level: reads the package manifest and its built dist.
// -----------------------------------------------------------------------------

const pkgDir = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));

describe("F5 · fast-check is a declared, external dependency of @hardkas/testing", () => {
  it("P1 package.json declares fast-check in dependencies", () => {
    expect(pkg.dependencies?.["fast-check"], JSON.stringify(pkg.dependencies)).toMatch(/^\^?\d+\.\d+\.\d+$/);
  });

  it("P2 the build keeps fast-check external: the built JavaScript imports it", () => {
    const dist = path.join(pkgDir, "dist");
    const js = fs.readdirSync(dist).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(dist, f), "utf8"));
    expect(js.some((t) => /from\s*["']fast-check["']/.test(t))).toBe(true);
  });

  it("P3 the published types import fast-check, which the dependency now resolves", () => {
    const dts = fs.readFileSync(path.join(pkgDir, "dist", "index.d.ts"), "utf8");
    expect(dts).toMatch(/from\s*["']fast-check["']/);
  });
});
