import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadSessionStore, loadSessionStoreStrict, createSession, setActiveSession, getActiveSession } from "../src/store.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Session Store", () => {
  const tempDir = path.join(os.tmpdir(), `hardkas-test-sessions-${Math.random().toString(36).slice(2)}`);

  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("creates and loads a session", async () => {
    const session = {
      schema: "hardkas.session.v1" as const,
      name: "test-session",
      l1: { wallet: "alice", address: "addr1" },
      l2: { account: "alice-l2", address: "addr2" },
      bridge: { mode: "local-simulated" as const },
      createdAt: new Date().toISOString()
    };

    await createSession(session, tempDir);
    const store = loadSessionStore(tempDir);
    
    expect(store.sessions["test-session"]).toEqual(session);
    expect(store.activeSession).toBe("test-session");
  });

  it("preserves existing sessions when adding another", async () => {
    const s1 = { name: "s1", schema: "hardkas.session.v1" as const, l1: { wallet: "w1" }, l2: { account: "a1" }, bridge: { mode: "local-simulated" as const }, createdAt: "t" };
    const s2 = { name: "s2", schema: "hardkas.session.v1" as const, l1: { wallet: "w2" }, l2: { account: "a2" }, bridge: { mode: "local-simulated" as const }, createdAt: "t" };

    await createSession(s1, tempDir);
    await createSession(s2, tempDir);
    
    const store = loadSessionStore(tempDir);
    expect(Object.keys(store.sessions)).toHaveLength(2);
    expect(store.sessions["s1"]).toBeDefined();
    expect(store.sessions["s2"]).toBeDefined();
  });

  it("sets and gets active session", async () => {
    const s1 = { name: "s1", schema: "hardkas.session.v1" as const, l1: { wallet: "w1" }, l2: { account: "a1" }, bridge: { mode: "local-simulated" as const }, createdAt: "t" };
    const s2 = { name: "s2", schema: "hardkas.session.v1" as const, l1: { wallet: "w2" }, l2: { account: "a2" }, bridge: { mode: "local-simulated" as const }, createdAt: "t" };

    await createSession(s1, tempDir);
    await createSession(s2, tempDir);
    
    await setActiveSession("s2", tempDir);
    expect(getActiveSession(tempDir)?.name).toBe("s2");
    
    await setActiveSession("s1", tempDir);
    expect(getActiveSession(tempDir)?.name).toBe("s1");
  });

  it("handles corrupted JSON safely (returns empty store)", () => {
    const sessionFile = path.join(tempDir, ".hardkas", "sessions.json");
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.writeFileSync(sessionFile, "not-json");
    
    const store = loadSessionStore(tempDir);
    expect(store.sessions).toEqual({});
  });

  it("protects against concurrent creation", async () => {
    // Simulate multiple concurrent createSession calls
    const sessions = Array.from({ length: 5 }, (_, i) => ({
      name: `concurrent-${i}`,
      schema: "hardkas.session.v1" as const,
      l1: { wallet: "w" },
      l2: { account: "a" },
      bridge: { mode: "local-simulated" as const },
      createdAt: "t"
    }));

    // Run them in parallel
    await Promise.all(sessions.map(s => createSession(s, tempDir)));

    const store = loadSessionStore(tempDir);
    expect(Object.keys(store.sessions)).toHaveLength(5);
    sessions.forEach(s => {
      expect(store.sessions[s.name]).toBeDefined();
    });
  });

  it("loadSessionStoreStrict throws an error on corrupted session store data", () => {
    const sessionFile = path.join(tempDir, ".hardkas", "sessions.json");
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.writeFileSync(sessionFile, "not-json");
    
    expect(() => loadSessionStoreStrict(tempDir)).toThrow("Invalid session store");
  });

  it("mutating operations refuse to overwrite a corrupted sessions file and throw a validation error", async () => {
    const sessionFile = path.join(tempDir, ".hardkas", "sessions.json");
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.writeFileSync(sessionFile, "not-json");

    const newSession = {
      name: "new-session",
      schema: "hardkas.session.v1" as const,
      l1: { wallet: "w" },
      l2: { account: "a" },
      bridge: { mode: "local-simulated" as const },
      createdAt: "t"
    };

    await expect(createSession(newSession, tempDir)).rejects.toThrow("Invalid session store");
    // Verify file was NOT overwritten with empty store containing the new session
    const fileContent = fs.readFileSync(sessionFile, "utf-8");
    expect(fileContent).toBe("not-json");
  });
});
