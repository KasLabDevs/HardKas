import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import crypto from "node:crypto";
import { sessionRoutes } from "./routes/session.js";
import { healthRoutes } from "./routes/health.js";
import { bridgeRoutes } from "./routes/bridge.js";
import { metamaskRoutes } from "./routes/metamask.js";
import { kaswareRoutes } from "./routes/kasware.js";
import { sandboxRoutes } from "./routes/sandbox.js";
import { eventsRoutes } from "./routes/events.js";
import { accountsRoutes } from "./routes/accounts.js";
import { transactionsRoutes } from "./routes/transactions.js";
import { artifactsRoutes } from "./routes/artifacts.js";
import { overviewRoutes } from "./routes/overview.js";
import { observabilityRoutes } from "./routes/observability.js";
import { dappTxRoutes } from "./routes/dapp-tx.js";
import { devStatusRoutes } from "./routes/dev-status.js";
import { streamRoutes } from "./routes/stream.js";
import { devAccountsRoutes } from "./routes/dev-accounts.js";
import { serveStatic } from "@hono/node-server/serve-static";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import open from "open";
import { loadSessionStoreWithDiagnostics } from "@hardkas/sessions";
import { HARDKAS_VERSION } from "@hardkas/artifacts";

import { startHardkasWatcher, stopHardkasWatcher } from "./watcher.js";
export { stopHardkasWatcher };

export interface DevServerConfig {
  port: number;
  host: string;
  unsafeExternal?: boolean;
  unsafeNoAuth?: boolean;
  open?: boolean;
}

export function resolveCorsOrigin(
  origin: string | undefined,
  config: { unsafeExternal: boolean; port: number }
): string | null | undefined {
  if (!origin) return origin;

  const allowedLocalPrefixes = [
    `http://localhost:${config.port}`,
    `http://127.0.0.1:${config.port}`,
    `http://[::1]:${config.port}`,
    `http://localhost:5173`,
    `http://127.0.0.1:5173`,
    `http://[::1]:5173`
  ];

  if (
    allowedLocalPrefixes.some(
      (prefix) => origin === prefix || origin.startsWith(prefix + "/")
    )
  ) {
    return origin;
  }

  if (config.unsafeExternal) {
    return origin;
  }

  return null;
}

