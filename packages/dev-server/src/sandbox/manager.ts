import { EventEmitter } from "node:events";

export type SandboxConnection = {
  id: string;
  createdAt: number;
  status: "pending" | "paired" | "expired" | "disconnected";
  sessionName?: string;
  l1Address?: string;
  l2Address?: `0x${string}`;
  transport: "local-sandbox";
  expiresAt: number;
};

class SandboxManager extends EventEmitter {
  private sessions: Map<string, SandboxConnection> = new Map();

  createSession(): SandboxConnection {
    const id = Math.random().toString(36).substring(2, 10);
    const session: SandboxConnection = {
      id,
      createdAt: Date.now(),
      status: "pending",
      transport: "local-sandbox",
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    };
    this.sessions.set(id, session);
    this.emit("created", session);
    return session;
  }

  pairSession(id: string, l1Address?: string, l2Address?: `0x${string}`): SandboxConnection | null {
    const session = this.sessions.get(id);
    if (!session || session.status !== "pending") return null;

    session.status = "paired";
    if (l1Address) session.l1Address = l1Address;
    if (l2Address) session.l2Address = l2Address;
    
    this.emit("paired", session);
    return session;
  }

  disconnectSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;

    session.status = "disconnected";
    this.emit("disconnected", session);
    this.sessions.delete(id);
    return true;
  }

  getSessions(): SandboxConnection[] {
    // Cleanup expired
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt < now) {
        session.status = "expired";
        this.emit("expired", session);
        this.sessions.delete(id);
      }
    }
    return Array.from(this.sessions.values());
  }
}

export const sandboxManager = new SandboxManager();
