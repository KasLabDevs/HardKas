import { HardkasSession, SessionStore } from "./types.js";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic, withLock } from "@hardkas/core";

export const SESSION_FILE = ".hardkas/sessions.json";

export function loadSessionStore(cwd: string = process.cwd()): SessionStore {
  const { store } = loadSessionStoreWithDiagnostics(cwd);
  return store;
}

export function loadSessionStoreStrict(cwd: string = process.cwd()): SessionStore {
  const { store, diagnostics } = loadSessionStoreWithDiagnostics(cwd);
  if (diagnostics.length > 0) {
    throw new Error(`Invalid session store: ${diagnostics.join("; ")}`);
  }
  return store;
}

export function loadSessionStoreWithDiagnostics(cwd: string = process.cwd()): { store: SessionStore; diagnostics: string[] } {
  const path = join(cwd, SESSION_FILE);
  if (!existsSync(path)) {
    return { store: { sessions: {} }, diagnostics: [] };
  }

  let raw: any;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    return { store: { sessions: {} }, diagnostics: [`Malformed JSON in ${SESSION_FILE}`] };
  }

  const diagnostics: string[] = [];
  
  // Basic structural validation
  if (!raw || typeof raw !== "object") {
    diagnostics.push("Session store must be a JSON object");
    return { store: { sessions: {} }, diagnostics };
  }

  if (!raw.sessions || typeof raw.sessions !== "object") {
    diagnostics.push("Session store missing 'sessions' object");
    return { store: { sessions: {} }, diagnostics };
  }

  // Active session validation
  if (raw.activeSession && !raw.sessions[raw.activeSession]) {
    diagnostics.push(`Active session '${raw.activeSession}' not found in sessions list`);
  }

  // Validate individual sessions
  for (const [name, session] of Object.entries(raw.sessions)) {
    const s = session as any;
    if (s.schema !== "hardkas.session.v1") {
      diagnostics.push(`Session '${name}' has invalid or missing schema version`);
    }
    if (!s.l1 || !s.l1.wallet) {
      diagnostics.push(`Session '${name}' missing L1 wallet configuration`);
    }
    if (!s.l2 || !s.l2.account) {
      diagnostics.push(`Session '${name}' missing L2 account configuration`);
    }
    if (!s.bridge || !s.bridge.mode) {
      diagnostics.push(`Session '${name}' missing bridge configuration`);
    }
  }

  return { store: raw as SessionStore, diagnostics };
}

export async function saveSessionStore(store: SessionStore, cwd: string = process.cwd()) {
  const path = join(cwd, SESSION_FILE);
  const dir = join(cwd, ".hardkas");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  await writeFileAtomic(path, JSON.stringify(store, null, 2), {
    fsyncParent: true
  });
}

export async function createSession(session: HardkasSession, cwd: string = process.cwd()) {
  await withLock({ rootDir: cwd, name: "workspace", wait: true, timeoutMs: 5000 }, async () => {
    const store = loadSessionStoreStrict(cwd);
    const newStore = {
      ...store,
      sessions: {
        ...store.sessions,
        [session.name]: session
      },
      activeSession: store.activeSession || session.name
    };
    await saveSessionStore(newStore, cwd);
  });
}

export async function setActiveSession(name: string, cwd: string = process.cwd()) {
  await withLock({ rootDir: cwd, name: "workspace", wait: true, timeoutMs: 5000 }, async () => {
    const store = loadSessionStoreStrict(cwd);
    if (!store.sessions[name]) {
      throw new Error(`Session "${name}" not found.`);
    }
    const newStore = { ...store, activeSession: name };
    await saveSessionStore(newStore, cwd);
  });
}

export function getActiveSession(cwd: string = process.cwd()): HardkasSession | undefined {
  const store = loadSessionStore(cwd);
  if (!store.activeSession) return undefined;
  return store.sessions[store.activeSession];
}
