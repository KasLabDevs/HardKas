import fs from "node:fs/promises";
import path from "node:path";
import {
  resolveL2Profile,
  EvmJsonRpcClient,
  toHexQuantity,
  EvmCallRequest,
  IgraTxSigner,
  IgraTxSigningInput,
  normalizeEvmTransactionReceipt,
  assertL2WriteAllowed,
  assertFeeWithinLimits,
  resolveFeeLimits,
  assertRawTransactionAllowed,
  sendRawTransactionResilient,
  L2SafetyError,
  type L2NetworkProfile,
  type L2FeeLimitsInput
} from "@hardkas/l2";
import { loadHardkasConfig } from "@hardkas/config";
import { redactUrlCredentials } from "@hardkas/core";
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
  createIgraDeployPlanId,
  createIgraSignedId,
  IgraTxReceiptArtifact,
  assertValidIgraTxReceiptArtifact,
  listIgraTxReceiptArtifacts,
  loadIgraTxReceiptArtifact,
  calculateContentHash,
  recomputeDeclaredContentHash,
  CURRENT_HASH_VERSION
} from "@hardkas/artifacts";
import { loadRealAccountStore, resolveRealAccountOrAddress } from "@hardkas/accounts";
import { keccak256, parseTransaction, recoverTransactionAddress } from "viem";

/** Flags shared by every L2 command that signs or broadcasts. */
export interface L2WriteFlags {
  /** Explicit mainnet authorization. `--yes` never implies it. */
  allowMainnet?: boolean;
  maxGasLimit?: string;
  maxFeePerGas?: string;
  maxTotalFee?: string;
}

function feeLimitsFromFlags(flags: L2WriteFlags): L2FeeLimitsInput {
  const out: Record<string, string> = {};
  const put = (k: string, v: string | undefined, flag: string) => {
    if (v === undefined) return;
    if (!/^[0-9]+$/.test(v)) {
      throw new L2SafetyError("L2_FEE_POLICY_REQUIRED", `${flag} must be a decimal integer (got '${v}').`);
    }
    out[k] = v;
  };
  put("maxGasLimit", flags.maxGasLimit, "--max-gas-limit");
  put("maxFeePerGasWei", flags.maxFeePerGas, "--max-fee-per-gas");
  put("maxTotalFeeWei", flags.maxTotalFee, "--max-total-fee");
  return out as L2FeeLimitsInput;
}

function decimalOrUndefined(value: string | undefined, flag: string): bigint | undefined {
  if (value === undefined) return undefined;
  if (!/^[0-9]+$/.test(value)) {
    throw new L2SafetyError("L2_INVALID_TX_PARAMS", `${flag} must be a non-negative decimal integer (got '${value}').`);
  }
  return BigInt(value);
}

function requireChainId(profile: L2NetworkProfile): number {
  if (profile.chainId === undefined) {
    throw new L2SafetyError("L2_CHAIN_ID_REQUIRED", `Profile '${profile.name}' has no chain ID.`);
  }
  return profile.chainId;
}

