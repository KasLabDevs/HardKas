// L1-CORE-1 B4 · accounts real session-close and change-password, on an encrypted account the CLI itself generated
// (`accounts real generate --network simnet --password-env OLD`). change-password reads its passwords only from a
// terminal prompt, so the child's stdin (a pipe) is presented as a terminal by a test preload and the prompts are
// answered; the change is then proven by `accounts real session-open`: the new password opens the keystore, the old one
// no longer does, the address is unchanged, and a wrong current password or a mismatched confirmation changes nothing.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { childEnv } from "./first-contact-helpers.js";
import { cli, cliAsync, jsonDocs, simulatedWorkspace, removeDir, snapshotFiles, tempDir } from "./helpers/l1-core-1-b4.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

const OLD = "b4-old-password-1";
const NEW = "b4-new-password-2";
const PASSWORDS = { HK_B4_OLD: OLD, HK_B4_NEW: NEW, HK_B4_WRONG: "b4-not-the-password" };

// Presents the child's stdin as a terminal, so its interactive password prompt runs on the pipe the test writes to.
const TTY_SHIM = `"use strict";
Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
process.stdin.setRawMode = function () { return process.stdin; };
`;

let parent: string;
let ws: string;
let tools: string;
let shim: string;
let account: any;
const keystore = () => path.join(ws, ".hardkas", "keystore", "x.json");

const sessionOpen = (envVar: keyof typeof PASSWORDS) =>
  cli(["accounts", "real", "session-open", "x", "--password-env", envVar], ws, { extra: PASSWORDS });

