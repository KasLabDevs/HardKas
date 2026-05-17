import pc from "picocolors";
import { UI, handleError } from "../ui.js";
import { loadHardkasConfig } from "@hardkas/config";

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
    const config = await loadHardkasConfig();
    const networkId = (config.config as any).networkId || config.config.defaultNetwork || "simnet";
    const { getL2NetworkProfile, EvmJsonRpcClient, generateAddEthereumChainPayload } = await import("@hardkas/l2");
    const { listHardkasAccounts } = await import("@hardkas/accounts");

    // 1. Resolve Profile
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
      checks.push({ name: "L2 Profile", status: "error", message: e.message });
      finalStatus = "failed";
    }

    if (profile) {
      const rpcUrl = options.rpcUrl || profile.rpcUrl;
      
      // 2. Igra RPC Connectivity
      if (rpcUrl) {
        const client = new EvmJsonRpcClient({ url: rpcUrl, timeoutMs });
        
        // Block Number
        try {
          const block = await client.getBlockNumber();
          checks.push({ name: "Igra RPC Connectivity", status: "success", message: `Reachable (Block #${block})` });
        } catch (e: any) {
          checks.push({ name: "Igra RPC Connectivity", status: "error", message: `Unreachable: ${e.message}` });
          finalStatus = "failed";
        }

        // Chain ID
        if (profile.chainId !== undefined) {
          try {
            const chainId = await client.getChainId();
            if (chainId === profile.chainId) {
              checks.push({ name: "Chain ID Verification", status: "success", message: `Matches profile (${chainId})` });
            } else {
              checks.push({ name: "Chain ID Verification", status: "error", message: `Mismatch: profile expects ${profile.chainId}, node reports ${chainId}` });
              finalStatus = "failed";
            }
          } catch (e) {
            // Already reported unreachable above
          }
        }

        // Gas Price
        try {
          const gasPrice = await client.getGasPriceWei();
          checks.push({ name: "Gas Price Check", status: "success", message: `Responds (${gasPrice.toString()} wei)` });
        } catch (e) {
          // Already reported unreachable
        }

        // 3. Local Account Check
        const accounts = listHardkasAccounts(config.config);
        const evmAccounts = accounts.filter(a => a.kind === "evm-private-key");
        
        let targetAccount = options.account 
          ? evmAccounts.find(a => a.name === options.account)
          : evmAccounts[0];

        if (targetAccount) {
          checks.push({ name: "Local EVM Account", status: "success", message: `Found "${targetAccount.name}" (${targetAccount.address})` });
          
          if (targetAccount.address) {
            try {
              const balance = await client.getBalanceWei(targetAccount.address);
              const kasBalance = Number(balance) / 1e18;
              if (kasBalance > 0) {
                checks.push({ name: "Account Balance", status: "success", message: `${kasBalance} iKAS` });
              } else {
                checks.push({ name: "Account Balance", status: "warning", message: "Zero balance (funding required)" });
                if (finalStatus === "ready") finalStatus = "warning";
              }
            } catch (e) {
               // Silent if RPC failed
            }
          }
        } else {
          checks.push({ name: "Local EVM Account", status: "warning", message: "No EVM accounts found in config/store" });
          if (finalStatus === "ready") finalStatus = "warning";
        }

        // 4. MetaMask Payload Readiness
        try {
          generateAddEthereumChainPayload(profile);
          checks.push({ name: "MetaMask Readiness", status: "success", message: "Payload generation OK" });
        } catch (e: any) {
          checks.push({ name: "MetaMask Readiness", status: "error", message: e.message });
          finalStatus = "failed";
        }
      } else {
        checks.push({ name: "RPC Configuration", status: "error", message: "No RPC URL found in profile or options" });
        finalStatus = "failed";
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

    if (finalStatus === "ready") {
      const accName = options.account || "alice_evm"; // Assuming a default or showing the one found
      console.log(`\n${pc.cyan("Next steps:")}`);
      console.log(`  hardkas metamask account ${pc.white(accName)} --show-private-key\n`);
    } else if (finalStatus === "failed") {
      console.log(`\n${pc.red("Fix recommendations:")}`);
      if (checks.some(c => c.name === "Igra RPC Connectivity" && c.status === "error")) {
        console.log(`  - Ensure your local Igra/EVM node is running on ${pc.white("http://127.0.0.1:8545")}`);
        console.log(`  - Or use ${pc.cyan("--rpc-url <url>")} to specify a different node.`);
      }
      if (checks.some(c => c.name === "Chain ID Verification" && c.status === "error")) {
        console.log(`  - Your profile expect ${pc.white(profile?.chainId)}, but the node is on another network.`);
      }
      console.log("");
    } else if (finalStatus === "warning") {
      console.log(`\n${pc.yellow("Recommendations:")}`);
      if (checks.some(c => c.name === "Account Balance" && c.status === "warning")) {
        console.log(`  - Fund your account: ${pc.white("hardkas wallet fund <name> --l2")}`);
      }
      console.log("");
    }

  } catch (e) {
    process.exitCode = 1;
    handleError(e);
  }
}
