import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/*
 * `buildPaymentPlan` is a compatibility shim, not a planner: plans come from the
 * kaspa-wasm Generator. It survives only behind the simulator's synchronous harness
 * (`applySimulatedPayment`, used by `harness.send()`) until that API migrates. This
 * test keeps it from gaining consumers, and keeps `planSingleOutputSpend` deleted.
 */

const REPO = path.resolve(__dirname, "../../..");
const ROOTS = ["packages", "examples", "labs", "apps", "scripts"];
const SKIP = new Set(["node_modules", "dist", "out", "build", "coverage", ".turbo", ".hardkas", ".docusaurus"]);
const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const SHIM = /\bbuildPaymentPlan\b/;
const DELETED = /\bplanSingleOutputSpend\b/;

// The shim, its one consumer (the synchronous harness path) and the shim's own tests.
const ALLOWED = ["packages/tx-builder/src/index.ts", "packages/localnet/src/transactions.ts"];
const ALLOWED_DIR = "packages/tx-builder/test/";

function codeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) codeFiles(full, out);
    else if (CODE.test(entry.name)) out.push(full);
  }
  return out;
}

describe("buildPaymentPlan compatibility shim", () => {
  const files = ROOTS.flatMap((root) => {
    const dir = path.join(REPO, root);
    return fs.existsSync(dir) ? codeFiles(dir) : [];
  }).map((file) => ({ file, rel: path.relative(REPO, file).split(path.sep).join("/") }));

  it("has no consumer outside the simulator's synchronous harness", () => {
    const consumers = files
      .filter(({ rel }) => !ALLOWED.includes(rel) && !rel.startsWith(ALLOWED_DIR))
      .filter(({ file }) => SHIM.test(fs.readFileSync(file, "utf8")))
      .map(({ rel }) => rel);
    expect(consumers).toEqual([]);
  });

  it("planSingleOutputSpend stays deleted", () => {
    const users = files
      .filter(({ rel }) => rel !== `${ALLOWED_DIR}compat-shim-consumers.test.ts`)
      .filter(({ file }) => DELETED.test(fs.readFileSync(file, "utf8")))
      .map(({ rel }) => rel);
    expect(users).toEqual([]);
  });
});
