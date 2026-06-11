import { Hono } from "hono";
import { simulatePrefixMining } from "@hardkas/bridge-local";

export const bridgeRoutes = new Hono();

bridgeRoutes.post("/simulate", async (c) => {
  const body = await c.req.json();
  const { payload, prefix } = body;

  if (!payload || !prefix) {
    return c.json({ error: "Missing payload or prefix" }, 400);
  }

  try {
    const result = simulatePrefixMining(payload, prefix, { timeoutMs: 10000 });
    return c.json({ status: "success", result });
  } catch (e: unknown) {
    return c.json({ status: "error", error: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) }, 500);
  }
});
