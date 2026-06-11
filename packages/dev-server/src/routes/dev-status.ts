import { Hono } from "hono";
import { Hardkas } from "@hardkas/sdk";
import { listHardkasAccounts } from "@hardkas/accounts";

type DevEnv = { Variables: { sdk: Hardkas } };
export const devStatusRoutes = new Hono<DevEnv>();

function envelope(c: any, ok: boolean, data?: any, error?: any) {
  const sdk = c.get("sdk");
  return c.json(
    {
      ok,
      data,
      error,
      warnings: [],
      meta: {
        workspace: sdk?.cwd || process.cwd(),
        network: sdk?.network || "simulated"
      }
    },
    ok ? 200 : error?.code === "BAD_REQUEST" ? 400 : 500
  );
}

devStatusRoutes.use("*", async (c, next) => {
  try {
    const sdk = await Hardkas.create({ cwd: process.env.HARDKAS_ROOT || process.cwd() });
    c.set("sdk", sdk);
    await next();
  } catch (e: unknown) {
    return c.json(
      {
        ok: false,
        error: {
          code: "HARDKAS_DEV_ERROR",
          message: "Failed to initialize HardKAS SDK: " + ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))
        }
      },
      500
    );
  }
});

devStatusRoutes.get("/dev/status", async (c) => {
  const sdk = c.get("sdk");
  return envelope(c, true, {
    status: "online",
    mode: sdk.mode,
    network: sdk.network,
    policy: sdk.policy
  });
});

devStatusRoutes.get("/localnet/status", async (c) => {
  const sdk = c.get("sdk");
  try {
    // Basic mock status since Localnet doesn't expose a unified status() yet
    const status = { running: true, network: sdk.network };
    return envelope(c, true, status);
  } catch (e: unknown) {
    return envelope(c, false, null, { code: "HARDKAS_DEV_ERROR", message: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) });
  }
});

devStatusRoutes.get("/accounts", async (c) => {
  const sdk = c.get("sdk");
  try {
    const accounts = listHardkasAccounts(sdk.config.config);
    return envelope(c, true, accounts);
  } catch (e: unknown) {
    return envelope(c, false, null, { code: "HARDKAS_DEV_ERROR", message: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) });
  }
});
