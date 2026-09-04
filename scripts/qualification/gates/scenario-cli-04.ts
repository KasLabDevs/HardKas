import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";

/**
 * CLI-04 - CLI Tx Plan/Sign/Send Pipeline & Execution Contract Authority
 *
 * Authority: CLI + HardKAS Engine + Node RPC
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates CLI commands for transaction workflow and ExecutionTarget authority:
 * hardkas tx plan -> hardkas tx sign -> hardkas tx send
 */
export const scenarioCli04: GateDefinition = {
  id: "CLI-04",
  name: "CLI Tx Pipeline Commands & Execution Target Authority",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer", "rpcReady", "fundedAccount", "matureUtxo"],
  provides: [],
  run: async (ctx: ExecutionContext) => {
    const assertions: Array<{ name: string; passed: boolean; expected?: any; actual?: any; error?: any }> = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";

    const cliPath = getHardkasCliPath(ctx.consumerDir);

    // Get RPC URL from status
    const statusRes = await runCommand(`"${cliPath}" localnet status --json`, ctx.consumerDir);
    let rpcUrl = "ws://127.0.0.1:18210";
    try {
      const statusData = JSON.parse(statusRes.stdout.trim());
      if (statusData.node?.rpcUrl) {
        rpcUrl = statusData.node.rpcUrl;
      }
    } catch (e) {}

    // 1. hardkas tx plan via CLI specifying target/network and --url
    const planRes = await runCommand(`"${cliPath}" tx plan --from alice --to bob --amount 10 --network simnet --url ${rpcUrl} --out plan.json --json`, ctx.consumerDir);
    evidence.push("CLI TX PLAN OUTPUT:\n" + planRes.stdout + "\n" + planRes.stderr);

    const planPassed = planRes.code === 0;
    assertions.push({
      name: "CLI-04.A hardkas tx plan command succeeds and outputs valid JSON artifact",
      passed: planPassed,
      actual: { code: planRes.code, stdout: planRes.stdout.trim() }
    });

    if (!planPassed) {
      status = "FAIL";
      return { status, assertions, evidence };
    }

    // 2. hardkas tx sign via CLI
    const signRes = await runCommand(`"${cliPath}" tx sign plan.json --out signed.json --account alice --json`, ctx.consumerDir);
    evidence.push("CLI TX SIGN OUTPUT:\n" + signRes.stdout + "\n" + signRes.stderr);

    const signPassed = signRes.code === 0;
    assertions.push({
      name: "CLI-04.B hardkas tx sign command succeeds for planned artifact",
      passed: signPassed,
      actual: { code: signRes.code, stdout: signRes.stdout.trim() }
    });

    if (!signPassed) {
      status = "FAIL";
      return { status, assertions, evidence };
    }

    // 3. hardkas tx send via CLI (Complete pipeline)
    const sendRes = await runCommand(`"${cliPath}" tx send signed.json --url ${rpcUrl} --json`, ctx.consumerDir);
    evidence.push("CLI TX SEND OUTPUT:\n" + sendRes.stdout + "\n" + sendRes.stderr);

    let sendData: any = {};
    try {
      sendData = JSON.parse(sendRes.stdout.trim());
    } catch (e) {}

    const sendPassed = sendRes.code === 0 && (sendData.ok === true || sendData.accepted === true || Boolean(sendData.txId));
    assertions.push({
      name: "CLI-04.C hardkas tx send command succeeds and broadcasts signed artifact",
      passed: sendPassed,
      actual: { code: sendRes.code, accepted: sendData.accepted, txId: sendData.txId }
    });

    // 4. Negative Mismatch Test: Conflict between artifact target and legacy --network must throw typed error
    const mismatchRes = await runCommand(`"${cliPath}" tx send signed.json --network simulated --json`, ctx.consumerDir);
    evidence.push("CLI TX SEND MISMATCH OUTPUT:\n" + mismatchRes.stdout + "\n" + mismatchRes.stderr);

    const mismatchPassed = mismatchRes.code !== 0 && (mismatchRes.stdout.includes("EXECUTION_NETWORK_MISMATCH") || mismatchRes.stderr.includes("EXECUTION_NETWORK_MISMATCH"));
    assertions.push({
      name: "CLI-04.D Conflict between target and legacy --network throws typed EXECUTION_NETWORK_MISMATCH",
      passed: mismatchPassed,
      actual: { code: mismatchRes.code, stderr: mismatchRes.stderr.trim() || mismatchRes.stdout.trim() }
    });

    // 5. Account Resolution Identity & Type Integrity Assertion
    // Validate simulator -> synthetic (kaspa:sim_*) vs simnet -> real deterministic (kaspasim:*)
    const nodeTestScript = `
      import { resolveHardkasAccount } from "@hardkas/accounts";

      const simTarget = { mode: "simulator", domain: "kaspa-l1", network: "simulated" };
      const localnetTarget = { mode: "localnet", domain: "kaspa-l1", network: "simnet" };

      const simAccount = resolveHardkasAccount({ nameOrAddress: "alice", executionTarget: simTarget });
      const localAccount = resolveHardkasAccount({ nameOrAddress: "alice", executionTarget: localnetTarget });
      const rawKaspasimAccount = resolveHardkasAccount({ nameOrAddress: "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn", executionTarget: simTarget });

      const isSimSynthetic = simAccount.kind === "synthetic" && simAccount.address.startsWith("kaspa:sim_");
      const isLocalDeterministic = localAccount.kind === "kaspa" && localAccount.address.startsWith("kaspasim:");
      const isKaspasimNeverSynthetic = rawKaspasimAccount.kind !== "synthetic" && rawKaspasimAccount.address.startsWith("kaspasim:");

      if (isSimSynthetic && isLocalDeterministic && isKaspasimNeverSynthetic) {
        console.log("ACCOUNT_TYPE_INTEGRITY: PASS");
        process.exit(0);
      } else {
        console.error("ACCOUNT_TYPE_INTEGRITY: FAIL", { simAccount, localAccount, rawKaspasimAccount });
        process.exit(1);
      }
    `;

    const accountCheckRes = await runCommand(`node -e "${nodeTestScript.replace(/\n/g, " ").replace(/"/g, '\\"')}"`, ctx.consumerDir);
    evidence.push("ACCOUNT TYPE INTEGRITY OUTPUT:\n" + accountCheckRes.stdout + "\n" + accountCheckRes.stderr);

    const accountCheckPassed = accountCheckRes.code === 0 && accountCheckRes.stdout.includes("ACCOUNT_TYPE_INTEGRITY: PASS");
    assertions.push({
      name: "CLI-04.E Account resolution correctly yields synthetic (kaspa:sim_*) for simulator and real deterministic (kaspasim:*) for simnet",
      passed: accountCheckPassed,
      actual: { code: accountCheckRes.code, stdout: accountCheckRes.stdout.trim() }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
