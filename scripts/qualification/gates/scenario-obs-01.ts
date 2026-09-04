import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * OBS-01 � One-Shot Observation & Timeout (Docker Real)
 *
 * Authority: node RPC + HardKAS Observation Engine
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates:
 * 1. Single observation of empty address returns 0 UTXOs and 0 mempool.
 * 2. Waiting for predicate on quiet address times out cleanly with OBSERVATION_TIMEOUT.
 */
export const scenarioObs01: GateDefinition = {
  id: "OBS-01",
  name: "One-Shot Observation and Timeout",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer", "rpcReady"],
  provides: [],
  run: async (ctx: ExecutionContext) => {
    const assertions: Array<{ name: string; passed: boolean; expected?: any; actual?: any; error?: any }> = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";

    const cliPath = getHardkasCliPath(ctx.consumerDir);
    const statusRes = await runCommand(`"${cliPath}" localnet status --json`, ctx.consumerDir);
    let rpcUrl = "127.0.0.1:18210";
    try {
      const statusData = JSON.parse(statusRes.stdout.trim());
      if (statusData.node?.rpcUrl) {
        rpcUrl = statusData.node.rpcUrl.replace("ws://", "");
      }
    } catch (e) {}

    const code = `
      const hk = await Hardkas.create({
        network: "simnet",
        rpc: { endpoints: ["${rpcUrl}"] }
      });

      try {
        const unused = await hk.accounts.resolve("bob");

        // 1. One-shot address observation
        const snapshot = await hk.observe.address({ address: unused.address });

        // 2. Wait for address timeout test (1.5 sec timeout)
        let timeoutResult = null;
        try {
          await hk.observe.waitForAddress({
            address: unused.address,
            predicate: (s) => (s.utxos && s.utxos.length > 0),
            timeoutMs: 1500
          });
          timeoutResult = { timedOut: false };
        } catch (e) {
          timeoutResult = {
            timedOut: true,
            errorMessage: e.message,
            errorCode: e.code
          };
        }

        __emitEvidence({
          snapshot: {
            address: snapshot.address,
            utxoCount: snapshot.utxos?.length || 0,
            mempoolCount: snapshot.mempool?.length || 0
          },
          timeoutResult
        });
      } catch (e) {
        __emitEvidence({ fatalError: e.message, stack: e.stack });
      } finally {
        process.exit(0);
      }
    `;

    const res = await runConsumerScript(ctx, "obs-01-timeout.js", code);
    evidence.push("OBS-01 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "OBS-01 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    // OBS-01.A: Empty address observation returns 0 UTXOs and 0 mempool
    const emptyClean = d.snapshot && d.snapshot.utxoCount === 0 && d.snapshot.mempoolCount === 0;
    assertions.push({
      name: "OBS-01.A empty address observation returns 0 UTXOs and 0 mempool",
      passed: !!emptyClean,
      actual: d.snapshot
    });

    // OBS-01.B: Predicate timeout throws typed OBSERVATION_TIMEOUT
    const timedOutTyped = d.timeoutResult && d.timeoutResult.timedOut === true && (
      d.timeoutResult.errorCode === "OBSERVATION_TIMEOUT" ||
      d.timeoutResult.errorMessage?.includes("Timeout")
    );
    assertions.push({
      name: "OBS-01.B quiet address observation times out with OBSERVATION_TIMEOUT",
      passed: !!timedOutTyped,
      actual: d.timeoutResult
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
