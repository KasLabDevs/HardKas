import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// T-A04 (AUD-04): the canonical gate must resolve the subpath exports that
// consumers use. These three imports are the regression: with the old
// `^@hardkas/(.*)$ -> packages/$1/src/index.ts` alias they fail to resolve.
import * as sdkClient from "@hardkas/sdk/client";
import * as testingScenarios from "@hardkas/testing/scenarios";
import * as accountsWasmRpc from "@hardkas/accounts/internal/wasm-rpc-serialization.js";
import { resolveExportTarget, resolveWorkspaceSource, sourceCandidates } from "../../../vitest.workspace-resolver.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const rel = (abs: string | undefined) => (abs ? path.relative(ROOT, abs).split(path.sep).join("/") : abs);
const manifest = (pkg: string) => JSON.parse(readFileSync(path.join(ROOT, "packages", pkg, "package.json"), "utf8"));

describe("T-A04: workspace subpath exports resolve in the gate", () => {
  it("imports the subpath exports consumers use", () => {
    expect(typeof sdkClient.createHardkasClient).toBe("function");
    expect(typeof testingScenarios.scenario).toBe("function");
    expect(typeof accountsWasmRpc.parseWasmTxToRpc).toBe("function");
  });

  it("maps declared subpaths to the source behind the declared dist target", () => {
    expect(rel(resolveWorkspaceSource("@hardkas/sdk/client"))).toBe("packages/sdk/src/client.ts");
    expect(rel(resolveWorkspaceSource("@hardkas/testing/scenarios"))).toBe("packages/testing/src/scenarios.ts");
    expect(rel(resolveWorkspaceSource("@hardkas/accounts/internal/wasm-rpc-serialization.js"))).toBe(
      "packages/accounts/src/internal/wasm-rpc-serialization.ts"
    );
    expect(rel(resolveWorkspaceSource("@hardkas/sdk"))).toBe("packages/sdk/src/index.ts");
  });

  it("resolves packages without an exports map through main", () => {
    expect(rel(resolveWorkspaceSource("@hardkas/pskt-native"))).toBe("packages/pskt-native/index.js");
    expect(rel(resolveWorkspaceSource("@hardkas/jobs"))).toBe("packages/jobs/src/index.ts");
  });

  it("refuses subpaths a package does not declare instead of inventing a file", () => {
    expect(resolveWorkspaceSource("@hardkas/sdk/not-an-export")).toBeUndefined();
    expect(resolveWorkspaceSource("@hardkas/no-such-package")).toBeUndefined();
    expect(resolveWorkspaceSource("not-hardkas")).toBeUndefined();
  });

  // P30: two entries promised modules the build never emitted. `@hardkas/kaspa-rpc/adapters` was an empty module (its
  // re-exports archived since 0.11) and `@hardkas/query`'s "./*" pointed at dist/*.js while tsup bundles only
  // dist/index.js. Neither is declared any more; the valid subpaths above still resolve.
  it("no longer declares the empty or unbuildable subpaths", () => {
    expect(resolveWorkspaceSource("@hardkas/kaspa-rpc/adapters")).toBeUndefined();
    expect(resolveWorkspaceSource("@hardkas/query/index")).toBeUndefined();
    expect(resolveWorkspaceSource("@hardkas/query/engine")).toBeUndefined();
    expect(Object.keys(manifest("kaspa-rpc").exports)).toEqual(["."]);
    expect(Object.keys(manifest("query").exports)).toEqual(["."]);
    expect(manifest("kaspa-rpc").scripts.build).not.toContain("src/adapters");
    expect(existsSync(path.join(ROOT, "packages/kaspa-rpc/src/adapters/index.ts"))).toBe(false);
    expect(rel(resolveWorkspaceSource("@hardkas/kaspa-rpc"))).toBe("packages/kaspa-rpc/src/index.ts");
    expect(rel(resolveWorkspaceSource("@hardkas/query"))).toBe("packages/query/src/index.ts");
  });

  it("honours export conditions and subpath patterns", () => {
    const exportsField = {
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      "./x": "./dist/x.js",
      "./internal/*": { import: "./dist/internal/*.js" }
    };
    expect(resolveExportTarget(exportsField, ".")).toBe("./dist/index.js");
    expect(resolveExportTarget(exportsField, "./x")).toBe("./dist/x.js");
    expect(resolveExportTarget(exportsField, "./internal/foo")).toBe("./dist/internal/foo.js");
    expect(resolveExportTarget(exportsField, "./y")).toBeUndefined();
    expect(resolveExportTarget("./dist/only.js", ".")).toBe("./dist/only.js");
    expect(resolveExportTarget({ import: "./dist/a.js" }, ".")).toBe("./dist/a.js");
    expect(sourceCandidates("./dist/adapters/index.js")).toEqual([
      "src/adapters/index.ts",
      "src/adapters/index/index.ts",
      "dist/adapters/index.js"
    ]);
  });

  it("every resolved file exists on disk", () => {
    for (const specifier of [
      "@hardkas/sdk/client",
      "@hardkas/testing/scenarios",
      "@hardkas/accounts/internal/wasm-rpc-serialization.js"
    ]) {
      const resolved = resolveWorkspaceSource(specifier);
      expect(resolved, specifier).toBeDefined();
      expect(existsSync(resolved!), specifier).toBe(true);
    }
  });
});
