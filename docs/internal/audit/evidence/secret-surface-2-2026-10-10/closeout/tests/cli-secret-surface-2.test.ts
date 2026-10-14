import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 180_000 });

// SECRET-SURFACE-2 · BEFORE (investigation, 2026-10-10) — the exposure surfaces the mini re-audit of 2026-10-06 found,
// as a user meets them through the built CLI, each in a temporary workspace. Red on the base, by design:
//  SS2-A SECURITY-AUDIT-BLIND · `security audit` must find the plaintext keys HardKAS itself writes. `localnet account
//        create` stores `"privateKey": "<64 hex>"` in `.hardkas/accounts.real.json`; the auditor's regex
//        (`commands/security.ts`) spells `\\s` inside a regex literal — a literal backslash and an "s", not whitespace —
//        so the space after the colon defeats it, and its mnemonic alternative can never match a real phrase.
//  SS2-B MAINNET-KEY-PRINT · `kaspa wallet create <name> --network mainnet` prints the private key on stdout; the
//        reviewer's decision (2026-10-07): a mainnet key is not printed by default — revealing or exporting it is an
//        explicit action. Contract chosen 2026-10-10 (D1 / P1): the key is random and stored nowhere, so hiding it
//        would lose it; the command REFUSES before generating anything unless `--show-private-key` is given (typed
//        WALLET_KEY_OUTPUT_REQUIRED, exit 2, one JSON document in JSON mode), on every network.
//  SS2-C HARDKAS_DEV_TOKEN · `env check` prints the dev server's access token in clear, human and `--json`.
//  SS2-D ANSI bypass · with colours on (picocolors: every win32 process unless NO_COLOR is set), `kaspa doctor
//        --rpc-url http://user:pw@…` prints the URL's password: the value is coloured before the console guard sees it,
//        and the redaction's `\b` never matches after an escape sequence's "m".
// Controls (green before and after): a clean workspace passes the audit; the documented `privateKeyRef` exemption of
// dev-account configs holds; with colours off the doctor's URL is redacted.

const HEX64 = /[0-9a-f]{64}/i;
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
/** Every entry under `dir` (files and directories, relative, sorted): the shape of "nothing was written". */
const listTree = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      out.push(path.relative(dir, p).split(path.sep).join("/"));
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out.sort();
};
const run = (args: string[], cwd: string, env: Record<string, string> = {}) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, encoding: "utf8", env: childEnv(env), input: "", timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};
/** The same, with colours ON (as any Windows terminal session has them): NO_COLOR unset, FORCE_COLOR set. */
const runColoured = (args: string[], cwd: string, env: Record<string, string> = {}) => {
  const e = childEnv(env);
  delete e.NO_COLOR;
  e.FORCE_COLOR = "1";
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, encoding: "utf8", env: e, input: "", timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};

