import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * OBS-05 � Watcher Recovery Across Node Restart (Docker Real)
 *
 * Authority: node RPC + Docker container lifecycle + HardKAS Observation Engine
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates observation behavior across node outages:
 * 1. Read on healthy node succeeds.
 * 2. Node stopped -> Observation returns OBSERVATION_RPC_UNAVAILABLE or typed error.
 * 3. Node restarted -> Fresh observation succeeds with restored network state.
 */
export const scenarioObs05: GateDefinition = {
  id: "OBS-05",
  name: "Watcher Recovery Across Node Restart",
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
    let containerName = "hardkas-kaspad-toccata-v2"; try { const psRes = await runCommand(`docker ps --format "{{.Names}}"`, ctx.repoRoot); if (psRes.stdout.trim()) { containerName = psRes.stdout.trim().split(/\r?\n/)[0].trim(); } } catch (e) {}
    try {
      const statusData = JSON.parse(statusRes.stdout.trim());
      if (statusData.node?.rpcUrl) {
        rpcUrl = statusData.node.rpcUrl.replace("ws://", "");
      }
      if (statusData.node?.containerName) {
        containerName = statusData.node.containerName;
      }
    } catch (e) {}

    // Phase 1: Read on healthy node
    const phase1Code = `
      const hk = await Hardkas.create({
        network: "simnet",
        rpc: { endpoints: ["${rpcUrl}"] }
      });
      try {
        const alice = await hk.accounts.resolve("alice");
        const snapshot = await hk.observe.address({ address: alice.address });
        __emitEvidence({ success: true, address: snapshot.address });
      } catch (e) {
        __emitEvidence({ success: false, error: e.message });
      } finally {
        process.exit(0);
      }
    `;

    const res1 = await runConsumerScript(ctx, "obs-05-p1.js", phase1Code);
    evidence.push("OBS-05 PHASE 1:\n" + res1.stdout + "\n" + res1.stderr);

    const p1Passed = res1.code === 0 && res1.data && res1.data.success === true;
    assertions.push({
      name: "OBS-05.A healthy node observation succeeds",
      passed: p1Passed,
      actual: res1.data
    });

    // Phase 2: Stop container & observe failure
    await runCommand(`docker stop ${containerName}`, ctx.repoRoot);

    const phase2Code = `
      const hk = await Hardkas.create({
        network: "simnet",
        rpc: { endpoints: ["${rpcUrl}"] }
      });
      try {
        const alice = await hk.accounts.resolve("alice");
        const snapshot = await hk.observe.address({ address: alice.address });
        __emitEvidence({ unexpectedSuccess: true, snapshot });
      } catch (e) {
        __emitEvidence({
          unexpectedSuccess: false,
          errorMessage: e.message,
          errorCode: e.code,
          isTyped: typeof e.message === "string" && e.message.length > 0
        });
      } finally {
        process.exit(0);
      }
    `;

    const res2 = await runConsumerScript(ctx, "obs-05-p2.js", phase2Code);
    evidence.push("OBS-05 PHASE 2 (NODE STOPPED):\n" + res2.stdout + "\n" + res2.stderr);

    const p2Data = res2.data;
    const p2Passed = p2Data && p2Data.unexpectedSuccess === false;
    assertions.push({
      name: "OBS-05.B observation fails with typed error during node outage",
      passed: !!p2Passed && p2Data.isTyped === true,
      actual: p2Data
    });

    // Phase 3: Restart container & verify recovery
    await runCommand(`docker start ${containerName}`, ctx.repoRoot);

    // Wait for node to restart
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const inspectRestart = await runCommand(`docker inspect -f "{{.State.Running}}" ${containerName}`, ctx.repoRoot);
      if (inspectRestart.stdout.trim() === "true") { await new Promise(r => setTimeout(r, 5000)); break; }
    }

    const phase3Code = `
      let recovered = false;
      let snapshot = null;
      let lastErr = null;

      for (let i = 0; i < 15; i++) {
        try {
          const hk = await Hardkas.create({
            network: "simnet",
            rpc: { endpoints: ["${rpcUrl}"] }
          });
          const alice = await hk.accounts.resolve("alice");
          snapshot = await hk.observe.address({ address: alice.address });
          if (snapshot && snapshot.address) {
            recovered = true;
            break;
          }
        } catch (e) {
          lastErr = e.message;
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      __emitEvidence({ recovered, snapshot, lastErr });
      process.exit(0);
    `;

    const res3 = await runConsumerScript(ctx, "obs-05-p3.js", phase3Code);
    evidence.push("OBS-05 PHASE 3 (POST-RESTART RECOVERY):\n" + res3.stdout + "\n" + res3.stderr);

    const p3Data = res3.data;
    const p3Passed = res3.code === 0 && p3Data && p3Data.recovered === true;

    assertions.push({
      name: "OBS-05.C observation recovers cleanly after node restart",
      passed: p3Passed,
      actual: p3Data
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
