import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_LOCALNET, nodeRpcUrl } from "../src/index.js";

// CANONICAL-RPC-URL (2026-10-05): the localnet endpoint has one source, `CANONICAL_LOCALNET` /
// `nodeRpcUrl()` in @hardkas/core. Copies of "127.0.0.1:18210" in package sources drifted
// (http:// in one place, ws:// in another); none may come back.

const packagesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CANONICAL_SOURCE = path.join("core", "src", "node-identity.ts");

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "test") continue;
      yield* sourceFiles(p);
    } else if (/\.(ts|tsx|mts)$/.test(entry.name)) {
      yield p;
    }
  }
}

describe("CANONICAL-RPC-URL · one source for the localnet endpoint", () => {
  it("nodeRpcUrl() is the ws:// form of CANONICAL_LOCALNET", () => {
    expect(nodeRpcUrl()).toBe(`ws://${CANONICAL_LOCALNET.host}:${CANONICAL_LOCALNET.ports.jsonRpc}`);
    expect(nodeRpcUrl()).toBe("ws://127.0.0.1:18210");
  });

  it("no package source (outside the canonical declaration) spells the endpoint as a literal", () => {
    const offenders: string[] = [];
    for (const pkg of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      const src = path.join(packagesRoot, pkg.name, "src");
      if (!fs.existsSync(src)) continue;
      for (const file of sourceFiles(src)) {
        const rel = path.relative(packagesRoot, file);
        if (rel === CANONICAL_SOURCE) continue;
        const text = fs.readFileSync(file, "utf8");
        if (/127\.0\.0\.1:18210|localhost:18210/.test(text)) offenders.push(rel.split(path.sep).join("/"));
      }
    }
    expect(offenders).toEqual([]);
  });
});