describe("SECRET-SURFACE-2 · BEFORE", () => {
  let ws: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ss2-"));
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};");
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  describe("SS2-A · security audit finds the plaintext keys HardKAS writes", () => {
    it("control · a clean workspace passes", () => {
      const r = run(["security", "audit"], ws);
      expect(r.status, r.all).toBe(0);
      expect(r.stdout).toMatch(/Security audit passed/);
    });

    it("the key `localnet account create` stores in plaintext fails the audit, naming the file", () => {
      const created = run(["localnet", "account", "create", "bob", "--json"], ws);
      expect(created.status, created.all).toBe(0);
      const storePath = path.join(ws, ".hardkas", "accounts.real.json");
      const store = fs.readFileSync(storePath, "utf8");
      // precondition: the key is on disk, in the format HardKAS writes (a space after the colon)
      expect(store).toMatch(/"privateKey":\s*"[0-9a-f]{64}"/i);
      expect(created.all, "the create command itself prints no key").not.toMatch(HEX64);

      const audit = run(["security", "audit"], ws);
      expect({ exit: audit.status, failed: /SECURITY_AUDIT_FAILED/.test(audit.all), names: audit.all.includes("accounts.real.json") }, audit.all).toEqual({
        exit: 1,
        failed: true,
        names: true
      });
      expect(audit.all, "the audit report never echoes the key").not.toMatch(HEX64);
    });

    it("a mnemonic in plaintext under .hardkas fails the audit", () => {
      fs.mkdirSync(path.join(ws, ".hardkas"), { recursive: true });
      fs.writeFileSync(
        path.join(ws, ".hardkas", "notes.json"),
        JSON.stringify({ mnemonic: "abandon ability able about above absent absorb abstract absurd abuse access accident" }, null, 2)
      );
      const audit = run(["security", "audit", "--json"], ws);
      expect({ exit: audit.status, failed: /SECURITY_AUDIT_FAILED/.test(audit.all), names: audit.all.includes("notes.json") }, audit.all).toEqual({
        exit: 1,
        failed: true,
        names: true
      });
    });

    it("control · a dev-account config that holds only a privateKeyRef is not a leak", () => {
      fs.mkdirSync(path.join(ws, ".hardkas", "dev-accounts"), { recursive: true });
      fs.writeFileSync(
        path.join(ws, ".hardkas", "dev-accounts", "alice.json"),
        JSON.stringify({ name: "alice", privateKeyRef: "keys/alice.key", seed: "0".repeat(64) }, null, 2)
      );
      const audit = run(["security", "audit"], ws);
      expect(audit.status, audit.all).toBe(0);
    });
  });

  describe("SS2-B · a mainnet private key is not printed by default", () => {
    // D1 / P1: a key nobody chose a destination for is not generated at all (an address without its key is the loss
    // this contract exists to prevent), so there is no address to show either.
    it("kaspa wallet create <name> --network mainnet refuses (WALLET_KEY_OUTPUT_REQUIRED, exit 2): no key, no address, the two ways out named", () => {
      const r = run(["kaspa", "wallet", "create", "vault", "--network", "mainnet"], ws);
      const text = stripAnsi(r.all);
      expect({ exit: r.status, code: /WALLET_KEY_OUTPUT_REQUIRED/.test(text) }, r.all).toEqual({ exit: 2, code: true });
      expect(text, "no 64-hex value (the private key) in stdout or stderr").not.toMatch(HEX64);
      expect(text, "no address either: nothing was generated").not.toMatch(/kaspa(sim|test)?:q[0-9a-z]{20,}/);
      expect(text).toMatch(/--show-private-key/);
      expect(text).toMatch(/accounts real generate/);
    });
  });

  describe("SS2-C · env check does not print the dev server token", () => {
    const token = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

    it("human output names the variable as set without its value", () => {
      const r = run(["env", "check"], ws, { HARDKAS_DEV_TOKEN: token });
      expect(r.status, r.all).toBe(0);
      expect(r.stdout).toContain("HARDKAS_DEV_TOKEN");
      expect(r.all, "the token value is not printed").not.toContain(token);
    });

    it("--json reports the variable without its value", () => {
      const r = run(["env", "check", "--json"], ws, { HARDKAS_DEV_TOKEN: token });
      expect(r.status, r.all).toBe(0);
      const doc = JSON.parse(r.stdout.trim());
      const known = (doc.result?.known ?? []).find((v: any) => v.name === "HARDKAS_DEV_TOKEN");
      expect(known, JSON.stringify(doc.result?.known)).toBeTruthy();
      expect(r.all, "the token value is not in the document").not.toContain(token);
    });
  });

  describe("SS2-D · URL credentials are redacted even when the output is coloured", () => {
    const url = "http://user:s3cretpw@127.0.0.1:1/";

    it("control · colours off: kaspa doctor never prints the URL's password", () => {
      const r = run(["kaspa", "doctor", "--rpc-url", url], ws);
      expect(r.all, "the doctor names the endpoint").toContain("127.0.0.1:1");
      expect(r.all).not.toContain("s3cretpw");
    });

    it("colours on (every Windows terminal by default): the password must be redacted all the same", () => {
      const r = runColoured(["kaspa", "doctor", "--rpc-url", url], ws);
      expect(stripAnsi(r.all), "the doctor names the endpoint").toContain("127.0.0.1:1");
      expect(r.all, stripAnsi(r.all)).not.toContain("s3cretpw");
    });

    it("AFTER · colours on, --json: the one document carries no password either", () => {
      const r = runColoured(["kaspa", "doctor", "--rpc-url", url, "--json"], ws);
      expect(r.all, stripAnsi(r.all)).not.toContain("s3cretpw");
    });
  });
});