/** Recomputes the content hash and the derived ID of a plan/signed artifact; refuses tampered files. */
function assertArtifactUntampered(
  artifact: { contentHash?: string; hashVersion?: number } & Record<string, unknown>,
  idField: "planId" | "signedId",
  deriveId: (hash: string) => string,
  label: string
): void {
  if (typeof artifact.contentHash !== "string") {
    throw new L2SafetyError("L2_SIGNED_TX_MISMATCH", `${label} has no contentHash.`);
  }
  let recomputed: string;
  try {
    recomputed = recomputeDeclaredContentHash(artifact);
  } catch (e) {
    throw new L2SafetyError(
      "L2_SIGNED_TX_MISMATCH",
      `${label} cannot be verified: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (recomputed !== artifact.contentHash || artifact[idField] !== deriveId(recomputed)) {
    throw new L2SafetyError(
      "L2_SIGNED_TX_MISMATCH",
      `${label} was modified after it was written (contentHash/${idField} do not match its content).`,
      { declared: artifact.contentHash, recomputed }
    );
  }
}

/**
 * The signed transaction must be exactly the plan: same recipient, value, data, nonce, gas, gas price
 * and chain, and signed by the plan's `from` (recovered from the signature, not trusted from the signer).
 */
async function assertRawMatchesPlan(raw: `0x${string}`, plan: IgraTxPlanArtifact): Promise<void> {
  const tx = parseTransaction(raw);
  const r = plan.request;
  const mismatches: string[] = [];
  const eqAddr = (a: string | undefined | null, b: string | undefined | null) =>
    (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
  if (tx.chainId !== plan.chainId) mismatches.push(`chainId ${tx.chainId} != ${plan.chainId}`);
  if (!eqAddr(tx.to, r.to)) mismatches.push(`to ${tx.to} != ${r.to}`);
  if ((tx.value ?? 0n) !== BigInt(r.valueWei)) mismatches.push(`value ${tx.value} != ${r.valueWei}`);
  if ((tx.data ?? "0x").toLowerCase() !== (r.data ?? "0x").toLowerCase()) mismatches.push("data differs");
  if (r.nonce !== undefined && BigInt(tx.nonce ?? -1) !== BigInt(r.nonce)) mismatches.push(`nonce ${tx.nonce} != ${r.nonce}`);
  if (r.gasLimit !== undefined && tx.gas !== BigInt(r.gasLimit)) mismatches.push(`gas ${tx.gas} != ${r.gasLimit}`);
  const price = tx.type === "eip1559" ? tx.maxFeePerGas : tx.gasPrice;
  if (r.gasPriceWei !== undefined && price !== BigInt(r.gasPriceWei)) mismatches.push(`gasPrice ${price} != ${r.gasPriceWei}`);
  if (r.from) {
    const signer = await recoverTransactionAddress({ serializedTransaction: raw as any });
    if (!eqAddr(signer, r.from)) mismatches.push(`signer ${signer} != from ${r.from}`);
  }
  if (mismatches.length > 0) {
    throw new L2SafetyError(
      "L2_SIGNED_TX_MISMATCH",
      `Signed transaction does not match the plan: ${mismatches.join("; ")}.`,
      { mismatches }
    );
  }
}

function resolveWriteProfile(
  name: string | undefined,
  artifactNetwork: string | undefined,
  loadedNetworks: Record<string, any> | undefined,
  overrides: { url?: string | undefined; chainId?: string | number | undefined }
): L2NetworkProfile {
  if (name && artifactNetwork && name !== artifactNetwork) {
    throw new L2SafetyError(
      "L2_CHAIN_ID_MISMATCH",
      `--network ${name} does not match the artifact's network '${artifactNetwork}'.`
    );
  }
  const chosen = name || artifactNetwork;
  if (!chosen) {
    throw new L2SafetyError(
      "L2_CHAIN_ID_REQUIRED",
      "An explicit --network is required to build an L2 transaction (local, igra-galleon, igra-mainnet)."
    );
  }
  return resolveL2Profile({
    name: chosen,
    userProfiles: loadedNetworks,
    cliOverrides: {
      ...(overrides.url !== undefined ? { url: overrides.url } : {}),
      ...(overrides.chainId !== undefined ? { chainId: overrides.chainId } : {})
    }
  });
}

export interface L2TxBuildOptions extends L2WriteFlags {
  network?: string;
  url?: string;
  from?: string;
  to: string;
  data?: string;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
  nonce?: string;
  chainId?: string | number;
  outDir?: string;
  json?: boolean;
}

