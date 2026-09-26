import { describe, it, expect } from "vitest";
import util from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createEmptyRealAccountStore,
  importRealDevAccount,
  saveRealAccountStore,
  loadRealAccountStoreSync,
  redactAccountForLog,
  attachInspectRedactor,
  listHardkasAccounts
} from "../src";
import { maskSecrets } from "@hardkas/core";

// SENTINEL: A 64-hex string that cannot be a real key by construction
// (uniform 'de' bytes) but matches the private-key shape regex.
// Different from any RFC test vector and any historical HardKAS fixture key.
const SENTINEL_PRIVATE_KEY = "de".repeat(32); // 64 hex chars
const SENTINEL_ADDRESS = "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn";
const SENTINEL_KEYSTORE_REF = ".hardkas/keystore/SENTINEL_UNIQUE_NAME_FOR_SEC1.json";
const SENTINEL_KEY_ENV = "SENTINEL_UNIQUE_ENV_VAR_NAME";

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hk-sec1-"));
}

describe("SEC-1 · redactAccountForLog — pure secret-mask boundary", () => {
  it("strips privateKey, privateKeyEnv, and keystoreRef", () => {
    const a = {
      name: "alice",
      address: SENTINEL_ADDRESS,
      privateKey: SENTINEL_PRIVATE_KEY,
      privateKeyEnv: SENTINEL_KEY_ENV,
      keystoreRef: SENTINEL_KEYSTORE_REF,
      createdAt: "2026-09-17T00:00:00.000Z"
    };
    const red = redactAccountForLog(a);
    expect(red.name).toBe("alice");
    expect(red.address).toBe(SENTINEL_ADDRESS);
    expect(red.privateKey).toBe("[REDACTED]");
    expect(red.privateKeyEnv).toBe("[REDACTED]");
    expect(red.keystoreRef).toBe("[REDACTED]");
    expect(red.createdAt).toBe("2026-09-17T00:00:00.000Z");
  });

  it("does not redact absent fields", () => {
    const a = { name: "n", address: SENTINEL_ADDRESS, createdAt: "x" };
    const red = redactAccountForLog(a as any);
    expect((red as any).privateKey).toBeUndefined();
    expect((red as any).privateKeyEnv).toBeUndefined();
  });

  it("SENTINEL must not appear anywhere in the redacted stringification", () => {
    const a = { name: "alice", privateKey: SENTINEL_PRIVATE_KEY };
    const s = JSON.stringify(redactAccountForLog(a));
    expect(s.includes(SENTINEL_PRIVATE_KEY)).toBe(false);
    expect(s.includes("[REDACTED]")).toBe(true);
  });
});

describe("SEC-1 · attachInspectRedactor — util.inspect / console.log boundary", () => {
  it("console.log-style util.inspect must not surface SENTINEL", () => {
    const a: any = {
      name: "alice",
      address: SENTINEL_ADDRESS,
      privateKey: SENTINEL_PRIVATE_KEY
    };
    attachInspectRedactor(a);
    const inspected = util.inspect(a);
    expect(inspected.includes(SENTINEL_PRIVATE_KEY)).toBe(false);
    expect(inspected.includes("[REDACTED]")).toBe(true);
  });

  it("redactor is defense-in-depth — raw property access still returns the secret for internal signing", () => {
    const a: any = {
      name: "alice",
      privateKey: SENTINEL_PRIVATE_KEY
    };
    attachInspectRedactor(a);
    // Raw property access remains unchanged — needed by signing code paths.
    expect(a.privateKey).toBe(SENTINEL_PRIVATE_KEY);
  });

  it("nested error object with account cause does not leak SENTINEL via default formatter", () => {
    const a: any = { name: "alice", privateKey: SENTINEL_PRIVATE_KEY };
    attachInspectRedactor(a);
    const err = new Error("account failure");
    (err as any).account = a;
    const formatted = util.inspect(err, { depth: 4 });
    expect(formatted.includes(SENTINEL_PRIVATE_KEY)).toBe(false);
  });

  it("array of accounts stringifies each with redaction", () => {
    const list: any[] = [
      { name: "alice", privateKey: SENTINEL_PRIVATE_KEY },
      { name: "bob", privateKey: SENTINEL_PRIVATE_KEY }
    ];
    for (const a of list) attachInspectRedactor(a);
    const inspected = util.inspect(list);
    // Sentinel must not appear ANYWHERE, not even once.
    expect(inspected.includes(SENTINEL_PRIVATE_KEY)).toBe(false);
  });
});

