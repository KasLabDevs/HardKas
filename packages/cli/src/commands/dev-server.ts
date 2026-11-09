import { Command } from "commander";
import { UI } from "../ui.js";

/**
 * NOT REGISTERED (N-7): `program.ts` does not call this since the dashboard was retired (HK-27, origin/main), so
 * `hardkas dev-server ...` is an unknown command and this module is not bundled. The API runs through `hardkas sandbox`
 * / `hardkas dev`; its token is in `.hardkas/dev-server-token`. Kept only as the reference of the former surface.
 */
export function registerDevServerCommands(program: Command) {
  const dsCmd = program
    .command("dev-server")
    .description(`Manage the local HardKAS dev server ${UI.maturity("stable")}`);

  dsCmd
    .command("start")
    .description("Start the dev server")
    .option("--port <number>", "Port to bind to", "7420")
    .option("--host <string>", "Host to bind to", "127.0.0.1")
    .option("--dashboard", "Deprecated: the standalone dashboard UI has been retired; dev-server runs as a headless API service", false)
    .option("--unsafe-external", "Allow external access (binds to 0.0.0.0 if host not specified)", false)
    .option("--unsafe-no-auth", "Disable token authentication (requires --yes)", false)
    .option("--yes", "Acknowledge unsafe flags", false)
    .option("--with-node", "Spawn the localnet node and auto-fund simnet accounts", false)
    .option("--json", "Output status as JSON", false)
    .action(async (options: any) => {
      try {
        if (options.unsafeNoAuth && !options.yes) {
          throw new Error("--unsafe-no-auth requires --yes");
        }
        if (options.unsafeNoAuth && options.host !== "127.0.0.1" && options.host !== "localhost") {
          throw new Error("unsafe-no-auth requires host to be 127.0.0.1 (never 0.0.0.0)");
        }
        
        const { runDevServer } = await import("../runners/dev-server-runner.js");
        await runDevServer({
          port: options.port,
          host: options.host,
          unsafeExternal: options.unsafeExternal,
          unsafeNoAuth: options.unsafeNoAuth,
          open: false,
          json: options.json,
          withNode: options.withNode
        } as any);
      } catch (e) {
        if (e instanceof Error) throw e;
        throw new Error("Dev server start failed");
      }
    });

  dsCmd
    .command("token")
    .description("Print the current dev server token")
    .option("--json", "Output as JSON", false)
    .action(async (options: any) => {
      try {
        const { runDevServerToken } = await import("../runners/dev-server-runner.js");
        await runDevServerToken(options);
      } catch (e) {
        if (e instanceof Error) throw e;
        throw new Error("Dev server token failed");
      }
    });
}