export async function runL2TxBuild(options: L2TxBuildOptions): Promise<void> {
  const loaded = await loadHardkasConfig();
  const profile = resolveWriteProfile(options.network, undefined, loaded.config.l2?.networks, {
    url: options.url,
    chainId: options.chainId
  });
  const expectedChainId = requireChainId(profile);

  // Refuse before any network call: write policy, mainnet authorization, fee ceilings.
  assertL2WriteAllowed({
    chainId: expectedChainId,
    profile,
    allowMainnet: options.allowMainnet,
    operation: "l2 tx build"
  });
  const limits = resolveFeeLimits(feeLimitsFromFlags(options), profile.feePolicy);

  const rpcUrl = profile.rpcUrl;
  if (!rpcUrl) {
    throw new Error(
      `No L2 RPC URL configured for network '${profile.name}'. Pass --url <rpcUrl>.`
    );
  }

  const client = new EvmJsonRpcClient({ url: rpcUrl, profile });

  // 1. Basic Validation
  if (options.from) assertEvmAddress(options.from, "from");
  if (!options.to) {
    throw new Error("Missing 'to' address. For this phase, 'to' is required.");
  }
  assertEvmAddress(options.to, "to");
  if (options.data) assertHexData(options.data, "data");
  const valueWei = decimalOrUndefined(options.value, "--value") ?? 0n;
  const userNonce = decimalOrUndefined(options.nonce, "--nonce");
  const userGasPrice = decimalOrUndefined(options.gasPrice, "--gas-price");
  const userGasLimit = decimalOrUndefined(options.gasLimit, "--gas-limit");

  // 2. The endpoint must serve exactly the profile's chain (the RPC never chooses the chain).
  const chainId = await client.assertExpectedChainId();

  let nonce: bigint | undefined = userNonce;
  if (nonce === undefined && options.from) {
    nonce = await client.getTransactionCount(options.from, "pending");
  }

  const gasPrice = userGasPrice ?? (await client.getGasPriceWei());

  const request: EvmCallRequest = {
    ...(options.from ? { from: options.from } : {}),
    to: options.to,
    data: options.data ?? "0x",
    value: toHexQuantity(valueWei)
  };

  const gasLimit = userGasLimit ?? (await client.estimateGas(request, "latest"));

  // 3. Fee ceilings apply to user-supplied and RPC-estimated values alike.
  assertFeeWithinLimits({ gasLimit, feePerGasWei: gasPrice }, limits);
  const estimatedFeeWei = (gasLimit * gasPrice).toString();

  // 4. Build Artifact (Phase 1: Payload)
  const artifact: any = {
    schema: ARTIFACT_SCHEMAS.IGRA_TX_PLAN,
    hardkasVersion: HARDKAS_VERSION,
    networkId: profile.name,
    mode: "l2-rpc",
    createdAt: new Date().toISOString(),
    planId: "", // Placeholder
    l2Network: profile.name,
    chainId,
    request: {
      ...(options.from ? { from: options.from } : {}),
      to: options.to,
      data: options.data ?? "0x",
      valueWei: valueWei.toString(),
      gasLimit: gasLimit.toString(),
      gasPriceWei: gasPrice.toString(),
      ...(nonce !== undefined ? { nonce: nonce.toString() } : {})
    },
    estimatedGas: gasLimit.toString(),
    estimatedFeeWei,
    status: "built"
  };

  // Phase 2: Deterministic ID and Hash (hashVersion declared before hashing, IC-1′.3)
  artifact.hashVersion = CURRENT_HASH_VERSION;
  const hash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
  const planId = createIgraPlanId(hash);
  artifact.planId = planId;
  artifact.contentHash = hash;

  // 5. Validate and Save
  assertValidIgraTxPlanArtifact(artifact);

  const outDir = options.outDir || "plans";
  const sanitizedDir = path.normalize(outDir).replace(/^(\.\.[\/\\])+/, "");
  await fs.mkdir(sanitizedDir, { recursive: true });

  const artifactPath = path.join(sanitizedDir, `${planId}.igra.plan.json`);
  await writeArtifact(artifactPath, artifact);

  // 6. Output
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          networkId: profile.name,
          l2Network: profile.name,
          environment: profile.environment,
          chainId,
          planId,
          artifactPath,
          artifact
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`${profile.displayName} L2 transaction plan built (${profile.source})`);
  console.log("");
  console.log(`Plan ID:    ${planId}`);
  console.log(`Network:    ${profile.name} [${profile.environment}]`);
  console.log(`Chain ID:   ${chainId}`);
  console.log(`Mode:       l2-rpc`);
  if (options.from) console.log(`From:       ${options.from}`);
  console.log(`To:         ${options.to}`);
  console.log(`Value:      ${valueWei} wei`);
  console.log(`Gas limit:  ${gasLimit}`);
  console.log(`Gas price:  ${gasPrice} wei`);
  console.log(`Est. fee:   ${estimatedFeeWei} wei`);
  if (nonce !== undefined) console.log(`Nonce:      ${nonce}`);
  console.log("");
  console.log("Artifact:");
  console.log(`  ${artifactPath}`);
  console.log("");
  console.log("Next:");
  console.log(`  hardkas l2 tx sign ${artifactPath} --account <name>`);
  console.log("");
  console.log("Warning:");
  console.log(
    "  This is an Igra L2 EVM transaction plan, not a Kaspa L1 UTXO transaction."
  );
}

