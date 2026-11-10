import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import crypto from "node:crypto";
import { redactUrlCredentialsInText } from "@hardkas/core";
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
import { escrowRoutes } from "./routes/escrow.js";
import { simnetRoutes } from "./routes/simnet.js";

import path from "node:path";
import fs from "node:fs";

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

  // EVIDENCE-TRUST-1 (ET-C5): the access log never prints a credential. The API accepts its session token as `?token=`
  // (an EventSource cannot send headers), so every logged request path goes through the same redaction as the CLI's
  // output: secret-named query values are replaced by a marker, accepted token or not.
  app.use(
    "*",
    logger((message: string, ...rest: string[]) =>
      console.log(redactUrlCredentialsInText(message), ...rest.map((part) => redactUrlCredentialsInText(part)))
    )
  );

  // L-09 (3-nov): nothing this server answers is kept by a browser or proxy cache (workspace data, the catalog, refusals).
  // The session token is never embedded in a response: a client gets it out of band (the 0600 file
  // .hardkas/dev-server-token the CLI writes, or HARDKAS_DEV_TOKEN). A route that needs another policy (the SSE stream:
  // no-cache) sets its own.
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
    try {
      if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
    } catch {
      /* a response with immutable headers keeps its own */
    }
  });

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
  app.route("/api/escrows", escrowRoutes);
  app.route("/api/simnet", simnetRoutes);
  app.route("/api", devStatusRoutes);
  app.route("/api", observabilityRoutes);

  // Dev Server root: returns informational status and API endpoint catalog
  app.get("/", (c) =>
    c.json({
      name: "HardKas Dev Server",
      version: HARDKAS_VERSION,
      status: "running",
      endpoints: {
        artifacts: "/api/artifacts",
        transactions: "/api/transactions",
        devAccounts: "/api/dev-accounts",
        overview: "/api/overview",
        query: "/api/query",
        stream: "/api/stream",
        health: "/api/dashboard-health"
      }
    })
  );


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
      // N-13 (7-nov): `localhost` is bound as 127.0.0.1. Node binds the first address `localhost` resolves to (::1 on
      // Linux), while Node clients resolve it with AI_ADDRCONFIG: on a host without a non-loopback IPv6 address (Docker,
      // most CI runners) they get 127.0.0.1 only, and the URL the CLI announced refused them. Every client reaches
      // 127.0.0.1 for `localhost`, directly or after trying ::1. The printed URL and the Host check are unchanged.
      const bindHost = config.host === "localhost" ? "127.0.0.1" : config.host;
      try {
        const server = serve({
          fetch: app.fetch,
          port: config.port,
          hostname: bindHost
        });
        const origClose = server.close.bind(server);
        (server as any).close = (cb?: any) => {
          stopHardkasWatcher();
          return origClose(cb);
        };
        server.on("error", (err: any) => {
          if (((err as any).code) === "EADDRINUSE") {
            // SURFACE-TRUTH-1B: `dev` has no `server` subcommand and no --port; `sandbox` takes --port
            console.error(
              `\nPort ${config.port} is already in use: stop the process that holds it (\`hardkas sandbox\` takes --port).\n`
            );
            throw new Error("Command failed");
          }
          throw err;
        });
        return server;
      } catch (err: any) {
        if (((err as any).code) === "EADDRINUSE") {
          console.error(
            `\nPort ${config.port} is already in use: stop the process that holds it (\`hardkas sandbox\` takes --port).\n`
          );
          throw new Error("Command failed");
        }
        throw err;
      }
    }
  };
}
