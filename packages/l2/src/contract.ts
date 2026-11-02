import {
  encodeFunctionData,
  decodeFunctionResult,
  decodeEventLog,
  encodeDeployData,
  encodeEventTopics,
  getContractAddress,
  type Abi
} from "viem";
import { EvmJsonRpcClient, type EvmLogEntry } from "./evm-rpc-client.js";
import {
  prepareEvmTransaction,
  sendAndConfirmTransaction,
  type EvmSigner,
  type L2WriteOptions
} from "./tx-pipeline.js";
import type { EvmTransactionReceiptSummary } from "./evm-receipts.js";
import { L2SafetyError } from "./errors.js";
import { isAddress } from "./hex.js";

/**
 * CREATE deployment (a transaction with no `to`). The contract address is DERIVED locally from
 * (sender, nonce) and must equal the receipt's contractAddress. CREATE2 deployments go through a
 * factory contract call (use writeContract) and are not covered by this derivation.
 */
export interface DeployContractOptions extends L2WriteOptions {
  readonly bytecode: string;
  readonly abi?: readonly unknown[] | undefined;
  readonly args?: readonly unknown[] | undefined;
  readonly gasLimit?: bigint | undefined;
  readonly maxFeePerGas?: bigint | undefined;
  readonly maxPriorityFeePerGas?: bigint | undefined;
  readonly value?: bigint | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface DeployContractResult {
  readonly contractAddress: `0x${string}`;
  readonly txHash: `0x${string}`;
  readonly receipt: EvmTransactionReceiptSummary;
  readonly deploymentKind: "create";
}

export interface ReadContractOptions {
  readonly address: string;
  readonly abi: readonly unknown[];
  readonly functionName: string;
  readonly args?: readonly unknown[] | undefined;
  readonly blockTag?: "latest" | "pending" | undefined;
}

export interface WriteContractOptions extends L2WriteOptions {
  readonly address: string;
  readonly abi: readonly unknown[];
  readonly functionName: string;
  readonly args?: readonly unknown[] | undefined;
  readonly value?: bigint | undefined;
  readonly gasLimit?: bigint | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface DecodedContractEvent {
  readonly eventName: string;
  readonly args: any;
  readonly address: string;
  readonly blockNumber?: bigint | undefined;
  readonly transactionHash?: string | undefined;
  readonly logIndex?: number | undefined;
  readonly raw: EvmLogEntry;
}

function writeOptions(o: L2WriteOptions): L2WriteOptions {
  return {
    ...(o.expectedChainId !== undefined ? { expectedChainId: o.expectedChainId } : {}),
    ...(o.profile !== undefined ? { profile: o.profile } : {}),
    ...(o.allowMainnet !== undefined ? { allowMainnet: o.allowMainnet } : {}),
    ...(o.feeLimits !== undefined ? { feeLimits: o.feeLimits } : {})
  };
}

export async function deployContract(
  client: EvmJsonRpcClient,
  signer: EvmSigner,
  options: DeployContractOptions
): Promise<DeployContractResult> {
  let formattedBytecode = options.bytecode.trim();
  if (!formattedBytecode.startsWith("0x")) {
    formattedBytecode = `0x${formattedBytecode}`;
  }

  let deployData = formattedBytecode as `0x${string}`;
  if (options.abi && options.args && options.args.length > 0) {
    deployData = encodeDeployData({
      abi: options.abi as Abi,
      bytecode: formattedBytecode as `0x${string}`,
      args: options.args as any
    });
  }

  const prepared = await prepareEvmTransaction(
    client,
    signer.getAddress(),
    {
      data: deployData,
      value: options.value,
      gasLimit: options.gasLimit,
      maxFeePerGas: options.maxFeePerGas,
      maxPriorityFeePerGas: options.maxPriorityFeePerGas
    },
    writeOptions(options)
  );
  if (prepared.to !== undefined) {
    throw new L2SafetyError("L2_INVALID_TX_PARAMS", "A CREATE deployment must not have a 'to' address.");
  }

  const { rawTransaction, txHash } = await signer.signTransaction(prepared);
  const receipt = await sendAndConfirmTransaction(client, rawTransaction, {
    ...writeOptions(options),
    expectedChainId: prepared.chainId,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {})
  });

  const reported = receipt.contractAddress;
  if (!reported || !isAddress(reported)) {
    throw new L2SafetyError(
      "L2_CONTRACT_ADDRESS_MISMATCH",
      `Deployment ${txHash} succeeded per the RPC, but the receipt has no valid contractAddress.`,
      { txHash, reported }
    );
  }