describe("SEC-1 · loadRealAccountStoreSync automatically attaches redactors", () => {
  it("accounts loaded from disk are self-redacting in console output", () => {
    const dir = mkTmp();
    const filePath = path.join(dir, ".hardkas", "accounts.real.json");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const store = createEmptyRealAccountStore();
    const with1 = importRealDevAccount(store, {
      name: "alice",
      address: SENTINEL_ADDRESS,
      privateKey: SENTINEL_PRIVATE_KEY
    });
    fs.writeFileSync(filePath, JSON.stringify(with1, null, 2));

    const loaded = loadRealAccountStoreSync({ path: filePath });
    expect(loaded === null).toBe(false);
    const acc = loaded!.accounts[0]!;

    // 1) console.log output does not contain SENTINEL
    const inspected = util.inspect(acc);
    expect(inspected.includes(SENTINEL_PRIVATE_KEY)).toBe(false);

    // 2) Raw property still works for signing paths
    expect((acc as any).privateKey).toBe(SENTINEL_PRIVATE_KEY);

    // 3) SENTINEL is on disk (legitimate — the store owns encrypted-mode transition
    //    but plaintext legacy is preserved). The boundary is LOG output, not disk.
    const onDisk = fs.readFileSync(filePath, "utf-8");
    expect(onDisk.includes(SENTINEL_PRIVATE_KEY)).toBe(true);
  });
});

describe("SEC-1 · maskSecrets fallback still redacts SENTINEL in strings", () => {
  it("64-hex sentinel is masked when surfaced through message strings", () => {
    const msg = `unexpected error mentioning ${SENTINEL_PRIVATE_KEY} in text`;
    const masked = maskSecrets(msg);
    expect(masked.includes(SENTINEL_PRIVATE_KEY)).toBe(false);
    expect(masked.includes("[REDACTED]")).toBe(true);
  });

  it("object with privateKey key is masked recursively", () => {
    const obj = { level1: { account: { name: "x", privateKey: SENTINEL_PRIVATE_KEY } } };
    const masked = maskSecrets(obj);
    expect(JSON.stringify(masked).includes(SENTINEL_PRIVATE_KEY)).toBe(false);
    expect((masked as any).level1.account.privateKey).toBe("[REDACTED]");
  });
});

describe("SEC-1 · resolveHardkasAccount does not leak SENTINEL to stderr on collision", () => {
  it("captured stderr contains no SENTINEL when a cross-world collision fires", () => {
    // Redirect stderr into a buffer for the duration of this test.
    const chunks: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as any).write = ((data: any, ...rest: any[]) => {
      chunks.push(typeof data === "string" ? data : (data as Buffer).toString("utf-8"));
      return true;
    }) as any;

    let thrown: unknown;
    try {
      // Build a config that collides with the deterministic dev "alice".
      // The stock listHardkasAccounts populates 'alice' as synthetic; we declare
      // 'alice' as kaspa in config → CrossWorldAccountCollisionError.
      const config: any = {
        accounts: {
          alice: {
            kind: "kaspa",
            network: "simnet",
            address: SENTINEL_ADDRESS,
            privateKey: SENTINEL_PRIVATE_KEY
          }
        }
      };
      try {
        // Force `alice` to be populated as synthetic (target mode = simulator)
        // while the config declares it as kaspa → CrossWorldAccountCollisionError.
        listHardkasAccounts(config, {
          mode: "simulator",
          domain: "kaspa-l1",
          network: "simulated"
        } as any);
      } catch (e) {
        thrown = e;
      }
    } finally {
      (process.stderr as any).write = origWrite;
    }

    const captured = chunks.join("");
    // The SENTINEL private key must NEVER reach stderr, even during a collision throw.
    expect(captured.includes(SENTINEL_PRIVATE_KEY)).toBe(false);
    // The throw itself is expected — the test asserts the log boundary, not error absence.
    expect(thrown).toBeDefined();
  });
});
