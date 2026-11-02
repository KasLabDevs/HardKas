import { Hono } from "hono";
import { getActiveSession } from "@hardkas/sessions";

export const metamaskRoutes = new Hono();

metamaskRoutes.get("/", (c) => {
  const active = getActiveSession();
  // Mirrors the built-in `local` L2 profile (Anvil, chain 31337). 19416 (Igra Caravel) is a sunset,
  // unverified chain ID and is no longer offered as the local network.
  return c.json({
    schema: "hardkas.metamaskLocal.v1",
    chainId: 31337,
    rpcUrl: "http://127.0.0.1:8545",
    sessionL2Address: active?.l2.address || null
  });
});