  // Derive the CREATE address locally from the signer and the nonce the transaction was signed with.
  const derived = getContractAddress({
    opcode: "CREATE",
    from: prepared.from,
    nonce: BigInt(prepared.nonce)
  });
  if (derived.toLowerCase() !== reported.toLowerCase()) {
    throw new L2SafetyError(
      "L2_CONTRACT_ADDRESS_MISMATCH",
      `Receipt contractAddress ${reported} differs from the CREATE address ${derived} derived from ${prepared.from} / nonce ${prepared.nonce}.`,
      { txHash, reported, derived, nonce: prepared.nonce }
    );
  }
  if (receipt.from !== undefined && receipt.from.toLowerCase() !== prepared.from.toLowerCase()) {
    throw new L2SafetyError(
      "L2_CONTRACT_ADDRESS_MISMATCH",
      `Receipt sender ${receipt.from} differs from the signer ${prepared.from}.`,
      { txHash }
    );
  }

  return {
    contractAddress: derived,
    txHash,
    receipt,
    deploymentKind: "create"
  };
}

export async function readContract<T = any>(
  client: EvmJsonRpcClient,
  options: ReadContractOptions
): Promise<T> {
  const callData = encodeFunctionData({
    abi: options.abi as Abi,
    functionName: options.functionName,
    args: (options.args ?? []) as any
  });

  const hexResult = await client.call(
    {
      to: options.address,
      data: callData
    },
    options.blockTag ?? "latest"
  );

  const decoded = decodeFunctionResult({
    abi: options.abi as Abi,
    functionName: options.functionName,
    data: hexResult as `0x${string}`
  });

  return decoded as T;
}

export async function writeContract(
  client: EvmJsonRpcClient,
  signer: EvmSigner,
  options: WriteContractOptions
): Promise<{ txHash: `0x${string}`; receipt: EvmTransactionReceiptSummary }> {
  if (!isAddress(options.address)) {
    throw new L2SafetyError("L2_INVALID_TX_PARAMS", `Invalid contract address: ${options.address}`);
  }
  const callData = encodeFunctionData({
    abi: options.abi as Abi,
    functionName: options.functionName,
    args: (options.args ?? []) as any
  });

  const prepared = await prepareEvmTransaction(
    client,
    signer.getAddress(),
    {
      to: options.address,
      data: callData,
      value: options.value,
      gasLimit: options.gasLimit
    },
    writeOptions(options)
  );

  const { rawTransaction, txHash } = await signer.signTransaction(prepared);
  const receipt = await sendAndConfirmTransaction(client, rawTransaction, {
    ...writeOptions(options),
    expectedChainId: prepared.chainId,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {})
  });

  return {
    txHash,
    receipt
  };
}

export interface GetContractEventsOptions {
  readonly address?: string | undefined;
  readonly abi: readonly unknown[];
  readonly eventName?: string | undefined;
  readonly fromBlock?: bigint | number | string | undefined;
  readonly toBlock?: bigint | number | string | undefined;
  readonly chunkSize?: number | undefined;
}

export async function getContractEvents(
  client: EvmJsonRpcClient,
  options: GetContractEventsOptions
): Promise<DecodedContractEvent[]> {
  let topics: (string | string[] | null)[] | undefined;
  if (options.eventName) {
    const encodedTopics = encodeEventTopics({
      abi: options.abi as Abi,
      eventName: options.eventName
    });
    topics = encodedTopics as any;
  }

  const rawLogs = options.chunkSize
    ? await client.getLogsChunked({
        address: options.address,
        fromBlock: options.fromBlock ?? "0x0",
        toBlock: options.toBlock ?? "latest",
        topics,
        chunkSize: options.chunkSize
      })
    : await client.getLogs({
        address: options.address,
        fromBlock: options.fromBlock ?? "0x0",
        toBlock: options.toBlock ?? "latest",
        topics
      });

  const seen = new Set<string>();
  const decodedEvents: DecodedContractEvent[] = [];

  for (const log of rawLogs) {
    // Skip logs invalidated by chain reorganizations (standard EVM JSON-RPC removed flag)
    if ((log as any).removed) {
      continue;
    }

    // Identity is strictly composite: blockHash + transactionHash + logIndex.
    // Events in different blocks or transactions with the same in-block logIndex are preserved.
    const key = `${log.blockHash ?? ""}-${log.transactionHash ?? ""}-${log.logIndex ?? ""}`;
    if (seen.has(key)) {
      continue; // Deduplicate re-fetched identical log entries
    }
    seen.add(key);

    try {
      const decoded = decodeEventLog({
        abi: options.abi as Abi,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        eventName: options.eventName
      });

      decodedEvents.push({
        eventName: decoded.eventName,
        args: decoded.args,
        address: log.address,
        blockNumber: log.blockNumber ? BigInt(log.blockNumber) : undefined,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex ? parseInt(log.logIndex, 16) : undefined,
        raw: log
      });
    } catch {
      // If a log topic does not match this event schema, skip gracefully
    }
  }

  return decodedEvents;
}
