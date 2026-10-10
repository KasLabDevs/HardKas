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
//        explicit action (the contract is the reviewer's to decide; this test pins only "not by default").
//  SS2-C HARDKAS_DEV_TOKEN · `env check` prints the dev server's access token in clear, human and `--json`.
//  SS2-D ANSI bypass · with colours on (picocolors: every win32 process unless NO_COLOR is set), `kaspa doctor
//        --rpc-url http://user:pw@…` prints the URL's password: the value is coloured before the console guard sees it,
//        and the redaction's `\b` never matches after an escape sequence's "m".
// Controls (green before and after): a clean workspace passes the audit; the documented `privateKeyRef` exemption of
// dev-account configs holds; with colours off the doctor's URL is redacted.

const HEX64 = /[0-9a-f]{64}/i;
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
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
    it("kaspa wallet create <name> --network mainnet prints the address and the config snippet, never the key", () => {
      const r = run(["kaspa", "wallet", "create", "vault", "--network", "mainnet"], ws);
      const text = stripAnsi(r.all);
      expect(r.status, r.all).toBe(0);
      expect(text, "the address is still shown").toMatch(/Address:\s+kaspa:q[0-9a-z]+/);
      expect(text, "the config snippet is still shown").toContain("privateKeyEnv");
      expect(text, "no 64-hex value (the private key) in stdout or stderr").not.toMatch(HEX64);
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
  });
});
