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
import { fileURLToPath } from "node:url";
import open from "open";
import { loadSessionStoreWithDiagnostics } from "@hardkas/sessions";

export interface DevServerConfig {
  port: number;
  host: string;
  unsafeExternal?: boolean;
  open?: boolean;
}

export function createDevServer(config: DevServerConfig) {
  const app = new Hono();

  app.use("*", logger());
  app.use("*", cors({
    origin: (origin) => {
      if (origin.includes("localhost") || origin.includes("127.0.0.1") || !origin) {
        return origin;
      }
      return config.unsafeExternal ? origin : null;
    }
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
    version: "0.3.0-alpha",
    status: "running" 
  }));

  app.route("/api/session", sessionRoutes);
  app.route("/api/health", healthRoutes);
  app.route("/api/bridge", bridgeRoutes);
  app.route("/api/metamask", metamaskRoutes);
  app.route("/api/kasware", kaswareRoutes);
  app.route("/api/walletconnect/sandbox", sandboxRoutes);
  app.route("/api/stream", streamRoutes);

  // Serve Dashboard
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dashboardDist = path.resolve(__dirname, "../../../apps/dashboard/dist");

  app.use("/*", serveStatic({ 
    root: dashboardDist,
    rewriteRequestPath: (p) => p === "/" ? "/index.html" : p
  }));

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
      return serve({
        fetch: app.fetch,
        port: config.port,
        hostname: config.host
      });
    }
  };
}
