import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadSessionStoreWithDiagnostics, SESSION_FILE } from "../src/store.js";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

describe("Session Schema Validation", () => {
  const tempDir = join(os.tmpdir(), `hardkas-sessions-val-${Date.now()}`);

  beforeEach(() => {
    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
    if (!existsSync(join(tempDir, ".hardkas"))) mkdirSync(join(tempDir, ".hardkas"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("passes for a valid session store", () => {
    const validStore = {
      activeSession: "s1",
      sessions: {
        s1: {
          schema: "hardkas.session.v1",
          name: "s1",
          l1: { wallet: "w1" },
          l2: { account: "a1" },
          bridge: { mode: "local-simulated" },
          createdAt: "t"
        }
      }
    };
    writeFileSync(join(tempDir, SESSION_FILE), JSON.stringify(validStore));

    const { store, diagnostics } = loadSessionStoreWithDiagnostics(tempDir);
    expect(diagnostics).toHaveLength(0);
    expect(store.activeSession).toBe("s1");
  });

  it("warns for malformed JSON", () => {
    writeFileSync(join(tempDir, SESSION_FILE), "not json");
    const { diagnostics } = loadSessionStoreWithDiagnostics(tempDir);
    expect(diagnostics).toContain("Malformed JSON in .hardkas/sessions.json");
  });

  it("warns for missing sessions object", () => {
    writeFileSync(join(tempDir, SESSION_FILE), JSON.stringify({ activeSession: "s1" }));
    const { diagnostics } = loadSessionStoreWithDiagnostics(tempDir);
    expect(diagnostics).toContain("Session store missing 'sessions' object");
  });

  it("warns for invalid active session reference", () => {
    const store = {
      activeSession: "missing",
      sessions: {
        s1: {
          schema: "hardkas.session.v1",
          name: "s1",
          l1: { wallet: "w1" },
          l2: { account: "a1" },
          bridge: { mode: "local-simulated" },
          createdAt: "t"
        }
      }
    };
    writeFileSync(join(tempDir, SESSION_FILE), JSON.stringify(store));
    const { diagnostics } = loadSessionStoreWithDiagnostics(tempDir);
    expect(diagnostics).toContain("Active session 'missing' not found in sessions list");
  });

  it("warns for invalid schema version in individual sessions", () => {
    const store = {
      sessions: {
        s1: {
          schema: "hardkas.session.v0", // Wrong version
          name: "s1",
          l1: { wallet: "w1" },
          l2: { account: "a1" },
          bridge: { mode: "local-simulated" },
          createdAt: "t"
        }
      }
    };
    writeFileSync(join(tempDir, SESSION_FILE), JSON.stringify(store));
    const { diagnostics } = loadSessionStoreWithDiagnostics(tempDir);
    expect(diagnostics).toContain("Session 's1' has invalid or missing schema version");
  });

  it("warns for missing L1/L2 configuration", () => {
    const store = {
      sessions: {
        s1: {
          schema: "hardkas.session.v1",
          name: "s1",
          // missing l1/l2
          bridge: { mode: "local-simulated" },
          createdAt: "t"
        }
      }
    };
    writeFileSync(join(tempDir, SESSION_FILE), JSON.stringify(store));
    const { diagnostics } = loadSessionStoreWithDiagnostics(tempDir);
    expect(diagnostics).toContain("Session 's1' missing L1 wallet configuration");
    expect(diagnostics).toContain("Session 's1' missing L2 account configuration");
  });
});
