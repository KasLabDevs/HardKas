import fs from "node:fs/promises";
import path from "node:path";
import { 
  getL2Profile, 
  EvmJsonRpcClient, 
  toHexQuantity,
  EvmCallRequest,
  UnsupportedIgraTxSigner,
  IgraTxSigner,
  IgraTxSigningInput,
  normalizeEvmTransactionReceipt
} from "@hardkas/l2";
import { 
  IgraTxPlanArtifact,
  IgraSignedTxArtifact,
  assertValidIgraTxPlanArtifact,
  assertValidIgraSignedTxArtifact,
  writeArtifact,
  readArtifact,
  HARDKAS_VERSION,
  ARTIFACT_SCHEMAS,
  createIgraPlanId,
  createIgraSignedId,
  IgraTxReceiptArtifact,
  assertValidIgraTxReceiptArtifact,
  listIgraTxReceiptArtifacts,
  loadIgraTxReceiptArtifact
} from "@hardkas/artifacts";
import { 
  loadRealAccountStore, 
  resolveRealAccountOrAddress 
} from "@hardkas/accounts";

export interface L2TxBuildOptions {
  network?: string;
  url?: string;
  from?: string;
  to: string;
  data?: string;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
  nonce?: string;
  outDir?: string;
  json?: boolean;
}

export async function runL2TxBuild(options: L2TxBuildOptions): Promise<void> {
  // ... (existing runL2TxBuild code)
  const networkName = options.network ?? "igra";
  const profile = getL2Profile(networkName);

  if (!profile) {
    throw new Error(`L2 profile '${networkName}' not found.`);
  }

  const rpcUrl = options.url ?? profile.rpcUrl;
  if (!rpcUrl) {
    throw new Error(`No L2 RPC URL configured for network '${networkName}'. Pass --url <rpcUrl>.`);
  }

  const client = new EvmJsonRpcClient({ url: rpcUrl });

  // 1. Basic Validation
  if (options.from) assertEvmAddress(options.from, "from");
  if (!options.to) {
    throw new Error("Missing 'to' address. For this phase, 'to' is required.");
  }
  assertEvmAddress(options.to, "to");
  if (options.data) assertHexData(options.data, "data");

  // 2. Fetch Network Info
  const chainId = await client.getChainId();
  
  let nonce = options.nonce;
  if (!nonce && options.from) {
    const n = await client.getTransactionCount(options.from, "latest");
    nonce = n.toString();
  }

  let gasPrice = options.gasPrice;
  if (!gasPrice) {
    const gp = await client.getGasPriceWei();
    gasPrice = gp.toString();
  }

  const request: EvmCallRequest = {
    ...(options.from ? { from: options.from } : {}),
    to: options.to,
    data: options.data ?? "0x",
    value: options.value ? toHexQuantity(options.value) : "0x0"
  };

  let gasLimit = options.gasLimit;
  if (!gasLimit) {
    const g = await client.estimateGas(request, "latest");
    gasLimit = g.toString();
  }

  const estimatedFeeWei = (BigInt(gasLimit) * BigInt(gasPrice)).toString();

  // 3. Build Artifact
  const planId = createIgraPlanId();
  
  const artifact: IgraTxPlanArtifact = {
    schema: ARTIFACT_SCHEMAS.IGRA_TX_PLAN,
    hardkasVersion: HARDKAS_VERSION,
    networkId: profile.name,
    mode: "l2-rpc",
    createdAt: new Date().toISOString(),
    planId,
    l2Network: profile.name,
    chainId,
    request: {
      ...(options.from ? { from: options.from } : {}),
      to: options.to,
      data: options.data ?? "0x",
      valueWei: options.value ?? "0",
      gasLimit,
      gasPriceWei: gasPrice,
      ...(nonce ? { nonce } : {})
    },
    estimatedGas: gasLimit,
    estimatedFeeWei,
    status: "built"
  };

  // 4. Validate and Save
  assertValidIgraTxPlanArtifact(artifact);

  const outDir = options.outDir || "plans";
  const sanitizedDir = path.normalize(outDir).replace(/^(\.\.[\/\\])+/, "");
  await fs.mkdir(sanitizedDir, { recursive: true });

  const artifactPath = path.join(sanitizedDir, `${planId}.igra.plan.json`);
  await writeArtifact(artifactPath, artifact);

  // 5. Output
  if (options.json) {
    console.log(JSON.stringify({
      networkId: profile.name,
      l2Network: networkName,
      chainId,
      planId,
      artifactPath,
      artifact
    }, null, 2));
    return;
  }

  console.log(`${profile.displayName} L2 transaction plan built`);
  console.log("");
  console.log(`Plan ID:    ${planId}`);
  console.log(`Network:    ${networkName}`);
  console.log(`Chain ID:   ${chainId}`);
  console.log(`Mode:       l2-rpc`);
  if (options.from) console.log(`From:       ${options.from}`);
  console.log(`To:         ${options.to}`);
  console.log(`Value:      ${options.value ?? "0"} wei`);
  console.log(`Gas limit:  ${gasLimit}`);
  console.log(`Gas price:  ${gasPrice} wei`);
  console.log(`Est. fee:   ${estimatedFeeWei} wei`);
  if (nonce) console.log(`Nonce:      ${nonce}`);
  console.log("");
  console.log("Artifact:");
  console.log(`  ${artifactPath}`);
  console.log("");
  console.log("Next:");
  console.log(`  hardkas l2 tx sign ${artifactPath} --account <name>`);
  console.log("");
  console.log("Warning:");
  console.log("  This is an Igra L2 EVM transaction plan, not a Kaspa L1 UTXO transaction.");
}

