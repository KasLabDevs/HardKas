import path from "node:path";
import fs from "node:fs";
import type { KaspaNodeConfig, KaspaNodeRuntimeConfig, KaspaRealNetwork } from "./types";

export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  while (current !== root) {
    const indicators = ["pnpm-workspace.yaml", "turbo.json", "package.json"];
    for (const indicator of indicators) {
      const p = path.join(current, indicator);
      if (fs.existsSync(p)) {
        if (indicator === "package.json") {
          try {
            const pkg = JSON.parse(fs.readFileSync(p, "utf-8"));
            if (pkg.workspaces) return current;
          } catch (e) {
            // Ignore parse errors
          }
        } else {
          return current;
        }
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return process.cwd();
}

export function resolveRuntimeConfig(config: KaspaNodeConfig): KaspaNodeRuntimeConfig {
  const network = config.network;
  
  let dataDir: string;
  if (config.dataDir) {
    dataDir = path.resolve(config.dataDir);
  } else {
    const workspaceRoot = findWorkspaceRoot();
    dataDir = path.join(workspaceRoot, ".hardkas", "nodes", network);
  }

  const binaryPath = config.binaryPath ?? "kaspad";

  const rpcListen = config.rpcListen ?? getDefaultRpcListen(network);
  const rpcUrl = `ws://${rpcListen}`;

  return {
    network,
    binaryPath,
    dataDir,
    pidFile: path.join(dataDir, "kaspad.pid"),
    logFile: path.join(dataDir, "kaspad.log"),
    configFile: path.join(dataDir, "hardkas-node.json"),
    rpcListen,
    rpcUrl,
    args: [] // Will be populated by buildKaspadArgs
  };
}

function getDefaultRpcListen(network: KaspaRealNetwork): string {
  switch (network) {
    case "mainnet":
      return "127.0.0.1:18110";
    case "testnet-10":
    case "testnet-11":
    case "testnet-12":
      return "127.0.0.1:18210";
    case "devnet":
      return "127.0.0.1:18310";
  }
}
