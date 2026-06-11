import { Hono } from "hono";
import { listDevAccountsSync } from "@hardkas/accounts";

export const devAccountsRoutes = new Hono();

devAccountsRoutes.get("/", async (c) => {
  try {
    const workspaceRoot = process.cwd();
    const accounts = listDevAccountsSync(workspaceRoot);

    return c.json({
      ok: true,
      data: accounts
    });
  } catch (e: unknown) {
    return c.json({ ok: false, error: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) }, 500);
  }
});
