import pc from "picocolors";
import { UI, handleError } from "../ui.js";
import { loadHardkasConfig } from "@hardkas/config";

import type { NetworkId } from "@hardkas/core";

export interface DevDoctorCheck {
  name: string;
  status: "success" | "warning" | "error";
  message?: string;
  details?: any;
}

export interface DevDoctorResult {
  schema: "hardkas.devDoctor.v1";
  status: "ready" | "warning" | "failed";
  checks: DevDoctorCheck[];
}

export async function runDevDoctor(options: { 
  profile: string; 
  rpcUrl?: string; 
  account?: string; 
  timeout?: string;
  json: boolean 
}) {
  const checks: DevDoctorCheck[] = [];
  let finalStatus: "ready" | "warning" | "failed" = "ready";
  const timeoutMs = options.timeout ? parseInt(options.timeout, 10) : 3000;

  try {
    // 1. Node Version Check
    const nodeVer = process.version;
    checks.push({ name: "Node.js Version", status: "success", message: nodeVer });

    let config: any = null;
    try {
      config = await loadHardkasConfig();
      checks.push({ name: "Workspace Validity", status: "success", message: `Valid (cwd: ${config.cwd})` });
      checks.push({ name: "Config Validity", status: "success", message: "hardkas.config.ts parsed successfully" });
    } catch (e: any) {
      checks.push({ name: "Workspace Validity", status: "error", message: "Not a valid HardKAS workspace" });
      finalStatus = "failed";
    }

    if (config) {
      // 2. Artifact Folder Health
      const fs = await import("node:fs");
      const path = await import("node:path");
      const artifactDir = path.join(config.cwd, ".hardkas", "artifacts");
      if (fs.existsSync(artifactDir)) {
        checks.push({ name: "Artifact Folder", status: "success", message: "OK" });
      } else {
        checks.push({ name: "Artifact Folder", status: "warning", message: "Not found (will be created automatically)" });
        if (finalStatus === "ready") finalStatus = "warning";
      }

      // 3. SDK Import Health
      try {
        await import("@hardkas/sdk");
        checks.push({ name: "SDK Import Health", status: "success", message: "OK" });
      } catch (e) {
        checks.push({ name: "SDK Import Health", status: "error", message: "Failed to import @hardkas/sdk" });
        finalStatus = "failed";
      }

      // 4. Dev-Server Availability Check
      try {
        const res = await fetch("http://127.0.0.1:7420/api/health", { signal: AbortSignal.timeout(1000) });
        if (res.ok) {
          checks.push({ name: "Dev-Server Availability", status: "success", message: "Running on port 7420" });
        } else {
          checks.push({ name: "Dev-Server Availability", status: "warning", message: `Responded with ${res.status}` });
        }
      } catch (e) {
        checks.push({ name: "Dev-Server Availability", status: "warning", message: "Not running (start with 'hardkas dev')" });
        if (finalStatus === "ready") finalStatus = "warning";
      }

      // 5. Localnet Availability
      const networkId = typeof config.config.networkId === "string" ? config.config.networkId : (config.config.defaultNetwork || "simnet");
      if (networkId === "simulated") {
        checks.push({ name: "Localnet Availability", status: "success", message: "Simulated mode (no localnet required)" });
      } else {
        checks.push({ name: "Localnet Availability", status: "warning", message: `Requires ${networkId} localnet` });
      }

      // 6. L2 Experimental Status
      checks.push({ name: "Igra/L2 Features", status: "warning", message: "Experimental / Read-Only mode" });
      if (finalStatus === "ready") finalStatus = "warning";

      const { getL2NetworkProfile, EvmJsonRpcClient, generateAddEthereumChainPayload } = await import("@hardkas/l2");
      const { listHardkasAccounts } = await import("@hardkas/accounts");

      // 7. Resolve Profile (L2 RPC Checks)
      let profile;
      try {
        profile = await getL2NetworkProfile({
          name: options.profile,
          userProfiles: config.config.l2?.networks,
          cliOverrides: {
            rpcUrl: options.rpcUrl || (networkId === "simnet" || networkId === "localnet" ? "http://127.0.0.1:8545" : undefined),
            chainId: (networkId === "simnet" || networkId === "localnet" ? 19416 : undefined)
          }
        });
      } catch (e: any) {
        checks.push({ name: "L2 Profile", status: "warning", message: e.message });
      }

      if (profile) {
        const rpcUrl = options.rpcUrl || profile.rpcUrl;
        
        if (rpcUrl) {
          const client = new EvmJsonRpcClient({ url: rpcUrl, timeoutMs });
          
          try {
            const block = await client.getBlockNumber();
            checks.push({ name: "Igra RPC Connectivity", status: "success", message: `Reachable (Block #${block})` });
          } catch (e: any) {
            checks.push({ name: "Igra RPC Connectivity", status: "warning", message: `Unreachable: ${e.message}` });
          }

          if (profile.chainId !== undefined) {
            try {
              const chainId = await client.getChainId();
              if (chainId === profile.chainId) {
                checks.push({ name: "Chain ID Verification", status: "success", message: `Matches profile (${chainId})` });
              } else {
                checks.push({ name: "Chain ID Verification", status: "warning", message: `Mismatch: profile expects ${profile.chainId}, node reports ${chainId}` });
              }
            } catch (e) {}
          }

          const accounts = listHardkasAccounts(config.config);
          const evmAccounts = accounts.filter((a: any) => a.kind === "evm-private-key");
          
          let targetAccount = options.account 
            ? evmAccounts.find((a: any) => a.name === options.account)
            : evmAccounts[0];

          if (targetAccount) {
            checks.push({ name: "Local EVM Account", status: "success", message: `Found "${targetAccount.name}"` });
          } else {
            checks.push({ name: "Local EVM Account", status: "warning", message: "No EVM accounts found in config" });
          }
        }
      }
    }

    if (finalStatus === "failed") {
      process.exitCode = 1;
    }

    if (options.json) {
      const result: DevDoctorResult = {
        schema: "hardkas.devDoctor.v1",
        status: finalStatus,
        checks
      };
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Aesthetic Console Output
    console.log(pc.bold("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(pc.bold(`HardKAS • Dev Doctor`));
    console.log(pc.bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

    for (const check of checks) {
      const icon = check.status === "success" ? pc.green("✓") : check.status === "warning" ? pc.yellow("⚠") : pc.red("✗");
      console.log(`${icon} ${pc.bold(check.name)}: ${check.message}`);
    }

    console.log(pc.bold("\nStatus: ") + (finalStatus === "ready" ? pc.green("READY") : finalStatus === "warning" ? pc.yellow("WARNING") : pc.red("FAILED")));

  } catch (e) {
    process.exitCode = 1;
    handleError(e);
  }
}
