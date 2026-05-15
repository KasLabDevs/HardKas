import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { buildKaspadArgs } from "./args";
import { resolveRuntimeConfig } from "./paths";
import { getNodeStatus } from "./status";
import type { KaspaNodeConfig, KaspaNodeHandle, KaspaNodeStatus } from "./types";

import { writeFileAtomic } from "@hardkas/core";

export async function startKaspaNode(config: KaspaNodeConfig): Promise<KaspaNodeHandle> {
  const runtime = resolveRuntimeConfig(config);
  const args = buildKaspadArgs(config, runtime);
  runtime.args = args;

  const currentStatus = await getNodeStatus(config);
  if (currentStatus.running) {
    throw new Error(`Kaspa node is already running for network ${config.network} (PID: ${currentStatus.pid})`);
  }

  if (config.reset) {
    await fs.rm(runtime.dataDir, { recursive: true, force: true });
  }

  await fs.mkdir(runtime.dataDir, { recursive: true });

  const logFile = await fs.open(runtime.logFile, "a");
  
  const child = spawn(runtime.binaryPath, args, {
    detached: true,
    stdio: ["ignore", logFile.fd, logFile.fd]
  });

  child.on("error", (err) => {
    // This is often not reached if detached: true, but we try to handle it.
    if ((err as any).code === "ENOENT") {
       throw new Error(`Failed to start kaspad. Provide --binary /path/to/kaspad or ensure kaspad is in PATH.`);
    }
    throw err;
  });

  // Check if process is actually alive after a short delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  if (child.pid === undefined) {
    throw new Error("Failed to start kaspad process.");
  }

  try {
    process.kill(child.pid, 0);
  } catch (e) {
    throw new Error(`Failed to start kaspad. Provide --binary /path/to/kaspad or ensure kaspad is in PATH.`);
  }

  await writeFileAtomic(runtime.pidFile, child.pid.toString());
  await writeFileAtomic(runtime.configFile, JSON.stringify(runtime, null, 2));

  child.unref();

  return {
    pid: child.pid,
    rpcUrl: runtime.rpcUrl,
    dataDir: runtime.dataDir,
    async stop() {
      await stopKaspaNode(config);
    },
    async status() {
      return getNodeStatus(config);
    }
  };
}

export async function stopKaspaNode(config: KaspaNodeConfig): Promise<void> {
  const runtime = resolveRuntimeConfig(config);
  
  try {
    const pidStr = await fs.readFile(runtime.pidFile, "utf-8");
    const pid = parseInt(pidStr, 10);
    
    if (!isNaN(pid)) {
      try {
        process.kill(pid, "SIGTERM");
      } catch (e) {
        // Process might already be dead
      }
    }
    
    await fs.rm(runtime.pidFile, { force: true });
  } catch (e) {
    // No pid file, nothing to do
  }
}

export async function readKaspaNodeLogs(config: KaspaNodeConfig): Promise<string> {
  const runtime = resolveRuntimeConfig(config);
  try {
    return await fs.readFile(runtime.logFile, "utf-8");
  } catch (e) {
    return "";
  }
}

export async function cleanKaspaNodeData(config: KaspaNodeConfig): Promise<void> {
  const runtime = resolveRuntimeConfig(config);
  const status = await getNodeStatus(config);
  
  if (status.running) {
    throw new Error(`Cannot clean node data while node is running. Stop it first with hardkas node stop --network ${config.network}.`);
  }

  await fs.rm(runtime.dataDir, { recursive: true, force: true });
}
