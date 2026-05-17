import pc from "picocolors";
import { UI, handleError } from "../ui.js";
import { loadHardkasConfig } from "@hardkas/config";

export async function runBridgeLocalPlan(options: { 
  from?: string; 
  toIgra?: string; 
  session?: string;
  amount: string; 
  json: boolean 
}) {
  try {
    const config = await loadHardkasConfig();
    const { planBridgeEntry, resolveBridgeLocalContext } = await import("@hardkas/bridge-local");
    const { MockKaspaRpcClient } = await import("@hardkas/kaspa-rpc");

    // Resolve context
    const ctx = await resolveBridgeLocalContext({
      config,
      sessionName: options.session as any,
      from: options.from as any,
      toIgra: options.toIgra as any
    });

    const amountSompi = BigInt(Math.floor(parseFloat(options.amount) * 1e8));

    const rpc = new MockKaspaRpcClient();
    rpc.setUtxos(ctx.l1.address, [
      { 
        outpoint: { transactionId: "mock-utxo", index: 0 }, 
        address: ctx.l1.address, 
        amountSompi: 100000000000n, // 1000 KAS
        scriptPublicKey: "mock-script" 
      }
    ]);
    const utxos = await rpc.getUtxosByAddress(ctx.l1.address);
    
    const plan = planBridgeEntry({
      fromAddress: ctx.l1.address,
      targetEvmAddress: ctx.l2.address,
      amountSompi,
      networkId: (config.config as any).networkId || config.config.defaultNetwork || "simnet",
      availableUtxos: utxos.map(u => ({ ...u, scriptPublicKey: "", blockDaaScore: u.blockDaaScore ? BigInt(u.blockDaaScore) : undefined })) as any
    });

    if (options.json) {
      console.log(JSON.stringify({
        schema: "hardkas.bridgeLocalSessionPlan.v1",
        session: {
          source: ctx.source,
          name: ctx.sessionName || null
        },
        l1: {
          wallet: ctx.l1.walletName,
          address: ctx.l1.address
        },
        l2: {
          account: ctx.l2.accountName || null,
          address: ctx.l2.address
        },
        bridge: {
          mode: ctx.bridgeMode,
          amount: options.amount,
          payload: plan.serializedPayload
        },
        plan
      }, (k, v) => typeof v === "bigint" ? v.toString() : v, 2));
      return;
    }

    printBridgeContext(ctx, options.amount, plan.serializedPayload);
    
    console.log(pc.bold("Local Bridge Entry Plan"));
    console.log(pc.dim("----------------------------------------"));
    console.log(`Fee (est):       ${pc.yellow(Number(plan.estimatedFeeSompi) / 1e8)} KAS`);
    console.log(`Mass:            ${plan.estimatedMass}`);
    console.log(pc.dim("----------------------------------------\n"));

  } catch (e) {
    handleError(e);
  }
}

