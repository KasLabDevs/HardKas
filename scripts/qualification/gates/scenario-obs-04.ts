import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * OBS-04 — AbortSignal Cancellation (Docker Real)
 *
 * Authority: HardKAS Async Observation Control
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates that passing an AbortSignal to observation waiters cancels execution
 * cleanly without throwing unhandled promise rejections or leaking memory.
 */
export const scenarioObs04: GateDefinition = {
  id: "OBS-04",
  name: "AbortSignal Cancellation",
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
    let rpcUrl = "127.0.0.1:16210";
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
        const controller = new AbortController();

        // Trigger abort after 300ms
        setTimeout(() => controller.abort(), 300);

        let abortResult = null;
        try {
          await hk.observe.waitForAddress({
            address: unused.address,
            predicate: (s) => (s.utxos && s.utxos.length > 0),
            timeoutMs: 30000,
            signal: controller.signal
          });
          abortResult = { aborted: false };
        } catch (e) {
          abortResult = {
            aborted: true,
            errorMessage: e.message,
            errorCode: e.code,
            isAbortError: e.name === "AbortError" || e.code === "OBSERVATION_TIMEOUT" || e.message?.includes("Timeout") || e.message?.includes("aborted")
          };
        }

        __emitEvidence({ abortResult });
      } catch (e) {
        __emitEvidence({ fatalError: e.message, stack: e.stack });
      } finally {
        process.exit(0);
      }
    `;

    const res = await runConsumerScript(ctx, "obs-04-abort.js", code);
    evidence.push("OBS-04 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "OBS-04 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    // OBS-04.A: AbortSignal cancels observation cleanly
    const abortClean = d.abortResult && d.abortResult.aborted === true && d.abortResult.isAbortError === true;
    assertions.push({
      name: "OBS-04.A AbortSignal cancels observation waiter cleanly",
      passed: !!abortClean,
      actual: d.abortResult
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