export interface L2TxSignOptions {
  planPath: string;
  account?: string;
  outDir?: string;
  json?: boolean;
  signerOverride?: IgraTxSigner;
}

export async function runL2TxSign(options: L2TxSignOptions): Promise<void> {
  // 1. Load and Validate Plan
  const planData = await readArtifact(options.planPath);
  assertValidIgraTxPlanArtifact(planData);
  const plan = planData as IgraTxPlanArtifact;

  if (plan.schema !== ARTIFACT_SCHEMAS.IGRA_TX_PLAN) {
    throw new Error(`Invalid plan schema: ${plan.schema}`);
  }
  if (plan.mode !== "l2-rpc") {
    throw new Error(`Invalid plan mode: ${plan.mode} (expected 'l2-rpc')`);
  }
  if (plan.status !== "built") {
    throw new Error(`Invalid plan status: ${plan.status} (expected 'built')`);
  }

  // 2. Resolve Account
  let accountInfo: IgraTxSigningInput["account"] | undefined;
  if (options.account) {
    const store = await loadRealAccountStore();
    const accountData = resolveRealAccountOrAddress(store, options.account) as any;
    
    // Safety check: address mismatch
    if (plan.request.from && plan.request.from.toLowerCase() !== accountData.address.toLowerCase()) {
      throw new Error(`Account address mismatch: plan specifies '${plan.request.from}' but resolved account '${accountData.name ?? accountData.address}' is '${accountData.address}'`);
    }

    accountInfo = {
      name: accountData.name ?? undefined,
      address: accountData.address,
      privateKey: accountData.privateKey ?? undefined
    };
  }

  // 3. Sign
  const { ViemIgraTxSigner } = await import("@hardkas/l2");
  const signer = options.signerOverride ?? new ViemIgraTxSigner();
  
  let result;
  try {
    result = await signer.sign({
      plan,
      account: accountInfo!
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("not configured yet") || msg.includes("dependency (viem) is not installed")) {
      console.log("");
      console.log("Igra L2 signing is not available");
      console.log("");
      console.log("Reason:");
      console.log(`  ${msg}`);
      console.log("");
      console.log("Suggestion:");
      if (msg.includes("viem")) {
        console.log("  Run 'pnpm add viem' in your project or configure an EVM signer adapter.");
      } else {
        console.log("  Configure an EVM-compatible signer adapter in a future phase.");
      }
      console.log("  No artifact was written.");
      process.exit(1);
    }
    throw e;
  }

  // 4. Create Artifact
  const signedId = createIgraSignedId();
  const artifact: IgraSignedTxArtifact = {
    schema: ARTIFACT_SCHEMAS.IGRA_SIGNED_TX,
    hardkasVersion: HARDKAS_VERSION,
    networkId: plan.networkId,
    mode: "l2-rpc",
    createdAt: new Date().toISOString(),
    signedId,
    sourcePlanId: plan.planId,
    sourcePlanPath: options.planPath,
    l2Network: plan.l2Network,
    chainId: plan.chainId,
    rawTransaction: result.rawTransaction,
    txHash: result.txHash || "unknown",
    status: "signed"
  };

  assertValidIgraSignedTxArtifact(artifact);

  // 5. Save
  const outDir = options.outDir || "signed";
  const sanitizedDir = path.normalize(outDir).replace(/^(\.\.[\/\\])+/, "");
  await fs.mkdir(sanitizedDir, { recursive: true });

  const artifactPath = path.join(sanitizedDir, `${signedId}.igra.signed.json`);
  await writeArtifact(artifactPath, artifact);

  // 6. Output
  if (options.json) {
    console.log(JSON.stringify({
      networkId: plan.networkId,
      l2Network: plan.l2Network,
      chainId: plan.chainId,
      signedId,
      artifactPath,
      artifact
    }, null, 2));
    return;
  }

  console.log("Igra L2 transaction signed");
  console.log("");
  console.log(`Signed ID: ${signedId}`);
  console.log(`Source:    ${options.planPath}`);
  console.log(`Network:   ${plan.networkId}`);
  console.log(`Chain ID:  ${plan.chainId}`);
  if (plan.request.from) console.log(`From:      ${plan.request.from}`);
  console.log(`To:        ${plan.request.to}`);
  console.log(`Value:     ${plan.request.valueWei} wei`);
  console.log("");
  console.log("Artifact:");
  console.log(`  ${artifactPath}`);
  console.log("");
  console.log("Next:");
  console.log("  L2 transaction sending is not implemented yet.");
  console.log("");
  console.log("Warning:");
  console.log("  This is an Igra L2 EVM signed transaction, not a Kaspa L1 UTXO transaction.");
}

export interface L2TxSendOptions {
  signedPath: string;
  network?: string;
  url?: string;
  yes?: boolean;
  json?: boolean;
}

export async function runL2TxSend(options: L2TxSendOptions): Promise<void> {
  // 1. Load and Validate Signed Artifact
  const artifactData = await readArtifact(options.signedPath);
  assertValidIgraSignedTxArtifact(artifactData);
  const artifact = artifactData as IgraSignedTxArtifact;

  if (artifact.schema !== ARTIFACT_SCHEMAS.IGRA_SIGNED_TX) {
    throw new Error(`Invalid signed artifact schema: ${artifact.schema}`);
  }
  if (artifact.mode !== "l2-rpc") {
    throw new Error(`Invalid artifact mode: ${artifact.mode} (expected 'l2-rpc')`);
  }
  if (artifact.status !== "signed") {
    throw new Error(`Invalid artifact status: ${artifact.status} (expected 'signed')`);
  }

  // 2. Guards
  if (!options.yes) {
    console.log("");
    console.log("Refusing to submit Igra L2 transaction without --yes.");
    console.log("");
    console.log("Reason:");
    console.log("  This operation broadcasts a signed L2 transaction.");
    console.log("");
    console.log("Use:");
    console.log(`  hardkas l2 tx send ${options.signedPath} --yes`);
    process.exit(1);
  }

  const networkName = options.network ?? artifact.l2Network ?? "igra";
  const profile = getL2Profile(networkName);

  if (!profile) {
    throw new Error(`L2 profile '${networkName}' not found.`);
  }

  // Mainnet/Production guardrail
  const isMainnet = networkName === "mainnet" || profile.name.includes("mainnet") || artifact.networkId === "mainnet" || artifact.chainId === 1;
  if (isMainnet) {
    throw new Error("L2 mainnet broadcast is disabled in HardKAS v0.2-alpha.");
  }

  const rpcUrl = options.url ?? profile.rpcUrl;
  if (!rpcUrl) {
    throw new Error(`No L2 RPC URL configured for network '${networkName}'. Pass --url <rpcUrl>.`);
  }

  // 3. RPC Validation
  const client = new EvmJsonRpcClient({ url: rpcUrl });
  const remoteChainId = await client.getChainId();

  if (remoteChainId !== artifact.chainId) {
    console.log("");
    console.log("Refusing to submit Igra L2 transaction: signed artifact chainId does not match RPC endpoint.");
    console.log("");
    console.log(`Artifact chainId: ${artifact.chainId}`);
    console.log(`RPC chainId:      ${remoteChainId}`);
    console.log("");
    console.log("Suggestion:");
    console.log("  Check --url and --network.");
    process.exit(1);
  }

  // 4. Send
  const txHash = await client.sendRawTransaction(artifact.rawTransaction);

  // 5. Receipt
  const receipt: IgraTxReceiptArtifact = {
    schema: ARTIFACT_SCHEMAS.IGRA_TX_RECEIPT,
    hardkasVersion: HARDKAS_VERSION,
    networkId: artifact.networkId,
    mode: "l2-rpc",
    createdAt: new Date().toISOString(),
    txHash,
    sourceSignedId: artifact.signedId,
    sourceSignedPath: options.signedPath,
    l2Network: artifact.l2Network,
    chainId: artifact.chainId,
    rpcUrl,
    status: "submitted"
  };

  assertValidIgraTxReceiptArtifact(receipt);

  const receiptDir = path.join(".hardkas", "l2-receipts");
  await fs.mkdir(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, `${txHash}.igra.receipt.json`);
  await writeArtifact(receiptPath, receipt);

  // 6. Output
  if (options.json) {
    console.log(JSON.stringify({
      networkId: artifact.networkId,
      l2Network: networkName,
      chainId: artifact.chainId,
      rpcUrl,
      txHash,
      artifactPath: options.signedPath,
      receiptPath,
      receipt
    }, (key, value) => typeof value === "bigint" ? value.toString() : value, 2));
    return;
  }

  console.log("Igra L2 transaction submitted");
  console.log("");
  console.log(`Tx hash:   ${txHash}`);
  console.log(`Network:   ${networkName}`);
  console.log(`Chain ID:  ${artifact.chainId}`);
  console.log(`Mode:      l2-rpc`);
  console.log(`Source:    ${options.signedPath}`);
  console.log(`RPC:       ${rpcUrl}`);
  console.log("");
  console.log("Receipt:");
  console.log(`  ${receiptPath}`);
  console.log("");
  console.log("Next:");
  console.log("  Check receipt:");
  console.log(`    hardkas l2 tx receipt ${txHash} --network ${networkName}`);
  console.log("");
  console.log("Warning:");
  console.log("  This is an Igra L2 EVM transaction, not a Kaspa L1 UTXO transaction.");
}

export interface L2TxReceiptOptions {
  txHash: string;
  network?: string;
  url?: string;
  json?: boolean;
}

export async function runL2TxReceipt(options: L2TxReceiptOptions): Promise<void> {
  let localReceipt: IgraTxReceiptArtifact | undefined;
  try {
    localReceipt = await loadIgraTxReceiptArtifact(options.txHash);
  } catch (e) {
    // Ignore, we'll try RPC if url is provided
  }

  const networkName = options.network ?? localReceipt?.l2Network ?? "igra";
  const profile = getL2Profile(networkName);
  const rpcUrl = options.url ?? profile?.rpcUrl;

  let remoteReceipt: any = null;
  if (rpcUrl) {
    const client = new EvmJsonRpcClient({ url: rpcUrl });
    const raw = await client.getTransactionReceipt(options.txHash);
    remoteReceipt = normalizeEvmTransactionReceipt(raw);
  }

  if (!localReceipt && !remoteReceipt) {
    throw new Error(`Receipt not found for tx ${options.txHash} locally or via RPC.`);
  }

  const status = remoteReceipt?.status ?? (localReceipt ? "submitted" : "pending");

  if (options.json) {
    console.log(JSON.stringify({
      networkId: localReceipt?.networkId ?? "igra",
      l2Network: networkName,
      chainId: localReceipt?.chainId,
      rpcUrl,
      txHash: options.txHash,
      status,
      local: localReceipt,
      remote: remoteReceipt
    }, (key, value) => typeof value === "bigint" ? value.toString() : value, 2));
    return;
  }

  console.log("Igra L2 transaction receipt");
  console.log("");
  console.log(`Tx hash:   ${options.txHash}`);
  console.log(`Network:   ${networkName}`);
  if (localReceipt) {
    console.log(`Chain ID:  ${localReceipt.chainId}`);
    console.log(`Local:     found`);
    console.log(`Created:   ${localReceipt.createdAt}`);
  } else {
    console.log(`Local:     not found`);
  }
  
  if (remoteReceipt) {
    console.log("");
    console.log("Remote Status:");
    console.log(`  Status:    ${remoteReceipt.status}`);
    console.log(`  Block:     ${remoteReceipt.blockNumber ?? "unknown"}`);
    console.log(`  Gas used:  ${remoteReceipt.gasUsed ?? "unknown"}`);
  } else if (rpcUrl) {
    console.log("");
    console.log("Remote Status: pending or not found on this node");
  }

  console.log("");
  console.log("Warning:");
  console.log("  This is an Igra L2 EVM transaction receipt, not a Kaspa L1 transaction.");
}

export interface L2TxReceiptsOptions {
  json?: boolean;
}

export async function runL2TxReceipts(options: L2TxReceiptsOptions): Promise<void> {
  const receipts = await listIgraTxReceiptArtifacts();

  if (options.json) {
    console.log(JSON.stringify(receipts, (key, value) => typeof value === "bigint" ? value.toString() : value, 2));
    return;
  }

  console.log("Igra L2 receipts");
  console.log("");

  if (receipts.length === 0) {
    console.log("none");
    return;
  }

  for (const r of receipts) {
    const shortHash = r.txHash.substring(0, 10) + "...";
    console.log(`${shortHash.padEnd(15)} ${r.status.padEnd(12)} chain ${r.chainId.toString().padEnd(8)} network ${r.l2Network.padEnd(10)} ${r.createdAt}`);
  }
}

export interface L2TxStatusOptions {
  txHash: string;
  network?: string;
  url?: string;
  json?: boolean;
}

export async function runL2TxStatus(options: L2TxStatusOptions): Promise<void> {
  const networkName = options.network ?? "igra";
  const profile = getL2Profile(networkName);
  const rpcUrl = options.url ?? profile?.rpcUrl;

  if (!rpcUrl) {
    throw new Error(`No L2 RPC URL configured for network '${networkName}'. Pass --url <rpcUrl>.`);
  }

  const client = new EvmJsonRpcClient({ url: rpcUrl });
  const raw = await client.getTransactionReceipt(options.txHash);
  const remoteReceipt = normalizeEvmTransactionReceipt(raw);

  const status = remoteReceipt?.status ?? "pending";

  if (options.json) {
    console.log(JSON.stringify({
      networkId: profile?.name ?? networkName,
      l2Network: networkName,
      rpcUrl,
      txHash: options.txHash,
      status,
      remote: remoteReceipt
    }, (key, value) => typeof value === "bigint" ? value.toString() : value, 2));
    return;
  }

  console.log("Igra L2 transaction status");
  console.log("");
  console.log(`Tx hash:   ${options.txHash}`);
  console.log(`Network:   ${networkName}`);
  console.log(`Status:    ${status}`);
  
  if (remoteReceipt) {
    console.log(`Block:     ${remoteReceipt.blockNumber ?? "unknown"}`);
    console.log(`Gas used:  ${remoteReceipt.gasUsed ?? "unknown"}`);
  }
}

function assertEvmAddress(address: string, field: string): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`Invalid EVM ${field}: must be a 0x-prefixed 40-character hex string.`);
  }
}

function assertHexData(data: string, field: string): void {
  if (!/^0x([a-fA-F0-9]{2})*$/.test(data)) {
    throw new Error(`Invalid hex ${field}: must be a 0x-prefixed even-length hex string.`);
  }
}
