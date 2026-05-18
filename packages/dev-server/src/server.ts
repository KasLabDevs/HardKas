import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { sessionRoutes } from "./routes/session.js";
import { healthRoutes } from "./routes/health.js";
import { bridgeRoutes } from "./routes/bridge.js";
import { metamaskRoutes } from "./routes/metamask.js";
import { kaswareRoutes } from "./routes/kasware.js";
import { sandboxRoutes } from "./routes/sandbox.js";
import { streamRoutes } from "./stream.js";
import { serveStatic } from "@hono/node-server/serve-static";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import open from "open";
import { loadSessionStoreWithDiagnostics } from "@hardkas/sessions";
import { HARDKAS_VERSION } from "@hardkas/artifacts";

export interface DevServerConfig {
  port: number;
  host: string;
  unsafeExternal?: boolean;
  open?: boolean;
}

export function resolveCorsOrigin(origin: string | undefined, unsafeExternal: boolean): string | null | undefined {
  if (!origin) return origin;
  if (
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.includes("[::1]")
  ) {
    return origin;
  }
  return unsafeExternal ? origin : null;
}

export function createDevServer(config: DevServerConfig) {
  const app = new Hono();

  app.use("*", logger());
  app.use("*", cors({
    origin: (origin) => resolveCorsOrigin(origin, !!config.unsafeExternal) ?? null
  }));

  // Local-only guard
  app.use("*", async (c, next) => {
    const host = c.req.header("host") || "";
    const isLocal = host.includes("localhost") || host.includes("127.0.0.1") || host.includes("::1");
    
    if (!isLocal && !config.unsafeExternal) {
      return c.json({ error: "Access denied: HardKas Dev Server is restricted to localhost by default. Use --unsafe-external to allow remote access." }, 403);
    }
    await next();
  });

  app.get("/", (c) => c.json({ 
    name: "HardKas Dev Server", 
    version: HARDKAS_VERSION,
    status: "running" 
  }));

  app.route("/api/session", sessionRoutes);
  app.route("/api/health", healthRoutes);
  app.route("/api/bridge", bridgeRoutes);
  app.route("/api/metamask", metamaskRoutes);
  app.route("/api/kasware", kaswareRoutes);
  app.route("/api/walletconnect/sandbox", sandboxRoutes);
  app.route("/api/stream", streamRoutes);

  // Try to find dashboard dist in multiple locations
  function findDashboardDist(): string | null {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(__dirname, "../../../apps/dashboard/dist"),   // monorepo dev
      path.resolve(__dirname, "../dashboard"),                    // bundled in package
      path.resolve(process.cwd(), "node_modules/@hardkas/dev-server/dashboard"), // npm install
    ];
    for (const c of candidates) {
      try { if (fs.existsSync(c)) return c; } catch {}
    }
    return null;
  }

  const dashboardDist = findDashboardDist();
  if (dashboardDist) {
    app.use("/*", serveStatic({
      root: dashboardDist,
      rewriteRequestPath: (p) => p === "/" ? "/index.html" : p
    }));
  } else {
    app.get("/", (c) => c.json({
      name: "HardKas Dev Server",
      version: HARDKAS_VERSION,
      status: "running",
      dashboard: "not-found",
      message: "Dashboard not built. API available at /api/*. Run 'pnpm build' in apps/dashboard to enable the UI."
    }));
  }

  return {
    app,
    start: () => {
      const { diagnostics } = loadSessionStoreWithDiagnostics();
      if (diagnostics.length > 0) {
        console.warn("\n⚠️  [Session store validation warnings]");
        diagnostics.forEach(d => console.warn(`   - ${d}`));
        console.warn("");
      }

      console.log(`\n🚀 HardKas Dev Server running at http://${config.host}:${config.port}`);
      console.log(`📡 SSE Stream: http://${config.host}:${config.port}/api/stream\n`);
      if (config.unsafeExternal) {
        console.log("⚠️  WARNING: External access enabled via --unsafe-external\n");
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
          if (err.code === "EADDRINUSE") {
            console.error(`\nPort ${config.port} is already in use. Try: hardkas dev server --port ${config.port + 1}\n`);
            process.exit(1);
          }
          throw err;
        });
        return server;
      } catch (err: any) {
        if (err.code === "EADDRINUSE") {
          console.error(`\nPort ${config.port} is already in use. Try: hardkas dev server --port ${config.port + 1}\n`);
          process.exit(1);
        }
        throw err;
      }
    }
  };
}
