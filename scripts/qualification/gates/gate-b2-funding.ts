import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

export const gateB2: GateDefinition = {
  id: "B2",
  name: "Funded Account and Mature UTXO",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer", "rpcReady"],
  provides: ["fundedAccount", "matureUtxo"],
  run: async (ctx: ExecutionContext) => {
    const assertions = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";
    
    const cliPath = getHardkasCliPath(ctx.consumerDir);

    // 1. Fund the account via CLI
    const fundRes = await runCommand(`"${cliPath}" localnet fund alice --profile toccata-v2 --json`, ctx.consumerDir);
    evidence.push("FUND COMMAND OUTPUT:\n" + fundRes.stdout + "\n" + fundRes.stderr);
    
    const fundPassed = fundRes.code === 0;
    assertions.push({
      name: "hardkas localnet fund command succeeds",
      passed: fundPassed,
      actual: fundRes.code
    });

    if (!fundPassed) {
      status = "ENVIRONMENT_NOT_QUALIFIED";
      return { status, assertions, evidence };
    }
    
    let fundData: any = {};
    try {
      fundData = JSON.parse(fundRes.stdout.trim());
    } catch (e) {}

    // 1.5 Get RPC URL from status
    const statusRes = await runCommand(`"${cliPath}" localnet status --json`, ctx.consumerDir);
    let rpcUrl = "127.0.0.1:18210";
    try {
      const statusData = JSON.parse(statusRes.stdout.trim());
      if (statusData.node?.rpcUrl) {
        rpcUrl = statusData.node.rpcUrl.replace("ws://", "");
      }
    } catch (e) {}

    // 2. Verify with SDK that alice has mature UTXOs
    const code = `
      const { Address } = await import("@hardkas/sdk");

      const hk = await Hardkas.create({
        network: "simnet",
        rpc: {
          endpoints: ["${rpcUrl}"]
        }
      });

      try {
        const rpc = hk.rpc;
        
        // Try to use the address from fund command, otherwise resolve "alice" via SDK
        let addr = "${fundData.address || ""}";
        if (!addr) {
           const acc = await hk.accounts.resolve("alice");
           addr = acc.address;
        }
        
        let virtualDaaBefore = 0;
        try {
           const blockDagInfo = await rpc.getBlockDagInfo();
           virtualDaaBefore = blockDagInfo.virtualDaaScore || 0;
        } catch (e) {}

        let spendableUtxos = [];
        try {
           if (rpc.getUtxosByAddresses) {
              const res = await rpc.getUtxosByAddresses([addr]);
              spendableUtxos = res.entries || [];
           }
        } catch (e) {}
        
        let virtualDaaAfter = 0;
        try {
           const blockDagInfo = await rpc.getBlockDagInfo();
           virtualDaaAfter = blockDagInfo.virtualDaaScore || 0;
        } catch (e) {}

        let kind = "unknown";
        if (!"${fundData.address || ""}") {
           const acc = await hk.accounts.resolve("alice");
           kind = acc.kind;
        }

        __emitEvidence({
          address: addr,
          kind: kind,
          spendableCount: spendableUtxos.length,
          utxos: spendableUtxos,
          virtualDaaBefore,
          virtualDaaAfter,
          amounts: spendableUtxos.map((u) => u.utxoEntry?.amount),
          coinbaseFlags: spendableUtxos.map((u) => u.utxoEntry?.isCoinbase),
          blockDaaScores: spendableUtxos.map((u) => u.utxoEntry?.blockDaaScore)
        });
      } finally {
        process.exit(0);
      }
    `;

    const checkRes = await runConsumerScript(ctx, "verify-funds.js", code);
    evidence.push("SDK VERIFY OUTPUT:\n" + checkRes.stdout + "\n" + checkRes.stderr);

    if (checkRes.code !== 0 || !checkRes.data) {
      status = "ENVIRONMENT_NOT_QUALIFIED";
      assertions.push({
        name: "SDK verify script execution",
        passed: false,
        error: checkRes.stderr || "No JSON output"
      });
      return { status, assertions, evidence };
    }

    const d = checkRes.data;
    const hasFunds = d.spendableCount > 0;
    
    // Strict assertions required by user
    const hasMature = d.utxos && d.utxos.some((u: any) => u.utxoEntry?.isCoinbase === false || (u.utxoEntry?.blockDaaScore + 100 < d.virtualDaaAfter));
    const isSynthetic = d.kind === "synthetic";
    
    assertions.push({
      name: "getSpendableUtxos(alice) > 0",
      passed: hasFunds,
      actual: d
    });
    assertions.push({
      name: "matureUtxo provided",
      passed: hasMature,
      actual: hasMature
    });
    assertions.push({
      name: "kind != synthetic",
      passed: !isSynthetic,
      actual: !isSynthetic
    });

    if (!hasFunds || !hasMature || isSynthetic) {
      status = "ENVIRONMENT_NOT_QUALIFIED";
    }

    return { status, assertions, evidence };
  }
};







