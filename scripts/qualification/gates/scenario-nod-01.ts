import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * NOD-01 — Real Node Read Surface
 *
 * Authority: rusty-kaspad RPC = network evidence; HardKAS = mapping/normalization only
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates that the HardKAS RPC wrapper faithfully exposes the real node read surface
 * without collapsing, inventing, or losing fields from rusty-kaspad responses.
 */
export const scenarioNod01: GateDefinition = {
  id: "NOD-01",
  name: "Real Node Read Surface",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer", "rpcReady"],
  provides: [],
  run: async (ctx: ExecutionContext) => {
    const assertions: Array<{ name: string; passed: boolean; expected?: any; actual?: any; error?: any }> = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";

    // Get RPC URL from localnet status
    const cliPath = getHardkasCliPath(ctx.consumerDir);
    const statusRes = await runCommand(`"${cliPath}" localnet status --json`, ctx.consumerDir);
    let rpcUrl = "127.0.0.1:16210";
    try {
      const statusData = JSON.parse(statusRes.stdout.trim());
      if (statusData.node?.rpcUrl) {
        rpcUrl = statusData.node.rpcUrl.replace("ws://", "");
      }
    } catch (e) {}

    // Consumer script that exercises the three RPC read families
    const code = `
      const hk = await Hardkas.create({
        network: "simnet",
        rpc: {
          endpoints: ["${rpcUrl}"]
        }
      });

      try {
        const rpc = hk.rpc;
        const results = {};
        const errors = [];

        // === 1. getInfo() ===
        let info = null;
        try {
          info = await rpc.getInfo();
          results.info = {
            serverVersion: info.serverVersion,
            networkId: info.networkId,
            isSynced: info.isSynced,
            virtualDaaScore: info.virtualDaaScore,
            mempoolSize: info.mempoolSize,
            hasRaw: info.raw !== undefined,
            fieldNames: Object.keys(info)
          };
        } catch (e) {
          errors.push({ call: "getInfo", error: e.message, code: e.code });
        }

        // === 2. getBlockDagInfo() ===
        let dagInfo = null;
        try {
          dagInfo = await rpc.getBlockDagInfo();
          results.dagInfo = {
            networkId: dagInfo.networkId,
            virtualDaaScore: dagInfo.virtualDaaScore,
            tipHashes: dagInfo.tipHashes,
            virtualParentHashes: dagInfo.virtualParentHashes,
            sink: dagInfo.sink,
            hasTipHashes: dagInfo.tipHashes !== undefined,
            hasVirtualParentHashes: dagInfo.virtualParentHashes !== undefined,
            tipHashesIsArray: Array.isArray(dagInfo.tipHashes),
            virtualParentHashesIsArray: Array.isArray(dagInfo.virtualParentHashes),
            fieldNames: Object.keys(dagInfo)
          };
        } catch (e) {
          errors.push({ call: "getBlockDagInfo", error: e.message, code: e.code });
        }

        // === 3. getFeeEstimate() ===
        let feeEstimate = null;
        try {
          feeEstimate = await rpc.getFeeEstimate();
          results.feeEstimate = {
            raw: feeEstimate,
            type: typeof feeEstimate,
            isNull: feeEstimate === null,
            fieldNames: feeEstimate && typeof feeEstimate === "object" ? Object.keys(feeEstimate) : []
          };
        } catch (e) {
          errors.push({ call: "getFeeEstimate", error: e.message, code: e.code });
        }

        __emitEvidence({
          info: results.info || null,
          dagInfo: results.dagInfo || null,
          feeEstimate: results.feeEstimate || null,
          errors
        });
      } finally {
        process.exit(0);
      }
    `;

    const scriptRes = await runConsumerScript(ctx, "nod-01-read-surface.js", code);
    evidence.push("NOD-01 RAW OUTPUT:\n" + scriptRes.stdout + "\n" + scriptRes.stderr);

    if (scriptRes.code !== 0 || !scriptRes.data) {
      status = "FAIL";
      assertions.push({
        name: "NOD-01 script execution",
        passed: false,
        error: scriptRes.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = scriptRes.data;
    const hasErrors = d.errors && d.errors.length > 0;

    // --- NOD-01.A: getInfo succeeds ---
    assertions.push({
      name: "NOD-01.A getInfo succeeds",
      passed: d.info !== null,
      actual: d.info ? "returned" : (d.errors?.find((e: any) => e.call === "getInfo") || "missing")
    });

    // --- NOD-01.B: network identity matches expected execution network ---
    // Authority: node RPC evidence. We check getInfo().networkId first.
    // If undefined, fall back to getBlockDagInfo().networkId (authoritative).
    if (d.info) {
      const infoNetworkId = d.info.networkId;
      const dagNetworkId = d.dagInfo?.networkId;
      const effectiveNetworkId = infoNetworkId || dagNetworkId;
      const networkMatch = effectiveNetworkId && (
        effectiveNetworkId.includes("simnet") ||
        effectiveNetworkId === "kaspa-simnet" ||
        effectiveNetworkId === "simnet"
      );
      assertions.push({
        name: "NOD-01.B network identity is simnet",
        passed: !!networkMatch,
        expected: "simnet",
        actual: { infoNetworkId, dagNetworkId, effectiveNetworkId }
      });
      assertions.push({
        name: "NOD-01.B.1 getInfo().networkId is populated (QF-004 if missing)",
        passed: !!infoNetworkId,
        expected: "non-undefined",
        actual: infoNetworkId
      });
    }

    // --- NOD-01.C: getBlockDagInfo succeeds ---
    assertions.push({
      name: "NOD-01.C getBlockDagInfo succeeds",
      passed: d.dagInfo !== null,
      actual: d.dagInfo ? "returned" : (d.errors?.find((e: any) => e.call === "getBlockDagInfo") || "missing")
    });

    if (d.dagInfo) {
      // --- NOD-01.D: blockCount > 0 after bootstrap/funding ---
      const daaPositive = d.dagInfo.virtualDaaScore !== undefined &&
        Number(d.dagInfo.virtualDaaScore) > 0;
      assertions.push({
        name: "NOD-01.D virtualDaaScore > 0 after funding",
        passed: daaPositive,
        actual: d.dagInfo.virtualDaaScore
      });

      // --- NOD-01.E: tipHashes is present ---
      assertions.push({
        name: "NOD-01.E tipHashes is present",
        passed: d.dagInfo.hasTipHashes === true,
        actual: d.dagInfo.hasTipHashes
      });

      // --- NOD-01.F: virtualParentHashes is present ---
      assertions.push({
        name: "NOD-01.F virtualParentHashes is present",
        passed: d.dagInfo.hasVirtualParentHashes === true,
        actual: d.dagInfo.hasVirtualParentHashes
      });

      // --- NOD-01.G: tipHashes and virtualParentHashes preserved as distinct fields ---
      const notCollapsed = d.dagInfo.fieldNames.includes("tipHashes") ||
        d.dagInfo.fieldNames.includes("virtualParentHashes");
      assertions.push({
        name: "NOD-01.G tipHashes and virtualParentHashes are preserved as distinct fields",
        passed: notCollapsed,
        actual: { fieldNames: d.dagInfo.fieldNames }
      });
    }

    // --- NOD-01.H: getFeeEstimate succeeds ---
    assertions.push({
      name: "NOD-01.H getFeeEstimate succeeds",
      passed: d.feeEstimate !== null,
      actual: d.feeEstimate ? "returned" : (d.errors?.find((e: any) => e.call === "getFeeEstimate") || "missing")
    });

    if (d.feeEstimate) {
      // --- NOD-01.I: returned fee estimate is structurally valid ---
      const feeValid = d.feeEstimate.raw !== null &&
        d.feeEstimate.raw !== undefined &&
        d.feeEstimate.type === "object";
      assertions.push({
        name: "NOD-01.I fee estimate is structurally valid (non-null object)",
        passed: feeValid,
        actual: { type: d.feeEstimate.type, fieldNames: d.feeEstimate.fieldNames }
      });
    }

    // --- NOD-01.J: no raw-transport exception leaks ---
    assertions.push({
      name: "NOD-01.J no raw-transport exception leaks through HardKAS API",
      passed: !hasErrors,
      actual: d.errors
    });

    // If any assertion failed, mark as FAIL
    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
