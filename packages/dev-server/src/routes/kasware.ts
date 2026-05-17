import { Hono } from "hono";
import { getActiveSession } from "@hardkas/sessions";

export const kaswareRoutes = new Hono();

kaswareRoutes.get("/", (c) => {
  const active = getActiveSession();
  return c.json({
    schema: "hardkas.kaswareLocal.v1",
    expectedNetwork: "simnet", // Hardcoded for dev runtime
    sessionL1Address: active?.l1.address || null,
    localOnly: true
  });
});
