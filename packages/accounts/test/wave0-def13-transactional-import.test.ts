import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const __filename_test = fileURLToPath(import.meta.url);
const __dirname_test = path.dirname(__filename_test);
import {
  createEmptyRealAccountStore,
  importRealDevAccount,
  saveRealAccountStore,
  loadRealAccountStore
} from "../src";

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hk-def13-"));
}
function sha256File(p: string): string {
  return createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

// Sentinel private key — see wave0-sec1-secret-boundary.test.ts for domain rationale.
const SENTINEL_PK = "de".repeat(32);
const A_ADDR = "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn";

describe("DEF-13 · importRealDevAccount is validation-first (pure)", () => {
  it("collision throws BEFORE mutating the store copy", () => {
    const initial = createEmptyRealAccountStore();
    const with1 = importRealDevAccount(initial, {
      name: "alice",
      address: A_ADDR,
      privateKey: SENTINEL_PK
    });
    expect(with1.accounts.length).toBe(1);
    // Second import of the same name must throw and not return a "corrupt" store.
    let thrown: unknown;
    let observed: unknown;
    try {
      observed = importRealDevAccount(with1, {
        name: "alice",
        address: A_ADDR,
        privateKey: SENTINEL_PK
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(observed).toBeUndefined();
    // The pre-existing in-memory store retains a single account (importRealDevAccount is pure).
    expect(with1.accounts.length).toBe(1);
  });

  it("invalid account name throws before mutation", () => {
    const initial = createEmptyRealAccountStore();
    let thrown: unknown;
    try {
      importRealDevAccount(initial, { name: "invalid name with spaces", address: A_ADDR });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(initial.accounts.length).toBe(0);
  });

  it("invalid address prefix throws before mutation", () => {
    const initial = createEmptyRealAccountStore();
    let thrown: unknown;
    try {
      importRealDevAccount(initial, { name: "alice", address: "not-a-kaspa-address" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(initial.accounts.length).toBe(0);
  });
});

describe("DEF-13 · on-disk store is byte-unchanged on failed second import", () => {
  it("collision on a persisted store leaves the file byte-identical", async () => {
    const dir = mkTmp();
    const p = path.join(dir, ".hardkas", "accounts.real.json");
    fs.mkdirSync(path.dirname(p), { recursive: true });

    const base = importRealDevAccount(createEmptyRealAccountStore(), {
      name: "alice",
      address: A_ADDR,
      privateKey: SENTINEL_PK
    });
    await saveRealAccountStore(base, { path: p });

    const beforeSha = sha256File(p);

    // Simulate the CLI runner's post-DEF-13 flow: load; validate via import; save only on success.
    const loaded = await loadRealAccountStore({ path: p });
    expect(loaded === null).toBe(false);
    let thrown: unknown;
    try {
      const _next = importRealDevAccount(loaded!, {
        name: "alice",
        address: A_ADDR,
        privateKey: SENTINEL_PK
      });
      // If we ever reached here, the runner would have saved. But it should throw.
      await saveRealAccountStore(_next, { path: p });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    // The file must be byte-identical to its pre-failure content.
    expect(sha256File(p)).toBe(beforeSha);
  });
});

describe("DEF-13 · store does NOT come into existence from a failed first import", () => {
  it("with no prior store file, a failed import must not create the file", async () => {
    const dir = mkTmp();
    const p = path.join(dir, ".hardkas", "accounts.real.json");
    // Directory does not yet exist, and the file does not exist.
    expect(fs.existsSync(p)).toBe(false);

    // Runner-shape: load (returns null), start with in-memory empty, validate, save only on success.
    const loaded = await loadRealAccountStore({ path: p });
    expect(loaded).toBeNull();
    const inMem = createEmptyRealAccountStore();

    let thrown: unknown;
    try {
      const _next = importRealDevAccount(inMem, {
        name: "invalid name",
        address: A_ADDR
      });
      // Would only reach here on success — then save. But validation should throw.
      fs.mkdirSync(path.dirname(p), { recursive: true });
      await saveRealAccountStore(_next, { path: p });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    // The file must still not exist. (This is the crucial DEF-13 property.)
    expect(fs.existsSync(p)).toBe(false);
  });
});

describe("DEF-13 · byte-unchanged property survives process restart (spawned Node)", () => {
  function runScriptInFreshProcess(scriptContents: string): string {
    // Write the script INSIDE the accounts package directory so pnpm workspace
    // resolution finds @hardkas/accounts via the monorepo's node_modules.
    const pkgRoot = path.join(__dirname_test, "..");
    const scriptFile = path.join(pkgRoot, `.wave0-def13-tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
    fs.writeFileSync(scriptFile, scriptContents, "utf-8");
    try {
      const { execSync } = require("node:child_process");
      return execSync(`node "${scriptFile}"`, { encoding: "utf-8", timeout: 20_000, cwd: pkgRoot });
    } finally {
      try { fs.unlinkSync(scriptFile); } catch {}
    }
  }

  it("a persisted store's sha256 is identical before and after a failing import in a fresh Node process", async () => {
    const dir = mkTmp();
    const p = path.join(dir, ".hardkas", "accounts.real.json");
    fs.mkdirSync(path.dirname(p), { recursive: true });

    const base = importRealDevAccount(createEmptyRealAccountStore(), {
      name: "alice",
      address: A_ADDR,
      privateKey: SENTINEL_PK
    });
    await saveRealAccountStore(base, { path: p });
    const beforeSha = sha256File(p);

    const script = [
      `import { loadRealAccountStore, createEmptyRealAccountStore, importRealDevAccount, saveRealAccountStore } from "@hardkas/accounts";`,
      `const p = ${JSON.stringify(p)};`,
      `const loaded = await loadRealAccountStore({ path: p });`,
      `const base = loaded ?? createEmptyRealAccountStore();`,
      `try {`,
      `  const next = importRealDevAccount(base, { name: "alice", address: ${JSON.stringify(A_ADDR)}, privateKey: ${JSON.stringify(SENTINEL_PK)} });`,
      `  await saveRealAccountStore(next, { path: p });`,
      `  console.log("UNEXPECTED_SUCCESS");`,
      `} catch (e) { console.log("EXPECTED_FAILURE: " + e.message); }`
    ].join("\n");

    const out = runScriptInFreshProcess(script);
    expect(out.includes("EXPECTED_FAILURE")).toBe(true);
    expect(out.includes("UNEXPECTED_SUCCESS")).toBe(false);
    expect(sha256File(p)).toBe(beforeSha);
  }, 30_000);

  it("a nonexistent store stays nonexistent across a failing import in a fresh Node process", async () => {
    const dir = mkTmp();
    const p = path.join(dir, ".hardkas", "accounts.real.json");
    expect(fs.existsSync(p)).toBe(false);

    const script = [
      `import { loadRealAccountStore, createEmptyRealAccountStore, importRealDevAccount, saveRealAccountStore } from "@hardkas/accounts";`,
      `const p = ${JSON.stringify(p)};`,
      `const loaded = await loadRealAccountStore({ path: p });`,
      `const base = loaded ?? createEmptyRealAccountStore();`,
      `try {`,
      `  const next = importRealDevAccount(base, { name: "invalid name", address: ${JSON.stringify(A_ADDR)} });`,
      `  await saveRealAccountStore(next, { path: p });`,
      `  console.log("UNEXPECTED_SUCCESS");`,
      `} catch (e) { console.log("EXPECTED_FAILURE: " + e.message); }`
    ].join("\n");

    const out = runScriptInFreshProcess(script);
    expect(out.includes("EXPECTED_FAILURE")).toBe(true);
    expect(fs.existsSync(p)).toBe(false);
  }, 30_000);
});
