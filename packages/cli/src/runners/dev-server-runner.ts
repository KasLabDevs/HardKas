import pc from "picocolors";
import { UI, handleError } from "../ui.js";

export async function runDevServer(options: { 
  port: string; 
  host: string; 
  unsafeExternal: boolean;
  open: boolean;
  json: boolean;
}) {
  try {
    const { createDevServer } = await import("@hardkas/dev-server");
    
    const port = parseInt(options.port, 10);
    let host = options.host;

    if (options.unsafeExternal && options.host === "localhost") {
      host = "0.0.0.0";
    }

    if (options.json) {
      console.log(JSON.stringify({
        schema: "hardkas.devServer.v1",
        status: "running",
        url: `http://${host}:${port}`,
        config: { port, host, unsafeExternal: options.unsafeExternal }
      }, null, 2));
    }

    const server = createDevServer({
      port,
      host,
      unsafeExternal: options.unsafeExternal,
      open: options.open
    });

    console.log(pc.bold("\nHardKas Dev Server"));
    console.log(pc.dim("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    
    server.start();

    console.log(pc.dim("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(pc.yellow("LOCAL DEV ONLY"));
    console.log(pc.dim("Press Ctrl+C to stop.\n"));

    // Keep process alive
    process.on("SIGINT", () => {
      console.log("\nStopping Dev Server...");
      process.exit(0);
    });

  } catch (e) {
    handleError(e);
  }
}
