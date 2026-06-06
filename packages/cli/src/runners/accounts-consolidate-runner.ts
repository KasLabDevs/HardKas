import { Hardkas } from "@hardkas/sdk";
import { resolveNetworkTarget } from "@hardkas/config";

export interface AccountsConsolidateOptions {
  account: string;
  network?: string | undefined;
  provider?: string | undefined;
  url?: string | undefined;
  targetUtxos: number;
  batchSize: number;
  minUtxo?: bigint | undefined;
  dryRun: boolean;
  execute: boolean;
  yes: boolean;
  allowMainnet: boolean;
  json: boolean;
}

export async function runAccountsConsolidate(options: AccountsConsolidateOptions) {
  const sdk = await Hardkas.open({ cwd: process.cwd() });

  const resolvedName = options.network || sdk.config.config.defaultNetwork || "simnet";

  if (resolvedName === "mainnet" && options.execute && !options.allowMainnet) {
    const err = new Error("MAINNET_CONSOLIDATION_BLOCKED: Consolidation on mainnet requires the --allow-mainnet flag.");
    (err as any).code = "MAINNET_CONSOLIDATION_BLOCKED";
    throw err;
  }

  const { resolveProvider } = await import("@hardkas/config");
  const provider = resolveProvider({
    network: resolvedName,
    provider: options.provider,
    url: options.url
  });

  if (provider.mode !== "simulated") {
    const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
    (sdk as any).rpc = new JsonWrpcKaspaClient({ rpcUrl: provider.endpoint! });
  }

  const resolvedAccount = await sdk.accounts.resolve(options.account);
  if (!resolvedAccount) {
    const err = new Error(`ACCOUNT_NOT_FOUND: Account '${options.account}' not found.`);
    (err as any).code = "ACCOUNT_NOT_FOUND";
    throw err;
  }

  let allUtxos: any[] = [];
  try {
    if (provider.mode !== "simulated") {
      const rpcUtxos = await sdk.rpc.getUtxosByAddress(resolvedAccount.address!);
      allUtxos = rpcUtxos.map((u: any) => ({
        outpoint: {
          transactionId: u.outpoint.transactionId,
          index: u.outpoint.index
        },
        address: u.address,
        amountSompi: BigInt(u.amountSompi),
        scriptPublicKey: u.scriptPublicKey || ""
      }));
    } else {
      const { loadOrCreateLocalnetState, getSpendableUtxos } = await import("@hardkas/localnet");
      const localState = await loadOrCreateLocalnetState({ cwd: sdk.workspace.root });
      const unspent = getSpendableUtxos(localState, resolvedAccount.address!);
      allUtxos = unspent.map((u) => {
        const parts = u.id.split(":");
        const index = Number(parts[parts.length - 1]);
        const transactionId = parts.slice(0, -1).join(":");
        return {
          outpoint: { transactionId, index },
          address: u.address,
          amountSompi: BigInt(u.amountSompi),
          scriptPublicKey: "mock-script"
        };
      });
    }
  } catch (e: any) {
    if (e.message && e.message.includes("connection error")) {
      const err = new Error(`RPC_CONNECTION_FAILED: Could not connect to RPC at ${provider.endpoint}`);
      (err as any).code = "RPC_CONNECTION_FAILED";
      throw err;
    }
    throw e;
  }

  if (options.minUtxo) {
    allUtxos = allUtxos.filter((u) => u.amountSompi >= options.minUtxo!);
  }

  const beforeCount = allUtxos.length;

  if (beforeCount <= options.targetUtxos) {
    const err = new Error(`Account already has ${beforeCount} UTXOs, which is <= target of ${options.targetUtxos}. No consolidation needed.`);
    (err as any).code = "CONSOLIDATION_NOT_REQUIRED";
    throw err;
  }

  if (options.batchSize > 512) {
    throw new Error("Batch size cannot exceed 512 inputs to avoid TOO_MANY_INPUTS_FOR_SINGLE_TX errors.");
  }

  // Sort smallest-first
  allUtxos.sort((a, b) => {
    if (a.amountSompi < b.amountSompi) return -1;
    if (a.amountSompi > b.amountSompi) return 1;
    return 0;
  });

  const batches: any[][] = [];
  let remaining = beforeCount;
  let idx = 0;

  while (remaining > options.targetUtxos && idx < allUtxos.length) {
    const batchSize = Math.min(options.batchSize, remaining - options.targetUtxos + 1);
    // + 1 because consolidation replaces N inputs with 1 output (net reduction = N - 1)
    // Wait, the reduction per batch is batch.length - 1.
    // If remaining - target = 10, we need to reduce by 10.
    // So we need to consume 11 inputs.
    const neededInputsToConsume = remaining - options.targetUtxos + batches.length; 
    // Actually, simple batching:
    const size = Math.min(options.batchSize, allUtxos.length - idx);
    if (size < 2) break; // Cannot consolidate 1 input
    
    const batch = allUtxos.slice(idx, idx + size);
    batches.push(batch);
    idx += size;
    remaining -= (size - 1);
  }

  const afterEstimate = remaining;
  const estimatedFees = batches.length * 1500 * Number(options.batchSize); // extremely rough bound

  if (options.dryRun || !options.execute) {
    if (options.json) {
      console.log(JSON.stringify({
        account: resolvedAccount.name,
        before: beforeCount,
        afterEstimate,
        batches: batches.length,
        maxInputs: options.batchSize,
        strategy: "smallest-first"
      }, null, 2));
    } else {
      console.log(`HardKAS UTXO Consolidation\n`);
      console.log(`Account:\n ${resolvedAccount.name}\n`);
      console.log(`Network:\n ${resolvedName}\n`);
      console.log(`Before:\n ${beforeCount} UTXOs\n`);
      console.log(`Strategy:\n smallest-first\n`);
      console.log(`Plan:`);
      for (let i = 0; i < batches.length; i++) {
        console.log(` Batch ${i + 1}: ${batches[i]!.length} inputs -> 1 output`);
      }
      console.log(` Expected after: ~${afterEstimate} UTXOs\n`);
      console.log(`Status:\n DRY RUN - no transactions created\n`);
    }
    return;
  }

  if (options.execute && !options.yes) {
    throw new Error("Execution requires the --yes flag to confirm broadcast.");
  }

  // Execution
  const receipts: string[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    if (!options.json) {
      console.log(`\nExecuting Batch ${i + 1}/${batches.length} (${batch.length} inputs)...`);
    }

    const plan = await sdk.tx.createConsolidationPlan({
      account: resolvedAccount,
      selectedUtxos: batch,
      destination: resolvedAccount.address!,
      network: resolvedName,
      totalUtxosSeen: beforeCount
    });

    const signed = await sdk.tx.sign(plan, resolvedAccount);
    
    let receipt;
    if (provider.mode === "simulated") {
      const simResult = await sdk.tx.simulate(signed, { persist: true });
      receipt = simResult.receipt;
    } else {
      const sendResult = await sdk.tx.send(signed, provider.endpoint);
      receipt = sendResult.receipt;
    }
    
    receipts.push(receipt.txId);
    
    if (!options.json) {
      console.log(`Submitted batch ${i + 1}/${batches.length}: ${receipt.txId}`);
    }
  }

  // Reload local state to see if it decreased
  const { loadOrCreateLocalnetState, getSpendableUtxos } = await import("@hardkas/localnet");
  const localState = await loadOrCreateLocalnetState({ cwd: sdk.workspace.root });
  const finalUtxos = getSpendableUtxos(localState, resolvedAccount.address!);

  if (options.json) {
    console.log(JSON.stringify({
      account: resolvedAccount.name,
      before: beforeCount,
      afterEstimate,
      batches: batches.length,
      maxInputs: options.batchSize,
      strategy: "smallest-first",
      receipts
    }, null, 2));
  } else {
    console.log(`\nConsolidation complete.`);
    console.log(`Receipts generated: ${receipts.length}`);
    console.log(`Check final balance with: hardkas accounts balance ${resolvedAccount.name}`);
  }
}