/** change-password through its three prompts (current, new, confirmation), answered as each appears. */
function changePassword(answers: [string, string, string]) {
  const env = childEnv(PASSWORDS);
  env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --require="${shim.split(path.sep).join("/")}"`.trim();
  const prompts = [/Enter current password/, /Enter new password/, /Confirm new password/];
  let next = 0;
  return cliAsync(["accounts", "real", "change-password", "x"], ws, {
    env,
    killAfterMs: 120_000,
    onStdout: (out, child) => {
      while (next < prompts.length && prompts[next]!.test(out)) {
        const answer = answers[next]!;
        next++;
        setTimeout(() => child.stdin!.write(`${answer}\r`), 100);
      }
    }
  });
}

beforeAll(() => {
  ({ parent, ws } = simulatedWorkspace("hk-b4-accounts-session-"));
  tools = tempDir("hk-b4-accounts-tools-");
  shim = path.join(tools, "tty-shim.cjs");
  fs.writeFileSync(shim, TTY_SHIM);
  const r = cli(["accounts", "real", "generate", "--name", "x", "--network", "simnet", "--password-env", "HK_B4_OLD", "--json"], ws, { extra: PASSWORDS });
  if (r.status !== 0) throw new Error(`accounts real generate failed (exit ${r.status}):\n${r.all.slice(0, 1500)}`);
  account = jsonDocs(r.stdout)[0]?.[0];
  if (account?.storage !== "encrypted-keystore") throw new Error(`not an encrypted account: ${r.stdout.slice(0, 600)}`);
});
afterAll(() => {
  removeDir(parent);
  removeDir(tools);
});

describe("accounts real session-close <name>", () => {
  it("exit 0, says the CLI keeps no session (nothing to clear), and changes nothing in the workspace", () => {
    const before = snapshotFiles(path.join(ws, ".hardkas"));
    const r = cli(["accounts", "real", "session-close", "x"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    expect(r.stdout).toMatch(/Account 'x' session clear \(redundant\)/);
    expect(r.stdout).toMatch(/The CLI is already stateless/);
    expect(snapshotFiles(path.join(ws, ".hardkas"))).toEqual(before);
  });

  it("after session-close the keystore still needs its password: it opens with it and refuses another", () => {
    cli(["accounts", "real", "session-close", "x"], ws);
    expect(sessionOpen("HK_B4_OLD").status).toBe(0);
    expect(sessionOpen("HK_B4_WRONG").status).not.toBe(0);
  });
});

describe("accounts real change-password <name>", () => {
  it("control: the generated keystore opens with the password it was created with, and with no other", () => {
    const ok = sessionOpen("HK_B4_OLD");
    expect(ok.status, ok.all.slice(0, 600)).toBe(0);
    expect(ok.stdout).toMatch(/Access to account 'x' verified/);
    expect(sessionOpen("HK_B4_NEW").status).not.toBe(0);
  });

  it("a wrong current password: the change fails and the keystore is byte-identical", async () => {
    const before = fs.readFileSync(keystore(), "utf8");
    const r = await changePassword([PASSWORDS.HK_B4_WRONG, NEW, NEW]);
    expect(r.killed, r.all.slice(-800)).toBe(false);
    expect(r.status, r.all.slice(-800)).not.toBe(0);
    expect(r.stdout).not.toMatch(/Successfully changed password/);
    expect(fs.readFileSync(keystore(), "utf8")).toBe(before);
  });

  it("a confirmation that differs from the new password: refused, the keystore byte-identical", async () => {
    const before = fs.readFileSync(keystore(), "utf8");
    const r = await changePassword([OLD, NEW, `${NEW}-typo`]);
    expect(r.killed, r.all.slice(-800)).toBe(false);
    expect(r.status, r.all.slice(-800)).not.toBe(0);
    expect(r.all).toMatch(/New passwords do not match/);
    expect(fs.readFileSync(keystore(), "utf8")).toBe(before);
  });

  it("the real change: afterwards the new password opens the keystore, the old one no longer does, same address", async () => {
    const r = await changePassword([OLD, NEW, NEW]);
    expect(r.killed, r.all.slice(-800)).toBe(false);
    expect(r.status, r.all.slice(-800)).toBe(0);
    expect(r.stdout).toMatch(/Successfully changed password for account 'x'/);

    const withNew = sessionOpen("HK_B4_NEW");
    expect(withNew.status, withNew.all.slice(0, 600)).toBe(0);
    expect(withNew.stdout).toMatch(/Access to account 'x' verified/);
    expect(sessionOpen("HK_B4_OLD").status).not.toBe(0);
    expect(JSON.parse(fs.readFileSync(keystore(), "utf8")).metadata?.address).toBe(account.address);
  });

  // L1-CORE-1 B4 (was a known gap): change-password had no non-interactive password input, and its error named options
  // it rejected. --password-env / --password-stdin give the current password, --new-password-env the new one.
  it("without a terminal it takes the current and new passwords from environment variables, as generate and session-open do", () => {
    const r = cli(["accounts", "real", "change-password", "x", "--password-env", "HK_B4_NEW", "--new-password-env", "HK_B4_OLD"], ws, { extra: PASSWORDS });
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    expect(sessionOpen("HK_B4_OLD").status).toBe(0);
    expect(sessionOpen("HK_B4_NEW").status).not.toBe(0);
    expect(JSON.parse(fs.readFileSync(keystore(), "utf8")).metadata?.address).toBe(account.address);
  });

  it("without a terminal and without --new-password-env: KEYSTORE_PASSWORD_REQUIRED naming that option, before anything is read; the keystore byte-identical", () => {
    const before = fs.readFileSync(keystore(), "utf8");
    for (const args of [["--password-env", "HK_B4_OLD"], ["--password-stdin"]]) {
      const r = cli(["accounts", "real", "change-password", "x", ...args], ws, { extra: PASSWORDS });
      expect(r.status, r.all.slice(0, 600)).not.toBe(0);
      expect(r.all, args.join(" ")).toMatch(/KEYSTORE_PASSWORD_REQUIRED/);
      expect(r.all, args.join(" ")).toMatch(/--new-password-env/);
      expect(fs.readFileSync(keystore(), "utf8")).toBe(before);
    }
  });
});
