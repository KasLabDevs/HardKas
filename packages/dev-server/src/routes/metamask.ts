import { Hono } from "hono";
import { getActiveSession } from "@hardkas/sessions";

export const metamaskRoutes = new Hono();

metamaskRoutes.get("/", (c) => {
  const active = getActiveSession();
  return c.json({
    schema: "hardkas.metamaskLocal.v1",
    chainId: 19416,
    rpcUrl: "http://127.0.0.1:8545",
    sessionL2Address: active?.l2.address || null
  });
});
