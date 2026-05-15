import { Command } from "commander";
import { handleError, UI } from "../ui.js";
import { runNodeStart } from "../runners/node-start-runner.js";
import { runNodeStatus } from "../runners/node-status-runner.js";
import { runNodeStop } from "../runners/node-stop-runner.js";
import { runNodeRestart } from "../runners/node-restart-runner.js";
import { runNodeReset } from "../runners/node-reset-runner.js";
import { runNodeLogs } from "../runners/node-logs-runner.js";

export function registerNodeCommands(program: Command) {
  const nodeCmd = program.command("node").description("Kaspa node management (Docker)");

  nodeCmd.command("start")
    .description(`Start local node ${UI.maturity("stable")}`)
    .option("--image <image>", "Docker image")
    .option("--allow-floating-image", "Allow using a floating tag like 'latest' without warning", false)
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .action(async (options) => {
      const { withLock } = await import("@hardkas/core");
      const { handleLockError } = await import("../ui.js");
      try {
        await withLock({
          rootDir: process.cwd(),
          name: "node",
          command: "hardkas node start",
          wait: options.waitLock,
          timeoutMs: parseInt(options.lockTimeout)
        }, async () => {
          UI.info("Starting Kaspa node (Docker)...");
          const result = await runNodeStart(options);
          console.log(result.formatted);
        });
      } catch (e) { handleLockError(e); }
    });

  nodeCmd.command("stop")
    .description(`Stop local node ${UI.maturity("stable")}`)
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .action(async (options) => {
      const { withLock } = await import("@hardkas/core");
      const { handleLockError } = await import("../ui.js");
      try {
        await withLock({
          rootDir: process.cwd(),
          name: "node",
          command: "hardkas node stop",
          wait: options.waitLock,
          timeoutMs: parseInt(options.lockTimeout)
        }, async () => {
          const result = await runNodeStop({});
          UI.success(`Node stopped (Container: ${result.containerName})`);
        });
      } catch (e) { handleLockError(e); }
    });

  nodeCmd.command("restart")
    .description(`Restart local node ${UI.maturity("stable")}`)
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .action(async (options) => {
      const { withLock } = await import("@hardkas/core");
      const { handleLockError } = await import("../ui.js");
      try {
        await withLock({
          rootDir: process.cwd(),
          name: "node",
          command: "hardkas node restart",
          wait: options.waitLock,
          timeoutMs: parseInt(options.lockTimeout)
        }, async () => {
          const result = await runNodeRestart({});
          console.log(result.formatted);
        });
      } catch (e) { handleLockError(e); }
    });

  nodeCmd.command("reset")
    .description(`Stop node and remove all local chain data ${UI.maturity("preview")}`)
    .option("--start", "Restart the node after reset", false)
    .option("--yes", "Skip confirmation prompt", false)
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .action(async (options) => {
      const { withLock } = await import("@hardkas/core");
      const { handleLockError } = await import("../ui.js");
      try {
        await withLock({
          rootDir: process.cwd(),
          name: "node",
          command: "hardkas node reset",
          wait: options.waitLock,
          timeoutMs: parseInt(options.lockTimeout)
        }, async () => {
          if (!options.yes) {
            const confirmed = await UI.confirm("This will delete all local chain data. Are you sure?");
            if (!confirmed) {
              console.log("  Aborted.");
              return;
            }
          }
          
          const result = await runNodeReset({ removeData: true });
          UI.success(result.formatted);
          
          if (options.start) {
            UI.info("Starting node...");
            const startResult = await runNodeStart({});
            console.log(startResult.formatted);
          }
        });
      } catch (e) { handleLockError(e); }
    });

  nodeCmd.command("status")
    .description("Check node status")
    .option("--json", "Return status in JSON format", false)
    .action(async (options) => {
      try {
        const result = await runNodeStatus({});
        if (options.json) {
          console.log(JSON.stringify({
            schema: "hardkas.nodeStatus.v1",
            docker: {
              available: true, // If we reached here, docker CLI at least worked in runner
              daemonReady: result.status.statusText !== "not-found"
            },
            container: {
              exists: result.status.statusText !== "not-found",
              running: result.status.running,
              name: result.status.containerName,
              image: result.status.image
            },
            rpc: {
              url: result.status.rpcUrl,
              ready: result.status.rpcReady,
              lastError: result.status.lastError,
              transports: result.status.transports
            },
            ports: [
              { protocol: "grpc", host: "127.0.0.1", port: result.status.ports.rpc, ready: result.status.transports.grpc.ready },
              { protocol: "borsh", host: "127.0.0.1", port: result.status.ports.borshRpc, ready: result.status.transports.borsh.ready },
              { protocol: "json", host: "127.0.0.1", port: result.status.ports.jsonRpc, ready: result.status.transports.json.ready }
            ],
            dataDir: result.status.dataDir
          }, null, 2));
        } else {
          console.log(result.formatted);
        }
      } catch (e) {
        handleError(e);
      }
    });

  nodeCmd.command("logs")
    .description(`View node logs ${UI.maturity("preview")}`)
    .option("--tail <n>", "Number of lines to show", "100")
    .option("--follow", "Follow log output", false)
    .action(async (options) => {
      try {
        const result = await runNodeLogs({
          tail: parseInt(options.tail, 10)
        });
        if (result) console.log(result);
      } catch (e) {
        handleError(e);
      }
    });
}