export function createDevServer(config: DevServerConfig) {
  const app = new Hono();

  // Generate cryptographically secure session token on server boot or reuse persistent env token
  const devServerToken =
    process.env.HARDKAS_DEV_TOKEN || crypto.randomBytes(32).toString("hex");

  app.use("*", logger());

  // 1. Host Header Validation (DNS Rebinding Defense)
  app.use("*", async (c, next) => {
    if (!config.unsafeExternal) {
      const host = c.req.header("Host") || c.req.header("host") || "";
      const allowedHosts = [
        `localhost:${config.port}`,
        `127.0.0.1:${config.port}`,
        `[::1]:${config.port}`
      ];
      if (!allowedHosts.includes(host)) {
        return c.json(
          { error: `Forbidden: Host '${host}' is not allowed for this server session.` },
          403
        );
      }
    }
    await next();
  });

  // Strict Origin Validation (Reject invalid origins with 403)
  app.use("*", async (c, next) => {
    if (!config.unsafeExternal) {
      const origin = c.req.header("Origin") || c.req.header("origin");
      if (origin) {
         const resolved = resolveCorsOrigin(origin, {
            unsafeExternal: !!config.unsafeExternal,
            port: config.port
         });
         if (!resolved) {
            return c.json({ error: `Forbidden: Origin '${origin}' is not allowed.` }, 403);
         }
      }
    }
    await next();
  });

  // 2. Strict CORS Configuration
  app.use(
    "*",
    cors({
      origin: (origin) =>
        resolveCorsOrigin(origin, {
          unsafeExternal: !!config.unsafeExternal,
          port: config.port
        }) ?? null
    })
  );

  // 3. Bearer Token Authentication Middleware
  app.use("/api/*", async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const queryToken = c.req.query("token");
    let token = "";

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else if (queryToken) {
      token = queryToken;
    }

    if (!config.unsafeNoAuth && token !== devServerToken) {
      return c.json({ error: "Unauthorized: Invalid or missing bearer token." }, 401);
    }
    await next();
  });

  // 4. Custom CSRF Mutation Header Middleware
  app.use("/api/*", async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const csrfHeader = c.req.header("X-Hardkas-Request");
      if (csrfHeader !== "true") {
        return c.json(
          {
            error:
              "Forbidden: Missing required CSRF protection header X-Hardkas-Request: true"
          },
          403
        );
      }
    }
    await next();
  });

  // Inject Generation ID to all API responses
  app.use("/api/*", async (c, next) => {
    await next();
    try {
      const { getQueryBackend } = await import("./db.js");
      const backend = getQueryBackend();
      if (backend.isReady()) {
        const rows = await backend.executeRawSql(
          "SELECT value FROM metadata WHERE key = 'generation_id'"
        );
        if (rows && rows.length > 0) {
          c.header("X-Hardkas-Generation", rows[0].value);
        }
      }
    } catch (e) {}
  });

  app.route("/api/session", sessionRoutes);
  app.route("/api/health", healthRoutes);
  app.route("/api/bridge", bridgeRoutes);
  app.route("/api/metamask", metamaskRoutes);
  app.route("/api/kasware", kaswareRoutes);
  app.route("/api/walletconnect/sandbox", sandboxRoutes);
  app.route("/api/events", eventsRoutes);
  app.route("/api/accounts", accountsRoutes);
  app.route("/api/transactions", transactionsRoutes);
  app.route("/api", streamRoutes);
  app.route("/api/artifacts", artifactsRoutes);
  app.route("/api/overview", overviewRoutes);
  app.route("/api/tx", dappTxRoutes);
  app.route("/api/dev-accounts", devAccountsRoutes);
  app.route("/api", devStatusRoutes);
  app.route("/api", observabilityRoutes);

  // Try to find dashboard dist in multiple locations
  function findDashboardDist(): string | null {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(__dirname, "../../../apps/dashboard/dist"), // monorepo dev
      path.resolve(__dirname, "../dashboard"), // bundled in package
      path.resolve(process.cwd(), "node_modules/@hardkas/dev-server/dashboard") // npm install
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) return c;
      } catch {}
    }
    return null;
  }

  const dashboardDist = findDashboardDist();
  if (dashboardDist) {
    app.use(
      "/assets/*",
      serveStatic({
        root: dashboardDist,
        rewriteRequestPath: (p) => p
      })
    );
    app.get("/*", async (c) => {
      const htmlPath = path.join(dashboardDist, "index.html");
      let html = await fs.promises.readFile(htmlPath, "utf-8");

      // Inject global script payload for secure dashboard API client bootstrapping
      const scriptTag = `
<script>
  window.__HARDKAS_DEV_TOKEN__ = "${devServerToken}";
</script>
`;
      html = html.replace("<head>", `<head>${scriptTag}`);

      return c.html(html);
    });
  } else {
    app.get("/", (c) =>
      c.json({
        name: "HardKas Dev Server",
        version: HARDKAS_VERSION,
        status: "running",
        dashboard: "not-found",
        message:
          "Dashboard not built. API available at /api/*. Run 'pnpm build' in apps/dashboard to enable the UI."
      })
    );
  }

  return {
    app,
    token: devServerToken,
    start: () => {
      const { diagnostics } = loadSessionStoreWithDiagnostics();
      if (diagnostics.length > 0) {
        console.warn("\n⚠️  [Session store validation warnings]");
        diagnostics.forEach((d) => console.warn(`   - ${d}`));
        console.warn("");
      }

      // Boot directory watcher to auto-refresh and targeted reindex on disk changes
      startHardkasWatcher();

      console.log(
        `\n🚀 HardKas Dev Server running at http://${config.host}:${config.port}`
      );
      console.log(`📡 SSE Stream: http://${config.host}:${config.port}/api/stream\n`);
      if (config.unsafeExternal) {
        console.log("⚠️  WARNING: External access enabled via --unsafe-external\n");
      }
      if (config.unsafeNoAuth) {
        console.log("⚠️  CRITICAL: Authentication disabled via --unsafe-no-auth\n");
      }
      const url = `http://${config.host}:${config.port}`;
      if (config.open) {
        open(url);
      }
      try {
        const server = serve({
          fetch: app.fetch,
          port: config.port,
          hostname: config.host
        });
        server.on("error", (err: any) => {
          if (((err as any).code) === "EADDRINUSE") {
            console.error(
              `\nPort ${config.port} is already in use. Try: hardkas dev server --port ${config.port + 1}\n`
            );
            throw new Error("Command failed");
          }
          throw err;
        });
        return server;
      } catch (err: any) {
        if (((err as any).code) === "EADDRINUSE") {
          console.error(
            `\nPort ${config.port} is already in use. Try: hardkas dev server --port ${config.port + 1}\n`
          );
          throw new Error("Command failed");
        }
        throw err;
      }
    }
  };
}
