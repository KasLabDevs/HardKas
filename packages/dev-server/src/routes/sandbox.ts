import { Hono } from "hono";
import { sandboxManager } from "../sandbox/manager.js";
import { getActiveSession } from "@hardkas/sessions";
import { devServerEmitter } from "../stream.js";

export const sandboxRoutes = new Hono();

// Subscribe manager events to SSE broadcast
sandboxManager.on("created", (s) => devServerEmitter.emit("sandbox-session-created", s));
sandboxManager.on("paired", (s) => devServerEmitter.emit("sandbox-session-paired", s));
sandboxManager.on("expired", (s) => devServerEmitter.emit("sandbox-session-expired", s));
sandboxManager.on("disconnected", (s) => devServerEmitter.emit("sandbox-session-disconnected", s));

sandboxRoutes.get("/sessions", (c) => {
  return c.json({ sessions: sandboxManager.getSessions() });
});

sandboxRoutes.post("/create", (c) => {
  const session = sandboxManager.createSession();
  return c.json(session);
});

sandboxRoutes.post("/pair", async (c) => {
  const { id } = await c.req.json();
  const active = getActiveSession();
  
  // Simulate mobile approval using active CLI session if available
  const paired = sandboxManager.pairSession(
    id, 
    active?.l1.address, 
    active?.l2.address as `0x${string}`
  );
  
  if (!paired) return c.json({ error: "Session not found or already paired" }, 404);
  return c.json(paired);
});

sandboxRoutes.post("/disconnect", async (c) => {
  const { id } = await c.req.json();
  const success = sandboxManager.disconnectSession(id);
  return c.json({ success });
});