export interface L2TxSignOptions extends L2WriteFlags {
  planPath: string;
  network?: string;
  account?: string;
  outDir?: string;
  json?: boolean;
  signerOverride?: IgraTxSigner;
}

export async function runL2TxSign(options: L2TxSignOptions): Promise<void> {
  const loaded = await loadHardkasConfig();
  // 1. Load and Validate Plan (structure + integrity)
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
  assertArtifactUntampered(
    plan as any,
    "planId",
    (plan as any).txType === "contract-deploy" ? createIgraDeployPlanId : createIgraPlanId,
    "Plan artifact"
  );

  // 2. Network binding from the plan's profile (never from the plan's chainId alone)
  const profile = resolveWriteProfile(options.network, plan.l2Network, loaded.config.l2?.networks, {});
  const expectedChainId = requireChainId(profile);
  if (plan.chainId !== expectedChainId) {
    throw new L2SafetyError(
      "L2_CHAIN_ID_MISMATCH",
      `Plan chain ID ${plan.chainId} differs from profile '${profile.name}' chain ID ${expectedChainId}.`
    );
  }
  assertL2WriteAllowed({
    chainId: expectedChainId,
    profile,
    allowMainnet: options.allowMainnet,
    operation: "l2 tx sign"
  });
  const feeLimits = feeLimitsFromFlags(options);
  resolveFeeLimits(feeLimits, profile.feePolicy); // refuse early if no ceilings are available

  // 3. Resolve Account
  let accountInfo: IgraTxSigningInput["account"] | undefined;
  if (options.account) {
    const store = await loadRealAccountStore();
    const accountData = resolveRealAccountOrAddress(store, options.account) as Record<
      string,
      unknown
    >;

    // Safety check: address mismatch
    const accountAddress =
      typeof accountData.address === "string" ? accountData.address : "";
    if (
      plan.request.from &&
      plan.request.from.toLowerCase() !== accountAddress.toLowerCase()
    ) {
      throw new Error(
        `Account address mismatch: plan specifies '${plan.request.from}' but resolved account '${String(accountData.name ?? accountAddress)}' is '${accountAddress}'`
      );
    }

    accountInfo = {
      address: accountAddress,
      ...(typeof accountData.name === "string" ? { name: accountData.name } : {}),
      ...(typeof accountData.privateKey === "string"
        ? { privateKey: accountData.privateKey }
        : {})
    };
  }

  // 4. Sign (the signer re-checks chain, mainnet authorization and fee ceilings)
  const { ViemIgraTxSigner } = await import("@hardkas/l2");
  const signer = options.signerOverride ?? new ViemIgraTxSigner();

  let result;
  try {
    result = await signer.sign({
      plan,
      account: accountInfo!,
      guard: {
        expectedChainId,
        profile,
        ...(options.allowMainnet !== undefined ? { allowMainnet: options.allowMainnet } : {}),
        feeLimits
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("not configured yet") ||
      msg.includes("dependency (viem) is not installed")
    ) {
      console.log("");
      console.log("Igra L2 signing is not available");
      console.log("");
      console.log("Reason:");
      console.log(`  ${msg}`);
      console.log("");
      console.log("Suggestion:");
      if (msg.includes("viem")) {
        console.log(
          "  Run 'pnpm add viem' in your project or configure an EVM signer adapter."
        );
      } else {
        console.log("  Configure an EVM-compatible signer adapter in a future phase.");
      }
      const { HardkasCliError } = await import("@hardkas/cli/extension-kit");
      throw new HardkasCliError("SIGNER_ERROR", "No artifact was written.", {
        exitCode: 1
      });
    }
    throw e;
  }

  // 5. Whatever signer produced it, the raw transaction must be for the bound chain and within ceilings.
  assertRawTransactionAllowed(result.rawTransaction, {
    expectedChainId,
    profile,
    ...(options.allowMainnet !== undefined ? { allowMainnet: options.allowMainnet } : {}),
    feeLimits,
    operation: "l2 tx sign"
  });
  await assertRawMatchesPlan(result.rawTransaction as `0x${string}`, plan);
  const txHash = keccak256(result.rawTransaction as `0x${string}`);
  if (result.txHash !== undefined && result.txHash.toLowerCase() !== txHash) {
    throw new L2SafetyError(
      "L2_TX_HASH_MISMATCH",
      `Signer reported txHash ${result.txHash} but keccak256(rawTransaction) is ${txHash}.`
    );
  }

  // 6. Create Artifact (Phase 1: Payload)
  const artifact: any = {
    schema: ARTIFACT_SCHEMAS.IGRA_SIGNED_TX,
    hardkasVersion: HARDKAS_VERSION,
    networkId: plan.networkId,
    mode: "l2-rpc",
    createdAt: new Date().toISOString(),
    signedId: "", // Placeholder
    sourcePlanId: plan.planId,
    sourcePlanPath: options.planPath,
    l2Network: plan.l2Network,
    chainId: plan.chainId,
    rawTransaction: result.rawTransaction,
    txHash,
    status: "signed"
  };

  // Phase 2: Deterministic ID and Hash (hashVersion declared before hashing, IC-1′.3)
  artifact.hashVersion = CURRENT_HASH_VERSION;
  const hash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
  const signedId = createIgraSignedId(hash);
  artifact.signedId = signedId;
  artifact.contentHash = hash;

  assertValidIgraSignedTxArtifact(artifact);

  // 7. Save
  const outDir = options.outDir || "signed";
  const sanitizedDir = path.normalize(outDir).replace(/^(\.\.[\/\\])+/, "");
  await fs.mkdir(sanitizedDir, { recursive: true });

  const artifactPath = path.join(sanitizedDir, `${signedId}.igra.signed.json`);
  await writeArtifact(artifactPath, artifact);

  // 8. Output
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          networkId: plan.networkId,
          l2Network: plan.l2Network,
          environment: profile.environment,
          chainId: plan.chainId,
          signedId,
          artifactPath,
          artifact
        },
        null,
        2
      )
    );
    return;
  }

  console.log("Igra L2 transaction signed");
  console.log("");
  console.log(`Signed ID: ${signedId}`);
  console.log(`Source:    ${options.planPath}`);
  console.log(`Network:   ${plan.networkId} [${profile.environment}]`);
  console.log(`Chain ID:  ${plan.chainId}`);
  if (plan.request.from) console.log(`From:      ${plan.request.from}`);
  console.log(`To:        ${plan.request.to}`);
  console.log(`Value:     ${plan.request.valueWei} wei`);
  console.log("");
  console.log("Artifact:");
  console.log(`  ${artifactPath}`);
  console.log("");
  console.log("Next:");
  console.log(`  hardkas l2 tx send ${artifactPath} --yes`);
  console.log("");
  console.log("Warning:");
  console.log(
    "  This is an Igra L2 EVM signed transaction, not a Kaspa L1 UTXO transaction."
  );
}