export async function runBridgeLocalSimulate(options: { 
  from?: string; 
  toIgra?: string; 
  session?: string;
  amount: string; 
  prefix: string;
  json: boolean 
}) {
  try {
    const config = await loadHardkasConfig();
    const { planBridgeEntry, simulatePrefixMining, resolveBridgeLocalContext } = await import("@hardkas/bridge-local");
    const { MockKaspaRpcClient } = await import("@hardkas/kaspa-rpc");

    // Resolve context
    const ctx = await resolveBridgeLocalContext({
      config,
      sessionName: options.session as any,
      from: options.from as any,
      toIgra: options.toIgra as any
    });

    const amountSompi = BigInt(Math.floor(parseFloat(options.amount) * 1e8));

    const rpc = new MockKaspaRpcClient();
    rpc.setUtxos(ctx.l1.address, [
      { 
        outpoint: { transactionId: "mock-utxo", index: 0 }, 
        address: ctx.l1.address, 
        amountSompi: 100000000000n, // 1000 KAS
        scriptPublicKey: "mock-script" 
      }
    ]);
    const utxos = await rpc.getUtxosByAddress(ctx.l1.address);
    
    const plan = planBridgeEntry({
      fromAddress: ctx.l1.address,
      targetEvmAddress: ctx.l2.address,
      amountSompi,
      networkId: (config.config as any).networkId || config.config.defaultNetwork || "simnet",
      availableUtxos: utxos.map(u => ({ ...u, scriptPublicKey: "", blockDaaScore: u.blockDaaScore ? BigInt(u.blockDaaScore) : undefined })) as any
    });

    if (!options.json) {
      printBridgeContext(ctx, options.amount, plan.serializedPayload);
      console.log(pc.bold("Bridge Entry Simulation"));
      console.log(`${pc.cyan("Step 1:")} Planning entry transaction... OK`);
      console.log(`${pc.cyan("Step 2:")} Simulating prefix mining for prefix "${pc.white(options.prefix)}"...`);
    }

    const miningResult = simulatePrefixMining(plan.bridgePayload, options.prefix);

    if (options.json) {
      console.log(JSON.stringify({
        schema: "hardkas.bridgeLocalSessionSimulation.v1",
        status: "success",
        session: {
          source: ctx.source,
          name: ctx.sessionName || null
        },
        l1: {
          wallet: ctx.l1.walletName,
          address: ctx.l1.address
        },
        l2: {
          account: ctx.l2.accountName || null,
          address: ctx.l2.address
        },
        miningResult,
        plan
      }, (k, v) => typeof v === "bigint" ? v.toString() : v, 2));
      return;
    }

    console.log(`  ${pc.green("✓")} Target found at nonce: ${pc.white(miningResult.nonce)}`);
    console.log(`  ${pc.green("✓")} Attempts: ${miningResult.attempts}`);
    console.log(`  ${pc.green("✓")} Simulated Hash: ${pc.dim(miningResult.hash)}`);
    
    console.log(`\n${pc.bold(pc.green("SUCCESS"))}: Local bridge entry simulated.`);
    console.log(pc.yellow(pc.bold("\n⚠️  SIMULATION DISCLAIMER:")));
    console.log(`  - ${pc.white("NO actual bridge settlement")} occurred on L1.`);
    console.log(`  - ${pc.white("NO L2 minting")} or state change occurred on Igra.`);
    console.log(`  - ${pc.white("NO real bridge validation")} or relayer action was involved.`);
    console.log(`  - This is a ${pc.bold("deterministic local proof")} for development workflows only.\n`);

  } catch (e) {
    handleError(e);
  }
}

export async function runBridgeLocalInspect(txid: string, options: { json: boolean }) {
  try {
    console.log(pc.bold(`\nInspecting Local Bridge Transaction: ${txid}`));
    console.log(pc.dim("Feature limited in alpha: no local tx store yet."));
  } catch (e) {
    handleError(e);
  }
}

function printBridgeContext(ctx: any, amount: string, payload: string) {
  console.log(pc.bold("\nSession"));
  console.log(`  Source: ${pc.white(ctx.source)}`);
  console.log(`  Name:   ${pc.white(ctx.sessionName || "none")}`);

  console.log(pc.bold("\nKaspa L1"));
  console.log(`  Wallet:  ${pc.white(ctx.l1.walletName)}`);
  console.log(`  Address: ${pc.dim(ctx.l1.address)}`);

  console.log(pc.bold("\nIgra L2"));
  console.log(`  Account: ${pc.white(ctx.l2.accountName || "explicit")}`);
  console.log(`  Address: ${pc.dim(ctx.l2.address)}`);

  console.log(pc.bold("\nBridge"));
  console.log(`  Mode:    ${pc.white(ctx.bridgeMode)}`);
  console.log(`  Amount:  ${pc.green(amount)} KAS`);
  console.log(`  Payload: ${pc.dim(payload)}`);
  console.log("");
}
