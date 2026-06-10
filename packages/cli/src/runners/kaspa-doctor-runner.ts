import pc from "picocolors";
import { UI, handleError } from "../ui.js";
import { HardkasSchemas } from "@hardkas/artifacts";

export interface KaspaDoctorCheck {
  name: string;
  status: "success" | "warning" | "error";
  message?: string;
}

export interface KaspaDoctorResult {
  schema: typeof HardkasSchemas.KaspaDoctorV1;
  status: "ready" | "warning" | "failed";
  checks: KaspaDoctorCheck[];
}

export async function runKaspaDoctor(options: { rpcUrl: string; json: boolean }) {
  const checks: KaspaDoctorCheck[] = [];
  let finalStatus: "ready" | "warning" | "failed" = "ready";

  try {
    const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
    const client = new JsonWrpcKaspaClient({ rpcUrl: options.rpcUrl, timeoutMs: 3000 });

    // 1. RPC Reachability
    try {
      const info = await client.getInfo();
      checks.push({
        name: "RPC Reachability",
        status: "success",
        message: `Connected to kaspad ${info.serverVersion || ""}`
      });

      // 2. Sync Status
      if (info.isSynced) {
        checks.push({
          name: "Sync Status",
          status: "success",
          message: "Node is synced"
        });
      } else {
        checks.push({
          name: "Sync Status",
          status: "warning",
          message: "Node is still syncing"
        });
        if (finalStatus === "ready") finalStatus = "warning";
      }

      // 3. UTXO Index
      if (info.isUtxoIndexed) {
        checks.push({
          name: "UTXO Index",
          status: "success",
          message: "Indexed and searchable"
        });
      } else {
        checks.push({
          name: "UTXO Index",
          status: "error",
          message: "UTXO index disabled (required for wallet balance/send)"
        });
        finalStatus = "failed";
      }

      // 4. DAG Info
      try {
        const dag = await client.getBlockDagInfo();
        checks.push({
          name: "DAG Status",
          status: "success",
          message: `Network: ${dag.networkId}, DAA Score: ${dag.virtualDaaScore}`
        });
      } catch (e: any) {
        checks.push({
          name: "DAG Status",
          status: "error",
          message: `Failed to fetch DAG info: ${e.message}`
        });
        finalStatus = "failed";
      }

      // 5. Mempool
      try {
        const mempoolSize = info.mempoolSize ?? 0;
        checks.push({
          name: "Mempool",
          status: "success",
          message: `${mempoolSize} transactions pending`
        });
      } catch (e) {
        // Ignore
      }
    } catch (e: any) {
      checks.push({
        name: "RPC Reachability",
        status: "error",
        message: `Failed to connect: ${e.message}`
      });
      finalStatus = "failed";
    }

    if (options.json) {
      const result: KaspaDoctorResult = {
        schema: HardkasSchemas.KaspaDoctorV1,
        status: finalStatus,
        checks
      };
      console.log(JSON.stringify(result, null, 2));
      if (finalStatus === "failed") {
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("DOCTOR_FAILED", "Doctor checks failed", {
          exitCode: 1
        });
      }
      return;
    }

    // Aesthetic Output
    console.log(
      pc.bold("\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”")
    );
    console.log(pc.bold(`HardKAS â€¢ Kaspa Doctor (L1)`));
    console.log(
      pc.bold("â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n")
    );

    for (const check of checks) {
      const icon =
        check.status === "success"
          ? pc.green("âœ“")
          : check.status === "warning"
            ? pc.yellow("âš ")
            : pc.red("âœ—");
      console.log(`${icon} ${pc.bold(check.name)}: ${check.message}`);
    }

    console.log(
      pc.bold("\nStatus: ") +
        (finalStatus === "ready"
          ? pc.green("READY")
          : finalStatus === "warning"
            ? pc.yellow("WARNING")
            : pc.red("FAILED"))
    );

    if (finalStatus === "failed") {
      console.log(`\n${pc.red("Fix recommendations:")}`);
      if (checks.some((c) => c.name === "RPC Reachability" && c.status === "error")) {
        console.log(`  - Ensure kaspad is running with ${pc.white("--rpclisten-json")}.`);
        console.log(`  - Check if the port ${pc.white("16110")} is open.`);
      }
      if (checks.some((c) => c.name === "UTXO Index" && c.status === "error")) {
        console.log(`  - Start kaspad with ${pc.white("--utxoindex")}.`);
      }
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("DOCTOR_FAILED", "Kaspa node doctor checks failed.", {
        exitCode: 1
      });
    }
  } catch (e: any) {
    if (e.name === "HardkasCliError") throw e;
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("DOCTOR_ERROR", e.message || "Unknown error", {
      exitCode: 1,
      cause: e
    });
  }
}
