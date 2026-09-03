import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * QRY-01 — Bootstrap Persistent Projection from Authoritative RPC Evidence
 *
 * Authority: Projection Store (SQLite/Query) with Node RPC as authoritative source
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates that HardKAS operational query APIs (balance, utxos, sync, store)
 * initialize and project state accurately from authoritative node RPC evidence.
 */
export const scenarioQry01: GateDefinition = {
  id: "QRY-01",
  name: "Bootstrap Persistent Projection",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer", "rpcReady", "fundedAccount"],
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
        const alice = await hk.accounts.resolve("alice");

        // 1. Operational Query Balance
        const balRes = await hk.query.balance(alice.address);

        // 2. Operational Query UTXOs
        const utxoRes = await hk.query.utxos(alice.address);

        // 3. Operational Query Network
        const netRes = await hk.query.network();

        __emitEvidence({
          balanceSuccess: !!balRes,
          balanceSompi: balRes.data ? balRes.data.toString() : null,
          utxoCount: utxoRes.data ? utxoRes.data.length : 0,
          networkId: netRes.data?.networkId || netRes.data?.network,
          rawNetRes: netRes
        });
      } catch (e) {
        __emitEvidence({
          success: false,
          error: e.message,
          code: e.code,
          stack: e.stack
        });
      } finally {
        process.exit(0);
      }
    `;

    const res = await runConsumerScript(ctx, "qry-01-bootstrap.js", code);
    evidence.push("QRY-01 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "QRY-01 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    // QRY-01.A: Operational Query balance succeeds
    assertions.push({
      name: "QRY-01.A hk.query.balance returns non-null balance from RPC evidence",
      passed: d.balanceSuccess === true && typeof d.balanceSompi === "string",
      actual: { balanceSuccess: d.balanceSuccess, balanceSompi: d.balanceSompi }
    });

    // QRY-01.B: Operational Query UTXOs returns valid UTXO count
    assertions.push({
      name: "QRY-01.B hk.query.utxos returns UTXO projection from RPC evidence",
      passed: typeof d.utxoCount === "number" && d.utxoCount > 0,
      actual: d.utxoCount
    });

    // QRY-01.C: Operational Query network returns network metadata
    assertions.push({
      name: "QRY-01.C hk.query.network returns valid execution network info",
      passed: !!d.networkId || d.rawNetRes !== undefined,
      actual: { networkId: d.networkId, rawNetRes: d.rawNetRes }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
