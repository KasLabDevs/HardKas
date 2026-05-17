import { Hono } from "hono";

export const healthRoutes = new Hono();

healthRoutes.get("/", async (c) => {
  // Simple check for now, can be expanded with real RPC calls
  return c.json({
    status: "ok",
    services: {
      kaspa: { status: "unknown", url: "http://127.0.0.1:16110" },
      igra: { status: "unknown", url: "http://127.0.0.1:8545" }
    }
  });
});
