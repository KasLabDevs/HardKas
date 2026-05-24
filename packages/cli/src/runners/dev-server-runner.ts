import pc from "picocolors";
import { UI, handleError } from "../ui.js";

export async function runDevServer(options: { 
  port: string; 
  host: string; 
  unsafeExternal: boolean;
  showToken: boolean;
  open: boolean;
  json: boolean;
  workspaceRoot?: string;
}) {
  try {
    const { createDevServer } = await import("@hardkas/dev-server");
    
    const port = parseInt(options.port, 10);
    let host = options.host;

    if (options.unsafeExternal && options.host === "localhost") {
      host = "0.0.0.0";
    }

    const server = createDevServer({
      port,
      host,
      unsafeExternal: options.unsafeExternal,
      open: options.open
    });

    const token = (server as any).token;

    if (options.json) {
      console.log(JSON.stringify({
        schema: "hardkas.devServer.v1",
        status: "running",
        url: `http://${host}:${port}`,
        token,
        config: { port, host, unsafeExternal: options.unsafeExternal }
      }, null, 2));
    } else {
      console.log(pc.bold("\nHardKAS dev-server started\n"));
      
      console.log(pc.bold("Dashboard:"));
      console.log(`  http://localhost:${port}\n`);

      console.log(pc.bold("Security:"));
      console.log(`  API authentication: ${pc.green("enabled")}`);
      console.log(`  CSRF protection: ${pc.green("enabled")}`);
      console.log(`  Host validation: ${options.unsafeExternal ? pc.yellow("disabled (unsafe-external mode)") : pc.green("enabled")}\n`);

      console.log(pc.bold("Token:"));
      console.log(`  generated for this session\n`);

      if (options.unsafeExternal) {
        console.log(pc.red("WARNING: --unsafe-external exposes the HardKAS dev-server beyond localhost."));
        console.log(pc.red("API token authentication remains enabled, but this mode increases workstation risk."));
        console.log(pc.red("Use only in isolated development environments.\n"));
      } else {
        console.log(pc.dim("Do not expose this server to untrusted networks.\n"));
      }

      if (options.showToken) {
        console.log(pc.bold("Session Token:"));
        console.log(`  ${token}\n`);

        console.log(pc.bold("Manual curl usage:"));
        console.log(`  curl -H "Authorization: Bearer ${token}" \\`);
        console.log(`       http://localhost:${port}/api/overview\n`);

        console.log(pc.bold("For mutations:"));
        console.log(`  curl -X POST \\`);
        console.log(`    -H "Authorization: Bearer ${token}" \\`);
        console.log(`    -H "X-Hardkas-Request: true" \\`);
        console.log(`    http://localhost:${port}/api/...\n`);
      }
    }

    server.start();

    // Keep process alive
    process.on("SIGINT", () => {
      console.log("\nStopping Dev Server...");
      process.exit(0);
    });

  } catch (e) {
    handleError(e);
  }
}