// AFTER · what D2 and D3 pin beyond the BEFORE: the auditor over HardKAS's own formats (positives and negatives), and the
// shape `env check` reports a secret-bearing variable with.
describe("SECRET-SURFACE-2 · AFTER", () => {
  let ws: string;
  const HEX = "ab".repeat(32);
  const WORDS12 = "abandon ability able about above absent absorb abstract absurd abuse access accident";
  const WORDS24 = `${WORDS12} account accuse achieve acid acoustic acquire across act action actor actress actual adapt`;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ss2-after-"));
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};");
    fs.mkdirSync(path.join(ws, ".hardkas"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const audit = (args: string[] = []) => run(["security", "audit", ...args], ws);
  const plant = (rel: string, content: string) => {
    const p = path.join(ws, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };

  describe("D2 · the formats HardKAS writes are found (by name and shape), the value is never echoed", () => {
    const positives: Array<[string, string, string, RegExp]> = [
      ["JSON, a space after the colon (the store's format)", ".hardkas/accounts.real.json", JSON.stringify({ accounts: [{ name: "bob", privateKey: HEX }] }, null, 2), /private key .*accounts\.real\.json .*field "privateKey"/],
      ["JSON, no spaces", ".hardkas/compact.json", `{"privateKey":"${HEX}"}`, /private key .*compact\.json/],
      ["a TS object with single quotes", ".hardkas/snippet.ts", `export default { accounts: { x: { privateKey: '${HEX}' } } };`, /private key .*snippet\.ts/],
      ["privateKeyHex under YAML-style spacing", ".hardkas/notes.yaml", `privateKeyHex :   ${HEX}\n`, /private key .*notes\.yaml .*"privateKeyHex"/],
      ["the .env line kaspa wallet create recommends, in a log", "logs/session.log", `VAULT_PRIVATE_KEY=${HEX}\n`, /private key .*session\.log .*variable VAULT_PRIVATE_KEY/],
      ["a 12-word mnemonic under a field", ".hardkas/m12.json", JSON.stringify({ mnemonic: WORDS12 }), /mnemonic .*m12\.json .*field "mnemonic"/],
      ["a 24-word seed phrase under seedPhrase", "reports/m24.json", JSON.stringify({ seedPhrase: WORDS24 }, null, 2), /mnemonic .*m24\.json .*field "seedPhrase"/],
      ["a mnemonic in a variable line", "runs/r1/env.txt", `WALLET_MNEMONIC="${WORDS12}"\n`, /mnemonic .*env\.txt .*variable WALLET_MNEMONIC/],
      ["an extended private key anywhere", "artifacts/dump.txt", `backup: xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi\n`, /extended private key .*dump\.txt/],
      // `--include` is joined onto the workspace root (relative paths only, as it always was)
      ["an extra path given with --include", "../outside-of-the-searched-paths/keys.json", JSON.stringify({ privateKey: HEX }), /private key .*keys\.json/]
    ];

    for (const [name, rel, content, expectation] of positives) {
      it(`finds: ${name}`, () => {
        plant(rel, content);
        const extra = rel.startsWith("../") ? ["--include", path.dirname(rel)] : [];
        const r = audit(extra);
        expect({ exit: r.status, failed: /SECURITY_AUDIT_FAILED/.test(r.all) }, r.all).toEqual({ exit: 1, failed: true });
        expect(r.all).toMatch(expectation);
        expect(r.all, "never the value").not.toContain(HEX);
        expect(r.all).not.toContain("abandon ability");
        expect(r.all).not.toContain("xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi");
        if (rel.startsWith("../")) fs.rmSync(path.resolve(ws, path.dirname(rel)), { recursive: true, force: true });
      });
    }

    const negatives: Array<[string, string, string]> = [
      ["content hashes and txIds (64 hex under identity names)", ".hardkas/artifacts/receipts/txReceipt-x.json", JSON.stringify({ contentHash: HEX, txId: HEX, lineage: { parentArtifactId: HEX } }, null, 2)],
      ["an encrypted keystore (ciphertext, salt, nonce)", ".hardkas/keystore/cleo.json", JSON.stringify({ type: "hardkas.encryptedKeystore.v2", address: "kaspa:q" + "x".repeat(60), crypto: { ciphertext: "cd".repeat(48), salt: "ef".repeat(16), nonce: "01".repeat(12) } }, null, 2)],
      ["an account that names its key's environment variable", ".hardkas/accounts.real.json", JSON.stringify({ accounts: [{ name: "ana", address: "kaspa:q" + "y".repeat(60), privateKeyEnv: "ANA_PRIVATE_KEY" }] }, null, 2)],
      ["a dev-account config that references its key file (the documented exemption)", ".hardkas/dev-accounts/alice.json", JSON.stringify({ name: "alice", privateKeyRef: "keys/alice.key" }, null, 2)],
      ["the dev server token file (a bare value: no private key)", ".hardkas/dev-server-token", "ab".repeat(32)],
      ["twelve ordinary words of prose, not under a phrase-bearing name", "logs/notes.log", "the quick brown fox jumps over the lazy dog again and again today\n"],
      ["a 64-hex under a secret name split across a newline is still a key; but a 63-hex is not", ".hardkas/short.json", `{"privateKey": "${HEX.slice(0, 63)}"}`]
    ];

    for (const [name, rel, content] of negatives) {
      it(`passes: ${name}`, () => {
        plant(rel, content);
        const r = audit();
        expect(r.status, r.all).toBe(0);
      });
    }

    it("the exemption is delimited: a dev-account config that carries a key besides its reference is a finding", () => {
      plant(".hardkas/dev-accounts/mallory.json", JSON.stringify({ name: "mallory", privateKeyRef: "keys/mallory.key", privateKey: HEX }, null, 2));
      const r = audit();
      expect({ exit: r.status, failed: /SECURITY_AUDIT_FAILED/.test(r.all) }, r.all).toEqual({ exit: 1, failed: true });
    });

    it("a simnet account is not exempt for being simnet: the plaintext store of localnet account create is a finding, with the way out", () => {
      expect(run(["localnet", "account", "create", "carol", "--json"], ws).status).toBe(0);
      const r = audit();
      expect({ exit: r.status, failed: /SECURITY_AUDIT_FAILED/.test(r.all) }, r.all).toEqual({ exit: 1, failed: true });
      expect(r.all).toMatch(/Plaintext private key in \.hardkas\/accounts\.real\.json \(field "privateKey"\)/);
      expect(r.all).toMatch(/accounts real generate --password-env/);
    });

    it("the .key files of dev accounts are not searched (their permissions are checked instead)", () => {
      plant(".hardkas/dev-accounts/keys/alice.key", HEX);
      const r = audit();
      expect(r.status, r.all).toBe(0);
    });
  });

  describe("D3 · env check reports a secret-bearing variable as configured, never its value", () => {
    const token = "f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f";

    it("--json: value [REDACTED], configured: true, secret: true; a non-secret variable keeps its value", () => {
      const r = run(["env", "check", "--json"], ws, { HARDKAS_DEV_TOKEN: token, HARDKAS_NETWORK: "simnet" });
      expect(r.status, r.all).toBe(0);
      const doc = JSON.parse(r.stdout.trim());
      const byName = Object.fromEntries((doc.result.known as any[]).map((v) => [v.name, v]));
      expect(byName.HARDKAS_DEV_TOKEN).toMatchObject({ value: "[REDACTED]", configured: true, secret: true, source: "process" });
      expect(byName.HARDKAS_NETWORK).toMatchObject({ value: "simnet", source: "process" });
      expect(byName.HARDKAS_NETWORK.secret).toBeUndefined();
      expect(r.all).not.toContain(token);
    });

    it("human: the line says configured and shows the marker; the same when the token comes from .env", () => {
      fs.writeFileSync(path.join(ws, ".env"), `HARDKAS_DEV_TOKEN=${token}\n`);
      const r = run(["env", "check"], ws);
      expect(r.status, r.all).toBe(0);
      expect(r.stdout).toMatch(/HARDKAS_DEV_TOKEN=\[REDACTED\]\s+\(configured; \.env;/);
      expect(r.all).not.toContain(token);
    });

    // There is no CLI reveal of the token to keep untouched: `dev-server token` exists as a runner, but the `dev-server`
    // group is imported and never registered (program.ts), like `dashboard` — recorded for DASHBOARD-TOKEN-EXPOSURE-1.
    it("the token file the server writes is not touched by env check", () => {
      fs.writeFileSync(path.join(ws, ".hardkas", "dev-server-token"), token);
      expect(run(["env", "check"], ws, { HARDKAS_DEV_TOKEN: token }).status).toBe(0);
      expect(fs.readFileSync(path.join(ws, ".hardkas", "dev-server-token"), "utf8")).toBe(token);
    });
  });

  // D1 (P1, reviewer 2026-10-10): `kaspa wallet create` generates a key HardKAS does not store, so where it goes is
  // decided BEFORE it exists. Without `--show-private-key`: a typed usage refusal (exit 2; one JSON document in JSON
  // mode), no key, no address, no file. With it: the address, the snippet and the key — once, under a warning that it
  // is the only copy. The way out the refusal names, `accounts real generate --password-env`, is checked to be a real,
  // registered path whose encrypted keystore opens again with its password and holds the key of its address.
  describe("D1 · kaspa wallet create: the key goes where the user says, decided before anything is generated", () => {
    const networks: Array<[string, string[], RegExp]> = [
      ["simnet (the default)", [], /^kaspasim:q/],
      ["testnet-10", ["--network", "testnet-10"], /^kaspatest:q/],
      ["mainnet", ["--network", "mainnet"], /^kaspa:q/]
    ];
    const ADDRESS = /kaspa(sim|test)?:q[0-9a-z]{20,}/;
    // the workspace and HARDKAS_HOME (the hermetic gate's copy, inherited by the child) before and after a command
    const snapshot = () => ({
      ws: listTree(ws),
      home: process.env.HARDKAS_HOME && fs.existsSync(process.env.HARDKAS_HOME) ? listTree(process.env.HARDKAS_HOME) : []
    });

    for (const [label, netArgs] of networks) {
      it(`refuses by default on ${label}: exit 2, WALLET_KEY_OUTPUT_REQUIRED, no key, no address, nothing written`, () => {
        const before = snapshot();
        const r = run(["kaspa", "wallet", "create", "vault", ...netArgs], ws);
        const text = stripAnsi(r.all);
        expect({ exit: r.status, code: /WALLET_KEY_OUTPUT_REQUIRED/.test(text) }, r.all).toEqual({ exit: 2, code: true });
        expect(text).not.toMatch(HEX64);
        expect(text).not.toMatch(ADDRESS);
        expect(snapshot(), "no file or directory appeared in the workspace or in HARDKAS_HOME").toEqual(before);
      });
    }

    it("--json without the flag: exactly one JSON document (ok: false, the code), exit 2, no secret, nothing written", () => {
      const before = snapshot();
      const r = run(["kaspa", "wallet", "create", "vault", "--network", "mainnet", "--json"], ws);
      expect(r.status, r.all).toBe(2);
      const doc = JSON.parse(r.stdout.trim()); // a second document on stdout would break this parse
      expect(doc).toMatchObject({ ok: false, code: "WALLET_KEY_OUTPUT_REQUIRED" });
      expect(r.all).not.toMatch(HEX64);
      expect(r.all).not.toMatch(ADDRESS);
      expect(snapshot()).toEqual(before);
    });

    for (const [label, netArgs, prefix] of networks) {
      it(`--show-private-key on ${label}: the address, the snippet and the key printed once, after the warning; nothing written`, () => {
        const before = snapshot();
        const r = run(["kaspa", "wallet", "create", "vault", ...netArgs, "--show-private-key"], ws);
        const text = stripAnsi(r.all);
        expect(r.status, r.all).toBe(0);
        expect(/Address:\s+(\S+)/.exec(text)?.[1], text).toMatch(prefix);
        expect(text, "the config snippet").toContain("privateKeyEnv");
        expect(text.match(/[0-9a-f]{64}/gi) ?? [], "the key is printed exactly once").toHaveLength(1);
        expect(text).toMatch(/VAULT_PRIVATE_KEY=[0-9a-f]{64}/i);
        expect(text, "the warning: only copy, not recoverable by HardKAS").toMatch(/only copy/i);
        expect(text).toMatch(/cannot recover/i);
        expect(text.search(/only copy/i), "the warning comes before the key").toBeLessThan(text.search(/VAULT_PRIVATE_KEY=/));
        expect(snapshot(), "the key is handed over, never written").toEqual(before);
      });
    }

    it("--show-private-key --json: one document carrying the key (once), the warning on stderr, nothing written", () => {
      const before = snapshot();
      const r = run(["kaspa", "wallet", "create", "vault", "--network", "mainnet", "--show-private-key", "--json"], ws);
      expect(r.status, r.all).toBe(0);
      const doc = JSON.parse(r.stdout.trim());
      expect(doc).toMatchObject({
        ok: true,
        command: "kaspa wallet create",
        result: { name: "vault", network: "mainnet", privateKeyEnv: "VAULT_PRIVATE_KEY", persisted: false }
      });
      expect(doc.result.address).toMatch(/^kaspa:q/);
      expect(doc.result.privateKey).toMatch(/^[0-9a-f]{64}$/i);
      expect(r.all.split(doc.result.privateKey).length - 1, "the key appears exactly once: in the document").toBe(1);
      expect(stripAnsi(r.stderr), "the warning still reaches the user, on stderr").toMatch(/only copy/i);
      expect(snapshot()).toEqual(before);
    });

    it("the help says so: the key only with --show-private-key; nothing is saved", () => {
      const r = run(["kaspa", "wallet", "create", "--help"], ws);
      expect(r.status, r.all).toBe(0);
      expect(r.stdout).toMatch(/--show-private-key/);
      expect(r.stdout).toMatch(/nothing is saved/);
    });

    it("the way out the refusal names is real and recoverable: accounts real generate --password-env (mainnet) writes an encrypted keystore v2 the CLI opens again with the password, holding the key of that address; the key is never printed; the workspace passes the audit", async () => {
      const PW = "correct horse battery staple";
      const gen = run(["accounts", "real", "generate", "--name", "vault", "--network", "mainnet", "--password-env", "HK_SS2_PW", "--json"], ws, { HK_SS2_PW: PW });
      expect(gen.status, gen.all).toBe(0);
      const [entry] = JSON.parse(gen.stdout.trim());
      expect(entry).toMatchObject({ name: "vault", network: "mainnet", storage: "encrypted-keystore", unsafePlaintext: false, keystore: ".hardkas/keystore/vault.json" });
      expect(entry.address).toMatch(/^kaspa:q/);

      // the store holds a reference to the keystore, no key
      const store = fs.readFileSync(path.join(ws, ".hardkas", "accounts.real.json"), "utf8");
      expect(store).toContain('"keystoreRef"');
      expect(store).not.toMatch(/"privateKey"/);
      const keystore = JSON.parse(fs.readFileSync(path.join(ws, entry.keystore), "utf8"));
      expect(keystore).toMatchObject({
        type: "hardkas.encryptedKeystore.v2",
        version: "2.0.0",
        kdf: { algorithm: "argon2id" },
        cipher: { algorithm: "aes-256-gcm" },
        metadata: { address: entry.address, network: "mainnet" }
      });

      // the registered CLI path that opens it again: the right password verifies, a wrong one is refused
      const opened = run(["accounts", "real", "session-open", "vault", "--password-env", "HK_SS2_PW"], ws, { HK_SS2_PW: PW });
      expect({ exit: opened.status, verified: /verified/.test(opened.all) }, opened.all).toEqual({ exit: 0, verified: true });
      const wrong = run(["accounts", "real", "session-open", "vault", "--password-env", "HK_SS2_BAD"], ws, { HK_SS2_BAD: "not the password" });
      expect(wrong.status, wrong.all).not.toBe(0);

      // what the keystore gives back under the password is the private key of that very address
      const { KeystoreManager, loadKaspaWasm } = await import("@hardkas/accounts");
      const { getNetworkPrefix } = await import("@hardkas/core");
      const unlocked = await KeystoreManager.decryptEncryptedKeystore(keystore, PW);
      expect(unlocked.success, unlocked.error).toBe(true);
      expect(unlocked.payload?.address).toBe(entry.address);
      expect(unlocked.payload?.privateKey).toMatch(/^[0-9a-f]{64}$/i);
      const sdk = await loadKaspaWasm();
      const derived = new sdk.PrivateKey(unlocked.payload!.privateKey).toKeypair().toAddress(getNetworkPrefix("mainnet")).toString();
      expect(derived, "the decrypted key derives the stored address").toBe(entry.address);

      // never printed (AUD-21), and the encrypted account is what the auditor accepts (D2)
      expect(`${gen.all}\n${opened.all}\n${wrong.all}`).not.toContain(unlocked.payload!.privateKey);
      const audit = run(["security", "audit"], ws);
      expect(audit.status, audit.all).toBe(0);
    });
  });

  // D2 + D4 together (the reviewer's combined regression): the two families that defeated the auditor and the
  // redaction — whitespace around the separator and ANSI escape sequences around and inside the value — in one
  // file. A captured coloured console line is a real HardKAS artifact (`logs/` is searched; colours are on in every
  // Windows session). Findings name the file and the field, never the value, not even a fragment of it.
  describe("D2 + D4 · secrets obfuscated by whitespace and escape sequences are found, and never echoed", () => {
    const K = "0f1e2d3c4b5a69788796a5b4c3d2e1f0fedcba98765432100123456789abcdef"; // 64 hex, no repetition
    const ESC = "\x1b";
    const cases: Array<[string, string, string, RegExp]> = [
      [
        "a captured coloured console line: spaces around the colon, the value split by escapes",
        "logs/coloured-session.log",
        `  "privateKey"${ESC}[33m :${ESC}[39m   "${ESC}[37m${K.slice(0, 13)}${ESC}[0m${ESC}[1m${K.slice(13)}${ESC}[22m"\n`,
        /private key .*coloured-session\.log .*field "privateKey"/
      ],
      [
        "the .env line with spaces around = and a coloured value",
        "runs/r2/env-capture.txt",
        `export VAULT_PRIVATE_KEY ${ESC}[2m=${ESC}[22m ${ESC}[37m${K}${ESC}[39m\n`,
        /private key .*env-capture\.txt .*variable VAULT_PRIVATE_KEY/
      ],
      [
        "a serialised log: the textual \\u001b form around a mnemonic",
        "reports/serialised.json",
        JSON.stringify({ line: `${ESC}[37mmnemonic: ${WORDS12}${ESC}[39m` }),
        /mnemonic .*serialised\.json .*field "mnemonic"/
      ],
      [
        "an escape after every character of the key, tabs around the separator",
        ".hardkas/tabs.txt",
        `secretKey\t:\t${K.split("").join(`${ESC}[0m`)}\n`,
        /private key .*tabs\.txt .*field "secretKey"/
      ]
    ];

    for (const [name, rel, content, expectation] of cases) {
      it(`finds: ${name}`, () => {
        plant(rel, content);
        for (const args of [[], ["--json"]]) {
          const r = audit(args);
          expect({ exit: r.status, failed: /SECURITY_AUDIT_FAILED/.test(r.all) }, r.all).toEqual({ exit: 1, failed: true });
          // the finding: in the human report, or in the message of the one JSON envelope (decoded — the report's own
          // quotes around the field name are escaped inside the JSON text)
          const report = args.length ? String(JSON.parse(r.stdout.trim()).message) : r.all;
          expect(report, r.all).toMatch(expectation);
          expect(r.all, "never the value").not.toContain(K);
          for (let i = 0; i + 12 <= K.length; i += 4) {
            expect(r.all, `no fragment of the value either (${K.slice(i, i + 12)})`).not.toContain(K.slice(i, i + 12));
          }
          expect(r.all).not.toContain("abandon ability");
          expect(r.all, "the report carries no escape sequence").not.toMatch(/\x1b|\\u001b/);
        }
      });
    }

    it("passes: a coloured log without a secret (a txId under its name, an address, amounts)", () => {
      plant(
        "logs/ok.log",
        `  ${ESC}[32m✓${ESC}[39m txId: ${ESC}[37m${K}${ESC}[39m accepted\n  to ${ESC}[36mkaspa:qr9p3erdswuf0r3wvn9ufxq980ky589m7nvk2p6mmglhxj20j3025p8t8hpct${ESC}[39m ${ESC}[32m1.5 KAS${ESC}[39m\n`
      );
      const r = audit();
      expect(r.status, r.all).toBe(0);
    });
  });
});
