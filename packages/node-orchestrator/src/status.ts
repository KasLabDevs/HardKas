import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { resolveRuntimeConfig } from "./paths";
import type { KaspaNodeConfig, KaspaNodeStatus, KaspaNodeDoctorReport } from "./types";

export async function getNodeStatus(config: KaspaNodeConfig): Promise<KaspaNodeStatus> {
  const runtime = resolveRuntimeConfig(config);
  
  try {
    const pidStr = await fs.readFile(runtime.pidFile, "utf-8");
    const pid = parseInt(pidStr, 10);
    
    if (isNaN(pid)) {
      return { running: false, rpcUrl: runtime.rpcUrl, dataDir: runtime.dataDir, message: "Invalid PID file" };
    }

    try {
      process.kill(pid, 0); // Check if process is alive
      
      return {
        running: true,
        pid,
        network: runtime.network,
        rpcUrl: runtime.rpcUrl,
        dataDir: runtime.dataDir,
        logFile: runtime.logFile
      };
    } catch (e) {
      return { running: false, rpcUrl: runtime.rpcUrl, dataDir: runtime.dataDir, message: "Process found in PID file but is not running" };
    }
  } catch (e) {
    return { running: false, rpcUrl: runtime.rpcUrl, dataDir: runtime.dataDir, message: "Node is not running" };
  }
}

export async function doctorKaspaNode(config: KaspaNodeConfig): Promise<KaspaNodeDoctorReport> {
  const runtime = resolveRuntimeConfig(config);
  const status = await getNodeStatus(config);
  const warnings: string[] = [];

  let binaryFound = false;
  if (runtime.binaryPath.includes(path.sep) || path.isAbsolute(runtime.binaryPath)) {
    binaryFound = fsSync.existsSync(runtime.binaryPath);
  } else {
    // Search in PATH
    const pathExt = (process.env.PATHEXT || "").split(path.delimiter);
    const paths = (process.env.PATH || "").split(path.delimiter);
    for (const p of paths) {
      const fullPath = path.join(p, runtime.binaryPath);
      if (fsSync.existsSync(fullPath)) {
        binaryFound = true;
        break;
      }
      // Check extensions on Windows
      if (process.platform === "win32") {
        for (const ext of pathExt) {
          if (fsSync.existsSync(fullPath + ext)) {
            binaryFound = true;
            break;
          }
        }
      }
      if (binaryFound) break;
    }
  }

  const dataDirExists = fsSync.existsSync(runtime.dataDir);
  const pidFileExists = fsSync.existsSync(runtime.pidFile);
  const logFileExists = fsSync.existsSync(runtime.logFile);

  if (!binaryFound) {
    warnings.push(`${runtime.binaryPath} binary not found. Provide --binary /path/to/kaspad or ensure kaspad is in PATH.`);
  }

  if (runtime.rpcListen.startsWith("0.0.0.0")) {
    warnings.push("RPC is exposed on 0.0.0.0. Use 127.0.0.1 for local development.");
  }

  if (pidFileExists && !status.running) {
    warnings.push("PID file exists but process is not running. You may need to run hardkas node stop or hardkas node clean.");
  }

  if (!dataDirExists) {
    warnings.push("Data dir does not exist yet.");
  }

  return {
    network: runtime.network,
    binaryPath: runtime.binaryPath,
    binaryFound,
    dataDir: runtime.dataDir,
    dataDirExists,
    pidFile: runtime.pidFile,
    pidFileExists,
    running: status.running,
    pid: status.pid,
    rpcUrl: runtime.rpcUrl,
    logFile: runtime.logFile,
    logFileExists,
    warnings
  };
}
