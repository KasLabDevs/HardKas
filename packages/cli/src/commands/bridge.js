import { UI } from "../ui.js";
export function registerBridgeCommands(program) {
    const bridgeCmd = program
        .command("bridge", { hidden: true })
        .description("Kaspa -> Igra bridge developer tools");
    bridgeCmd.hook("preAction", () => {
        if (!process.env.HARDKAS_EXPERIMENTAL) {
            console.warn("\n⚠️  WARNING: 'bridge' commands are highly experimental and unsupported. Set HARDKAS_EXPERIMENTAL=1 to acknowledge.\n");
        }
    });
    const localCmd = bridgeCmd
        .command("local")
        .description("Local bridge entry simulation (deterministic)");
    localCmd
        .command("plan")
        .description(`Plan a local bridge entry transaction ${UI.maturity("stable")}`)
        .option("--session <name>", "Link to a specific developer session")
        .option("--from <name>", "Source Kaspa wallet name (overrides session)")
        .option("--to-igra <address>", "Target Igra EVM address (overrides session)")
        .requiredOption("--amount <kas>", "Amount in KAS to bridge")
        .option("--json", "Output as JSON", false)
        .action(async (options) => {
        const { runBridgeLocalPlan } = await import("../runners/bridge-local-runner.js");
        await runBridgeLocalPlan(options);
    });
    localCmd
        .command("simulate")
        .description(`Simulate a bridge entry with prefix mining ${UI.maturity("stable")}`)
        .option("--session <name>", "Link to a specific developer session")
        .option("--from <name>", "Source Kaspa wallet name (overrides session)")
        .option("--to-igra <address>", "Target Igra EVM address (overrides session)")
        .requiredOption("--amount <kas>", "Amount in KAS to bridge")
        .option("--prefix <hex>", "Prefix to mine for", "abc")
        .option("--json", "Output as JSON", false)
        .action(async (options) => {
        const { runBridgeLocalSimulate } = await import("../runners/bridge-local-runner.js");
        await runBridgeLocalSimulate(options);
    });
    localCmd
        .command("inspect <txid>")
        .description(`Inspect a local bridge transaction artifact ${UI.maturity("stable")}`)
        .option("--json", "Output as JSON", false)
        .action(async (txid, options) => {
        const { runBridgeLocalInspect } = await import("../runners/bridge-local-runner.js");
        await runBridgeLocalInspect(txid, options);
    });
}
//# sourceMappingURL=bridge.js.map