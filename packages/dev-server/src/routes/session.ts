import { Hono } from "hono";
import { loadSessionStoreWithDiagnostics } from "@hardkas/sessions";

export const sessionRoutes = new Hono();

sessionRoutes.get("/", (c) => {
  const { store, diagnostics } = loadSessionStoreWithDiagnostics();
  const active = store.activeSession ? store.sessions[store.activeSession] : null;
  return c.json({
    active: active
      ? {
          name: active.name,
          l1: active.l1,
          l2: active.l2,
          bridge: active.bridge
        }
      : null,
    diagnostics
  });
});

sessionRoutes.get("/list", (c) => {
  const { store, diagnostics } = loadSessionStoreWithDiagnostics();
  if (diagnostics.length > 0) {
    console.warn("⚠️  Session Store Warnings:", diagnostics);
  }
  const list = Object.values(store.sessions).map((s) => ({
    name: s.name,
    l1: { wallet: s.l1.wallet, address: s.l1.address },
    l2: { account: s.l2.account, address: s.l2.address }
  }));
  return c.json({ sessions: list, diagnostics });
});

/**
 * A7 (rc2 audit): what a session operation that is not implemented answers. `/start`, `/snapshot`, `/time-travel`,
 * `/export` and `/import` used to answer `ok: true` with invented ids ("sess_<now>", "snap_<now>", "view_<now>",
 * `exported: true, content: {}`, `imported: true`) although nothing was created, stored, exported or imported. They now
 * say so: HTTP 501, `ok: false`, SESSION_OPERATION_UNSUPPORTED, `data.status: "unsupported"` (as `/replay` does).
 */
function unsupported(c: any, operation: string, reason: string) {
  return c.json(
    {
      ok: false,
      code: "SESSION_OPERATION_UNSUPPORTED",
      error: `Session ${operation} is not implemented in this dev server: ${reason} Nothing was changed.`,
      data: { status: "unsupported", operation, reason },
      warnings: [],
      meta: { network: "simulated" }
    },
    501
  );
}

sessionRoutes.post("/start", async (c) => {
  return unsupported(c, "start", "no session context is created.");
});

sessionRoutes.post("/snapshot", async (c) => {
  return unsupported(c, "snapshot", "no SessionSnapshot artifact is written.");
});

// Wave 1.5 · AUD-14: a verdict is reported only when something computed it. Session-level
// replay and divergence classification are not implemented, so these routes say so
// (honest states: passed | diverged | missing_dependency | unsupported | policy_mismatch |
// non_deterministic) instead of returning a fixed "passed"/"diverged".
sessionRoutes.post("/replay", async (c) => {
  return c.json({
    ok: true,
    data: {
      status: "unsupported",
      reason: "session-level replay is not implemented; replay a receipt with POST /api/artifacts/:id/replay"
    },
    warnings: [],
    meta: { network: "simulated" }
  });
});

sessionRoutes.post("/diff-replay/:id", async (c) => {
  return c.json({
    ok: true,
    data: {
      status: "unsupported",
      divergenceClassifications: [],
      details: [],
      reason: "divergence classification is not implemented; POST /api/artifacts/:id/replay reports the divergences the replay computed"
    },
    warnings: [],
    meta: { network: "simulated" }
  });
});

sessionRoutes.post("/time-travel", async (c) => {
  return unsupported(c, "time-travel", "no historical view or sandbox is created.");
});

sessionRoutes.get("/export", async (c) => {
  return unsupported(c, "export", "no runtime state is exported (it used to answer an empty `content: {}` as an export).");
});

sessionRoutes.post("/import", async (c) => {
  return unsupported(c, "import", "no state is imported.");
});
