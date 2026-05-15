import { Command } from "commander";
import { loadHardkasConfig } from "@hardkas/config";
import { UI } from "../ui.js";

export function registerNetworksCommand(program: Command): void {
  program
    .command("networks")
    .description(`List configured networks ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .action(async (opts) => {
      const { config } = await loadHardkasConfig();
      const networks = config.networks || {};

      if (opts.json) {
        console.log(JSON.stringify(networks, null, 2));
        return;
      }

      UI.header("HardKAS Networks");
      
      const header = "  Network        RPC                              Kind";
      console.log(header);
      console.log("  " + "─".repeat(header.length - 2));

      for (const [name, net] of Object.entries(networks)) {
        const rpc = (net as any).rpcUrl || "simulated";
        const kind = (net as any).kind || "unknown";
        console.log(`  ${name.padEnd(14)} ${rpc.padEnd(32)} ${kind}`);
      }
      console.log("");
    });
}
