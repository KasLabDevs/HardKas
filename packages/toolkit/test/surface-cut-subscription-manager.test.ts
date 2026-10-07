import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as toolkit from "../src/index.js";

/*
 * Surface Cut 3c-1. `WalletSubscriptionManager` wrapped a kaspa-rpc `utxos-changed`
 * subscription that lost whatever changed while the socket was down. Since 3b,
 * `WalletToolkit.watch()` runs on kaspa-wasm's UtxoContext, and nothing else used the class or
 * its two types (`WalletWatchHandler`, `WalletSubscriptionEvent`). This keeps all three out of
 * the toolkit's public entry and out of the workspace.
 */

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ROOTS = ["packages", "examples", "labs", "apps", "scripts"];
const SKIP = new Set(["node_modules", "dist", "out", "build", "coverage", ".turbo", ".hardkas", ".docusaurus", "target"]);
const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const SURFACE = /\b(WalletSubscriptionManager|WalletWatchHandler|WalletSubscriptionEvent)\b/;
const SELF = "packages/toolkit/test/surface-cut-subscription-manager.test.ts";

// The module that declares the class and its types, and its own tests.
const OWN = ["packages/toolkit/src/subscriptions.ts", "packages/toolkit/test/wallet-watch.test.ts", SELF];

function codeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) codeFiles(full, out);
    else if (CODE.test(entry.name)) out.push(full);
  }
  return out;
}

describe("Surface Cut 3c-1: no WalletSubscriptionManager", () => {
  const mentions = ROOTS.flatMap((root) => {
    const dir = path.join(REPO, root);
    return fs.existsSync(dir) ? codeFiles(dir) : [];
  })
    .filter((file) => SURFACE.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(REPO, file).split(path.sep).join("/"));

  it("the toolkit's public entry does not export it", () => {
    expect("WalletSubscriptionManager" in toolkit).toBe(false);
  });

  it("no code outside its own module and tests uses it or its types", () => {
    expect(mentions.filter((rel) => !OWN.includes(rel))).toEqual([]);
  });

  it("the class and its two types stay deleted", () => {
    expect(mentions.filter((rel) => rel !== SELF)).toEqual([]);
  });
});
