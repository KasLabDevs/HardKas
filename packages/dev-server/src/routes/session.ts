import { Hono } from "hono";
import { loadSessionStoreWithDiagnostics } from "@hardkas/sessions";

export const sessionRoutes = new Hono();

sessionRoutes.get("/", (c) => {
  const { store, diagnostics } = loadSessionStoreWithDiagnostics();
  const active = store.activeSession ? store.sessions[store.activeSession] : null;
  return c.json({
    active: active ? {
      name: active.name,
      l1: active.l1,
      l2: active.l2,
      bridge: active.bridge
    } : null,
    diagnostics
  });
});

sessionRoutes.get("/list", (c) => {
  const { store, diagnostics } = loadSessionStoreWithDiagnostics();
  if (diagnostics.length > 0) {
    console.warn("⚠️  Session Store Warnings:", diagnostics);
  }
  const list = Object.values(store.sessions).map(s => ({
    name: s.name,
    l1: { wallet: s.l1.wallet, address: s.l1.address },
    l2: { account: s.l2.account, address: s.l2.address }
  }));
  return c.json({ sessions: list, diagnostics });
});
