import { Command } from "commander";
import { UI, getOutput, invocationWorkspaceRoot, HardkasCliError, HardkasExitCode } from "@hardkas/cli/extension-kit";

/**
 * L2-EXT stage 4 · `hardkas l2 node start|status|logs|stop`: the local Anvil node, on the verified Foundry, run by the
 * core's identity-checked process manager. `stop` never terminates a process HardKAS did not start.
 */
export function registerL2NodeCommands(l2: Command): void {
  const node = l2.command("node").description(`Local Anvil EVM node (127.0.0.1, chain id 31337) on the verified Foundry toolchain ${UI.maturity("experimental")}`);

  node
    .command("start")
    .description("Start Anvil on 127.0.0.1 with the verified Foundry (it never installs Foundry: hardkas toolchain install foundry)")
    .option("--port <port>", "Loopback port", "8545")
    .option("--accounts <n>", "Number of pre-funded test accounts", "10")
    .option("--json", "Output as JSON", false)
    .action(async (options: { port: string; accounts: string; json: boolean }) => {
      const { anvilSpec, parsePort, parseAccounts, ANVIL_CHAIN_ID } = await import("../node/anvil.js");
      const { startManagedProcess } = await import("@hardkas/node-orchestrator");
      const port = parsePort(options.port);
      const spec = await anvilSpec(invocationWorkspaceRoot(), { port, accounts: parseAccounts(options.accounts) });
      const { record } = await startManagedProcess(spec);
      const result = { pid: record.pid, rpcUrl: `http://127.0.0.1:${port}`, chainId: ANVIL_CHAIN_ID, port, logFile: record.logFile, binarySha256: record.binarySha256 };
      if (options.json) {
        getOutput().writeJson({ ok: true, command: "l2 node start", result });
      } else {
        UI.success(`Anvil is running (PID ${record.pid}) on ${result.rpcUrl}, chain id ${ANVIL_CHAIN_ID}`);
        UI.field("log", record.logFile);
        UI.info("Its pre-funded accounts are Anvil's public test keys: local use only.");
      }
    });

  node
    .command("status")
    .description("Whether the local Anvil HardKAS started is running (checked against the OS: PID, start time, executable)")
    .option("--json", "Output as JSON", false)
    .action(async (options: { json: boolean }) => {
      const { anvilStateDir, loopbackChainId, ANVIL_CHAIN_ID } = await import("../node/anvil.js");
      const { getManagedProcessStatus } = await import("@hardkas/node-orchestrator");
      const st = await getManagedProcessStatus({ stateDir: anvilStateDir(invocationWorkspaceRoot()) });
      const port = st.record?.port;
      const chainId = st.state === "running" && port !== undefined ? await loopbackChainId(port) : undefined;
      const result = {
        state: st.state,
        detail: st.detail,
        ...(st.record ? { pid: st.record.pid, port, rpcUrl: port !== undefined ? `http://127.0.0.1:${port}` : undefined, startedAt: st.record.startedAt } : {}),
        ...(st.state === "running" ? { chainId: chainId ?? null, responding: chainId === ANVIL_CHAIN_ID } : {})
      };
      if (options.json) getOutput().writeJson({ ok: true, command: "l2 node status", result });
      else UI.field("l2 node", `${st.state}: ${st.detail}${st.state === "running" ? (chainId === ANVIL_CHAIN_ID ? " (answering, chain id 31337)" : " (not answering eth_chainId)") : ""}`);
    });

  node
    .command("logs")
    .description("Print the local Anvil log")
    .option("--tail <n>", "Only the last n lines")
    .action(async (options: { tail?: string }) => {
      const { anvilStateDir, ANVIL_PROCESS_ID } = await import("../node/anvil.js");
      const { readManagedProcessLog } = await import("@hardkas/node-orchestrator");
      const tail = options.tail !== undefined ? Number(options.tail) : undefined;
      const text = await readManagedProcessLog({ id: ANVIL_PROCESS_ID, stateDir: anvilStateDir(invocationWorkspaceRoot()) }, tail !== undefined && Number.isInteger(tail) && tail > 0 ? { tail } : {});
      getOutput().write(text.endsWith("\n") || text === "" ? text : `${text}\n`);
    });

  node
    .command("stop")
    .description("Stop the local Anvil HardKAS started; a process HardKAS did not start is never terminated")
    .option("--json", "Output as JSON", false)
    .action(async (options: { json: boolean }) => {
      const { anvilStateDir, ANVIL_PROCESS_ID, isHardkasAnvilArgs } = await import("../node/anvil.js");
      const { stopManagedProcess, getManagedProcessStatus } = await import("@hardkas/node-orchestrator");
      const stateDir = anvilStateDir(invocationWorkspaceRoot());
      // F-03: before anything is signalled, the running process must look like the Anvil HardKAS starts (its REAL
      // command line: 127.0.0.1 only, chain 31337); a record pointing at another anvil is refused and nothing is killed.
      // The generic manager then re-checks the OS identity right before the (Windows: handle-bound) kill.
      const st = await getManagedProcessStatus({ stateDir });
      if (st.state === "running" && !(st.identity?.argv && isHardkasAnvilArgs(st.identity.argv.slice(1)))) {
        throw new HardkasCliError(
          "L2_NODE_NOT_VERIFIED",
          `PID ${st.record?.pid} runs ${JSON.stringify(st.identity?.argv?.slice(1) ?? "an unreadable command line")}, not the Anvil HardKAS starts: nothing was stopped. Remove ${stateDir} if this record is not yours.`,
          { exitCode: HardkasExitCode.CORRUPTION_DETECTED }
        );
      }
      const r = await stopManagedProcess({ id: ANVIL_PROCESS_ID, stateDir });
      if (options.json) getOutput().writeJson({ ok: true, command: "l2 node stop", result: r });
      else if (r.result === "stopped") UI.success(r.detail);
      else UI.info(`${r.result}: ${r.detail}`);
    });
}