export interface L2TxSendOptions extends L2WriteFlags {
  signedPath: string;
  network?: string;
  url?: string;
  chainId?: string | number;
  yes?: boolean;
  json?: boolean;
}

export async function runL2TxSend(options: L2TxSendOptions): Promise<void> {
  const loaded = await loadHardkasConfig();
  // 1. Load and Validate Signed Artifact (structure + integrity)
  const artifactData = await readArtifact(options.signedPath);
  assertValidIgraSignedTxArtifact(artifactData);
  const artifact = artifactData as IgraSignedTxArtifact;
  assertArtifactUntampered(artifact as any, "signedId", createIgraSignedId, "Signed artifact");

  const profile = resolveWriteProfile(options.network, artifact.l2Network, loaded.config.l2?.networks, {
    url: options.url,
    chainId: options.chainId
  });
  const expectedChainId = requireChainId(profile);
  if (artifact.chainId !== expectedChainId) {
    throw new L2SafetyError(
      "L2_CHAIN_ID_MISMATCH",
      `Signed artifact chain ID ${artifact.chainId} differs from profile '${profile.name}' chain ID ${expectedChainId}.`
    );
  }

  // 2. The raw transaction itself (not a label) decides: chain, mainnet authorization, fees.
  const writeOptions = {
    expectedChainId,
    profile,
    ...(options.allowMainnet !== undefined ? { allowMainnet: options.allowMainnet } : {}),
    feeLimits: feeLimitsFromFlags(options)
  };
  assertRawTransactionAllowed(artifact.rawTransaction, { ...writeOptions, operation: "l2 tx send" });
  const deterministicHash = keccak256(artifact.rawTransaction as `0x${string}`);
  if (
    artifact.txHash !== undefined &&
    artifact.txHash !== "unknown" &&
    artifact.txHash.toLowerCase() !== deterministicHash
  ) {
    throw new L2SafetyError(
      "L2_SIGNED_TX_MISMATCH",
      `Signed artifact txHash ${artifact.txHash} is not keccak256(rawTransaction) ${deterministicHash}.`
    );
  }

  // 3. Explicit confirmation (separate from mainnet authorization)
  if (!options.yes) {
    const { HardkasCliError } = await import("@hardkas/cli/extension-kit");
    throw new HardkasCliError(
      "CANCELED",
      "L2 broadcast cancelled: --yes flag is required for this phase.",
      { exitCode: 1 }
    );
  }

  const rpcUrl = profile.rpcUrl;
  if (!rpcUrl) {
    throw new Error(
      `No L2 RPC URL configured for network '${profile.name}'. Pass --url <rpcUrl>.`
    );
  }

  // 4. RPC Validation: the endpoint must serve the bound chain.
  const client = new EvmJsonRpcClient({ url: rpcUrl, profile });
  try {
    await client.assertExpectedChainId();
  } catch (e) {
    console.log("");
    console.log(
      "Refusing to submit Igra L2 transaction: profile chainId does not match RPC endpoint."
    );
    console.log("");
    const { HardkasCliError } = await import("@hardkas/cli/extension-kit");
    throw new HardkasCliError(
      "CHAIN_ID_MISMATCH",
      e instanceof Error ? e.message : String(e),
      { exitCode: 1 }
    );
  }

  // 5. Send (txHash = keccak256(raw); a different node answer is rejected)
  const { txHash, broadcastState } = await sendRawTransactionResilient(
    client,
    artifact.rawTransaction,
    writeOptions
  );

  // 6. Receipt
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
    // SURFACE-TRUTH-1B (ST-D): persisted without credentials, as `saveIgraTxReceiptArtifact` does (this runner belongs
    // to the `l2` group, which the L1 CLI does not register).
    rpcUrl: redactUrlCredentials(rpcUrl),
    status: "submitted"
  };

  assertValidIgraTxReceiptArtifact(receipt);

  const receiptDir = path.join(".hardkas", "l2-receipts");
  await fs.mkdir(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, `${txHash}.igra.receipt.json`);
  await writeArtifact(receiptPath, receipt);

  // 7. Output
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          networkId: artifact.networkId,
          l2Network: profile.name,
          environment: profile.environment,
          chainId: artifact.chainId,
          rpcUrl: redactUrlCredentials(rpcUrl),
          txHash,
          broadcastState,
          artifactPath: options.signedPath,
          receiptPath,
          receipt
        },
        (key, value) => (typeof value === "bigint" ? value.toString() : value),
        2
      )
    );
    return;
  }

  console.log("Igra L2 transaction submitted");
  console.log("");
  console.log(`Tx hash:   ${txHash}`);
  console.log(`State:     ${broadcastState} (RPC-reported; not L1 settlement)`);
  console.log(`Network:   ${profile.name} [${profile.environment}] (${profile.source})`);
  console.log(`Chain ID:  ${profile.chainId}`);
  console.log(`Mode:      l2-rpc`);
  console.log(`Source:    ${options.signedPath}`);
  console.log(`RPC:       ${redactUrlCredentials(rpcUrl)}`);
  console.log("");
  console.log("Receipt:");
  console.log(`  ${receiptPath}`);
  console.log("");
  console.log("Next:");
  console.log("  Check receipt:");
  console.log(`    hardkas l2 tx receipt ${txHash} --network ${profile.name}`);
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
  const loaded = await loadHardkasConfig();
  let localReceipt: IgraTxReceiptArtifact | undefined;
  try {
    localReceipt = await loadIgraTxReceiptArtifact(options.txHash);
  } catch (e) {
    // Ignore, we'll try RPC if url is provided
  }

  const profile = resolveL2Profile({
    name: options.network || localReceipt?.l2Network,
    userProfiles: loaded.config.l2?.networks,
    cliOverrides: {
      ...(options.url !== undefined ? { url: options.url } : {})
    }
  });

  const rpcUrl = profile.rpcUrl;

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
    console.log(
      JSON.stringify(
        {
          networkId: localReceipt?.networkId ?? profile.name,
          l2Network: profile.name,
          chainId: localReceipt?.chainId,
          rpcUrl,
          txHash: options.txHash,
          status,
          local: localReceipt,
          remote: remoteReceipt
        },
        (key, value) => (typeof value === "bigint" ? value.toString() : value),
        2
      )
    );
    return;
  }

  console.log("Igra L2 transaction receipt");
  console.log("");
  console.log(`Tx hash:   ${options.txHash}`);
  console.log(`Network:   ${profile.name} (${profile.source})`);
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
  console.log(
    "  This is an Igra L2 EVM transaction receipt, not a Kaspa L1 transaction."
  );
}

