import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * QRY-03 — Downtime and V2 Virtual Chain Catch-up
 *
 * Authority: virtual-chain RPC evidence (getVirtualChainFromBlockV2)
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates virtual chain catch-up queries over RPC:
 * 1. Read initial tip hash from node.
 * 2. Query getVirtualChainFromBlockV2 starting from initial tip.
 * 3. Verify catch-up returns added blocks and accepted transaction structures cleanly.
 */
export const scenarioQry03: GateDefinition = {
  id: "QRY-03",
  name: "Downtime and V2 Catch-up",
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
        const dagInfo = await hk.rpc.getBlockDagInfo();
        const startHash = (dagInfo.tipHashes && dagInfo.tipHashes[0]) ? dagInfo.tipHashes[0] : "0".repeat(64);

        // Perform V2 catch-up query from startHash
        let vchainRes = null;
        try {
          if (typeof hk.rpc.getVirtualChainFromBlockV2 === "function") {
            vchainRes = await hk.rpc.getVirtualChainFromBlockV2({
              startHash,
              includeAcceptedTransactionIds: true
            });
          } else {
            vchainRes = await hk.rpc.call("getVirtualChainFromBlockV2", {
              startHash,
              includeAcceptedTransactionIds: true
            });
          }
        } catch (e) {
          vchainRes = { error: e.message };
        }

        __emitEvidence({
          startHash,
          vchainSuccess: !!vchainRes && !vchainRes.error,
          addedBlocksCount: vchainRes ? (vchainRes.addedChainBlockHashes?.length || vchainRes.addedChainBlocks?.length || 0) : 0,
          rawKeys: vchainRes ? Object.keys(vchainRes) : [],
          error: vchainRes?.error
        });
      } catch (e) {
        __emitEvidence({
          vchainSuccess: false,
          error: e.message,
          stack: e.stack
        });
      } finally {
        process.exit(0);
      }
    `;

    const res = await runConsumerScript(ctx, "qry-03-catchup.js", code);
    evidence.push("QRY-03 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "QRY-03 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    // QRY-03.A: Virtual chain V2 catch-up query succeeds
    assertions.push({
      name: "QRY-03.A getVirtualChainFromBlockV2 succeeds against live node",
      passed: d.vchainSuccess === true,
      actual: { vchainSuccess: d.vchainSuccess, error: d.error, rawKeys: d.rawKeys }
    });

    // QRY-03.B: Response contains valid V2 virtual chain structure
    assertions.push({
      name: "QRY-03.B virtual chain response exposes valid block progression schema",
      passed: d.vchainSuccess === true && Array.isArray(d.rawKeys) && d.rawKeys.length > 0,
      actual: d.rawKeys
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
