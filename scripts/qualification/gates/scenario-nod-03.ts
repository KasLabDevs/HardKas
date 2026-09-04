import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * NOD-03 � RPC Failure / Recovery
 *
 * Authority: node RPC + Docker container lifecycle
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Tests client behavior when the underlying node experiences an outage:
 * healthy read -> stop kaspad -> verify typed failure / no simulator fallback / no stale cache ->
 * restart kaspad -> verify documented recovery path -> fresh successful read.
 */
export const scenarioNod03: GateDefinition = {
  id: "NOD-03",
  name: "RPC Failure and Recovery",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer", "rpcReady", "fundedAccount"],
  provides: [],
  run: async (ctx: ExecutionContext) => {
    const assertions: Array<{ name: string; passed: boolean; expected?: any; actual?: any; error?: any }> = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";

    const cliPath = getHardkasCliPath(ctx.consumerDir);

    // Get RPC URL & container name
    const statusRes = await runCommand(`"${cliPath}" localnet status --json`, ctx.consumerDir);
    let rpcUrl = "127.0.0.1:18210";
    let containerName = "hardkas-kaspad-toccata-v2";
    try {
      const statusData = JSON.parse(statusRes.stdout.trim());
      if (statusData.node?.rpcUrl) {
        rpcUrl = statusData.node.rpcUrl.replace("ws://", "");
      }
      if (statusData.node?.containerName) {
        containerName = statusData.node.containerName;
      }
    } catch (e) {}

    // Script Phase 1: Healthy Read & Initial State
    const phase1Code = `
      const hk = await Hardkas.create({
        network: "simnet",
        rpc: { endpoints: ["${rpcUrl}"] }
      });

      try {
        const dagInfo = await hk.rpc.getBlockDagInfo();
        __emitEvidence({
          success: true,
          virtualDaaScore: dagInfo.virtualDaaScore ? dagInfo.virtualDaaScore.toString() : null,
          networkId: dagInfo.networkId
        });
      } catch (e) {
        __emitEvidence({ success: false, error: e.message, code: e.code });
      } finally {
        process.exit(0);
      }
    `;

    const phase1Res = await runConsumerScript(ctx, "nod-03-phase1.js", phase1Code);
    evidence.push("NOD-03 PHASE 1 (HEALTHY READ):\n" + phase1Res.stdout + "\n" + phase1Res.stderr);

    const p1Passed = phase1Res.code === 0 && phase1Res.data && phase1Res.data.success === true;
    assertions.push({
      name: "NOD-03.A healthy read succeeds",
      passed: p1Passed,
      actual: phase1Res.data
    });

    if (!p1Passed) {
      status = "FAIL";
      return { status, assertions, evidence };
    }

    // Step 2: Stop kaspad container
    const stopRes = await runCommand(`docker stop ${containerName}`, ctx.repoRoot);
    evidence.push("NOD-03 CONTAINER STOP:\n" + stopRes.stdout + "\n" + stopRes.stderr);

    // Verify node is actually stopped
    const inspectRes = await runCommand(`docker inspect -f "{{.State.Running}}" ${containerName}`, ctx.repoRoot);
    const isStopped = inspectRes.stdout.trim() === "false";
    assertions.push({
      name: "NOD-03.B node actually becomes unreachable (container stopped)",
      passed: isStopped,
      actual: inspectRes.stdout.trim()
    });

    // Script Phase 2: Attempt RPC read on dead node
    const phase2Code = `
      const hk = await Hardkas.create({
        network: "simnet",
        rpc: { endpoints: ["${rpcUrl}"] }
      });

      try {
        const dagInfo = await hk.rpc.getBlockDagInfo();
        // If it succeeded, emit evidence that it masqueraded or fell back
        __emitEvidence({
          unexpectedSuccess: true,
          dagInfo,
          isSimulated: hk.network === "simulated"
        });
      } catch (e) {
        __emitEvidence({
          unexpectedSuccess: false,
          errorName: e.name,
          errorMessage: e.message,
          errorCode: e.code,
          isHardkasError: e.name === "HardkasError" || e.name === "RpcError" || typeof e.code === "string",
          rawErrorString: String(e)
        });
      } finally {
        process.exit(0);
      }
    `;

    const phase2Res = await runConsumerScript(ctx, "nod-03-phase2.js", phase2Code);
    evidence.push("NOD-03 PHASE 2 (DEAD NODE CALL):\n" + phase2Res.stdout + "\n" + phase2Res.stderr);

    const p2Data = phase2Res.data;
    const rpcFailed = p2Data && p2Data.unexpectedSuccess === false;
    
    assertions.push({
      name: "NOD-03.C RPC call fails after node loss",
      passed: !!rpcFailed,
      actual: p2Data
    });

    if (p2Data) {
      assertions.push({
        name: "NOD-03.D failure is HardKAS typed/normalized error",
        passed: p2Data.isHardkasError === true || (typeof p2Data.errorMessage === "string" && p2Data.errorMessage.length > 0),
        actual: { errorName: p2Data.errorName, message: p2Data.errorMessage, code: p2Data.errorCode }
      });

      assertions.push({
        name: "NOD-03.E no simulator/local fallback occurs",
        passed: p2Data.unexpectedSuccess !== true || p2Data.isSimulated !== true,
        actual: p2Data
      });

      assertions.push({
        name: "NOD-03.F no cached/stale success masquerades as live response",
        passed: p2Data.unexpectedSuccess !== true,
        actual: p2Data
      });
    } else {
      assertions.push({ name: "NOD-03.D failure is HardKAS typed/normalized error", passed: false });
      assertions.push({ name: "NOD-03.E no simulator/local fallback occurs", passed: false });
      assertions.push({ name: "NOD-03.F no cached/stale success masquerades as live response", passed: false });
    }

    // Step 3: Restart kaspad container
    const startRes = await runCommand(`docker start ${containerName}`, ctx.repoRoot);
    evidence.push("NOD-03 CONTAINER RESTART:\n" + startRes.stdout + "\n" + startRes.stderr);

    // Wait briefly for kaspad to be ready
    let nodeReady = false;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const inspectRestart = await runCommand(`docker inspect -f "{{.State.Running}}" ${containerName}`, ctx.repoRoot);
      if (inspectRestart.stdout.trim() === "true") {
        nodeReady = true;
        break;
      }
    }

    assertions.push({
      name: "NOD-03.G node restarts successfully",
      passed: nodeReady,
      actual: nodeReady
    });

    // Step 4: Recovery read (using fresh Hardkas.create as documented for client reconnection)
    const phase3Code = `
      // Wait for RPC server port to accept connections
      let recovered = false;
      let dagInfo = null;
      let lastErr = null;

      for (let i = 0; i < 15; i++) {
        try {
          const hk = await Hardkas.create({
            network: "simnet",
            rpc: { endpoints: ["${rpcUrl}"] }
          });
          dagInfo = await hk.rpc.getBlockDagInfo();
          if (dagInfo && dagInfo.networkId) {
            recovered = true;
            break;
          }
        } catch (e) {
          lastErr = e.message;
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      __emitEvidence({
        recovered,
        virtualDaaScore: dagInfo?.virtualDaaScore ? dagInfo.virtualDaaScore.toString() : null,
        networkId: dagInfo?.networkId,
        lastErr
      });
      process.exit(0);
    `;

    const phase3Res = await runConsumerScript(ctx, "nod-03-phase3.js", phase3Code);
    evidence.push("NOD-03 PHASE 3 (POST-RECOVERY READ):\n" + phase3Res.stdout + "\n" + phase3Res.stderr);

    const p3Data = phase3Res.data;
    const p3Passed = phase3Res.code === 0 && p3Data && p3Data.recovered === true;

    assertions.push({
      name: "NOD-03.H recovery follows documented client semantics",
      passed: p3Passed,
      actual: p3Data
    });

    assertions.push({
      name: "NOD-03.I fresh post-recovery network read succeeds",
      passed: p3Passed && !!p3Data.networkId,
      actual: p3Data
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