export interface L2TxReceiptsOptions {
  json?: boolean;
}

export async function runL2TxReceipts(options: L2TxReceiptsOptions): Promise<void> {
  const receipts = await listIgraTxReceiptArtifacts();

  if (options.json) {
    console.log(
      JSON.stringify(
        receipts,
        (key, value) => (typeof value === "bigint" ? value.toString() : value),
        2
      )
    );
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
    console.log(
      `${shortHash.padEnd(15)} ${r.status.padEnd(12)} chain ${r.chainId.toString().padEnd(8)} network ${r.l2Network.padEnd(10)} ${r.createdAt}`
    );
  }
}

export interface L2TxStatusOptions {
  txHash: string;
  network?: string;
  url?: string;
  json?: boolean;
}

export async function runL2TxStatus(options: L2TxStatusOptions): Promise<void> {
  const loaded = await loadHardkasConfig();
  const profile = resolveL2Profile({
    name: options.network,
    userProfiles: loaded.config.l2?.networks,
    cliOverrides: {
      ...(options.url !== undefined ? { url: options.url } : {})
    }
  });

  const rpcUrl = profile.rpcUrl;

  if (!rpcUrl) {
    throw new Error(
      `No L2 RPC URL configured for network '${profile.name}'. Pass --url <rpcUrl>.`
    );
  }

  const client = new EvmJsonRpcClient({ url: rpcUrl });
  const raw = await client.getTransactionReceipt(options.txHash);
  const remoteReceipt = normalizeEvmTransactionReceipt(raw);

  const status = remoteReceipt?.status ?? "pending";

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          networkId: profile.name,
          l2Network: profile.name,
          rpcUrl,
          txHash: options.txHash,
          status,
          remote: remoteReceipt
        },
        (key, value) => (typeof value === "bigint" ? value.toString() : value),
        2
      )
    );
    return;
  }

  console.log("Igra L2 transaction status");
  console.log("");
  console.log(`Tx hash:   ${options.txHash}`);
  console.log(`Network:   ${profile.name} (${profile.source})`);
  console.log(`Status:    ${status}`);

  if (remoteReceipt) {
    console.log(`Block:     ${remoteReceipt.blockNumber ?? "unknown"}`);
    console.log(`Gas used:  ${remoteReceipt.gasUsed ?? "unknown"}`);
  }
}

function assertEvmAddress(address: string, field: string): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(
      `Invalid EVM ${field}: must be a 0x-prefixed 40-character hex string.`
    );
  }
}

function assertHexData(data: string, field: string): void {
  if (!/^0x([a-fA-F0-9]{2})*$/.test(data)) {
    throw new Error(
      `Invalid hex ${field}: must be a 0x-prefixed even-length hex string.`
    );
  }
}
