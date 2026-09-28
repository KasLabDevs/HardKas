import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// Demo-cut step 2 · AUD-21 — `accounts real generate --unsafe-plaintext --json`
// printed the whole account record, private key included, to stdout (the human mode
// masked it). Storing a key in plaintext stays an explicit, dangerous opt-in; the
// machine-readable result now says how the key is stored and where, never the key.

// `generate --name ana` stores `ana1` (AUD-15, a separate item): accounts are found by prefix.
const storedAccount = (ws: string, base: string) => {
  const store = JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "accounts.real.json"), "utf8"));
  const found = store.accounts.filter((a: any) => new RegExp(`^${base}\\d*$`).test(a.name));
  expect(found, JSON.stringify(store.accounts.map((a: any) => a.name))).toHaveLength(1);
  return found[0];
};

const run = (args: string[], cwd: string, env: Record<string, string> = {}) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, encoding: "utf8", env: childEnv(env), timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};

describe("Demo-cut · AUD-21 · no secret in JSON output", () => {
  let ws: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-dc-aud21-"));
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};");
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("generate --unsafe-plaintext --json: the stored private key appears nowhere in stdout or stderr", () => {
    const r = run(["accounts", "real", "generate", "--name", "ana", "--unsafe-plaintext", "--yes", "--json"], ws);
    expect(r.status, r.all).toBe(0);

    const stored = storedAccount(ws, "ana");
    expect(stored.privateKey).toMatch(/^[0-9a-f]{64}$/i); // plaintext on disk: the explicit opt-in
    const secret = String(stored.privateKey).toLowerCase();

    expect(r.all.toLowerCase()).not.toContain(secret);
    expect(r.stdout).not.toMatch(/privateKey/i);

    const out = JSON.parse(r.stdout.slice(r.stdout.indexOf("[")));
    expect(out).toEqual([
      expect.objectContaining({
        name: stored.name,
        address: stored.address,
        storage: "plaintext",
        unsafePlaintext: true,
        store: ".hardkas/accounts.real.json"
      })
    ]);
  });

  it("the same key never leaks through `accounts list --json` either", () => {
    expect(run(["accounts", "real", "generate", "--name", "ben", "--unsafe-plaintext", "--yes"], ws).status).toBe(0);
    const secret = String(storedAccount(ws, "ben").privateKey).toLowerCase();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    const list = run(["accounts", "list", "--json"], ws);
    expect(list.status, list.all).toBe(0);
    expect(list.all.toLowerCase()).not.toContain(secret);
  });

  it("an encrypted account reports its keystore, and no key material at all", () => {
    const r = run(["accounts", "real", "generate", "--name", "cleo", "--password-env", "HK_TEST_PW", "--json"], ws, { HK_TEST_PW: "correct horse battery staple" });
    expect(r.status, r.all).toBe(0);
    const stored = storedAccount(ws, "cleo");
    expect(stored.privateKey).toBeUndefined(); // encrypted: no plaintext key on disk either
    const out = JSON.parse(r.stdout.slice(r.stdout.indexOf("[")));
    expect(out).toEqual([
      expect.objectContaining({ name: stored.name, storage: "encrypted-keystore", unsafePlaintext: false, keystore: `.hardkas/keystore/${stored.name}.json` })
    ]);
    expect(r.stdout).not.toMatch(/privateKey/i);
    // No bare 64-hex value (a private key's shape) anywhere in the result.
    expect(r.stdout).not.toMatch(/"[0-9a-f]{64}"/i);
  });
});
