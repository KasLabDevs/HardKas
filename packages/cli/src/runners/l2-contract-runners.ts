import fs from "node:fs/promises";
import path from "node:path";
import { 
  resolveL2Profile, 
  EvmJsonRpcClient, 
  toHexQuantity,
  EvmCallRequest,
  encodeConstructorArgs
} from "@hardkas/l2";
import { loadHardkasConfig } from "@hardkas/config";
import { 
  IgraTxPlanArtifact,
  assertValidIgraTxPlanArtifact,
  writeArtifact,
  HARDKAS_VERSION,
  ARTIFACT_SCHEMAS,
  createIgraDeployPlanId,
  calculateContentHash
} from "@hardkas/artifacts";

export interface L2ContractDeployPlanOptions {
  network?: string;
  url?: string;
  from: string;
  bytecode: string;
  constructor?: string;
  args?: string;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
  nonce?: string;
  outDir?: string;
  json?: boolean;
}

export async function runL2ContractDeployPlan(options: L2ContractDeployPlanOptions): Promise<void> {
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
    throw new Error(`No L2 RPC URL configured for network '${profile.name}'. Pass --url <rpcUrl>.`);
  }

  const client = new EvmJsonRpcClient({ url: rpcUrl });

  // 1. Basic Validation
  assertEvmAddress(options.from, "from");
  if (!options.bytecode || options.bytecode === "0x") {
    throw new Error("Missing or empty bytecode. Provide non-empty 0x-prefixed hex.");
  }
  assertHexData(options.bytecode, "bytecode");

  // 2. Prepare Data (Bytecode + Constructor Args)
  let data = options.bytecode;
  if (typeof options.constructor === "string" && options.constructor) {
    const argsArray = options.args ? options.args.split(",") : [];
    data = encodeConstructorArgs(options.bytecode, options.constructor, argsArray);
  }

  // 3. Fetch Network Info
  const chainId = await client.getChainId();
  
  let nonce = options.nonce;
  if (!nonce) {
    const n = await client.getTransactionCount(options.from, "latest");
    nonce = n.toString();
  }

  let gasPrice = options.gasPrice;
  if (!gasPrice) {
    const gp = await client.getGasPriceWei();
    gasPrice = gp.toString();
  }

  const request: EvmCallRequest = {
    from: options.from,
    ...(options.value ? { value: toHexQuantity(options.value) } : { value: "0x0" }),
    data
  };

  let gasLimit = options.gasLimit;
  if (!gasLimit) {
    const g = await client.estimateGas(request, "latest");
    gasLimit = g.toString();
  }

  const estimatedFeeWei = (BigInt(gasLimit) * BigInt(gasPrice)).toString();

  // 4. Build Artifact (Phase 1: Payload)
  const artifact: any = {
    schema: ARTIFACT_SCHEMAS.IGRA_TX_PLAN,
    hardkasVersion: HARDKAS_VERSION,
    networkId: profile.name,
    mode: "l2-rpc",
    createdAt: new Date().toISOString(),
    planId: "", // Placeholder
    l2Network: profile.name,
    chainId: profile.chainId,
    txType: "contract-deploy",
    request: {
      from: options.from,
      data,
      valueWei: options.value ?? "0",
      gasLimit,
      gasPriceWei: gasPrice,
      ...(nonce ? { nonce } : {})
    },
    estimatedGas: gasLimit,
    estimatedFeeWei,
    status: "built"
  };

  // Phase 2: Deterministic ID and Hash
  const hash = calculateContentHash(artifact);
  const planId = createIgraDeployPlanId(hash);
  artifact.planId = planId;
  artifact.contentHash = hash;

  // 5. Validate and Save
  assertValidIgraTxPlanArtifact(artifact);

  const outDir = options.outDir || "plans";
  const sanitizedDir = path.normalize(outDir).replace(/^(\.\.[\/\\])+/, "");
  await fs.mkdir(sanitizedDir, { recursive: true });

  const artifactPath = path.join(sanitizedDir, `${planId}.igra.deploy.plan.json`);
  await writeArtifact(artifactPath, artifact);

  // 6. Output
  if (options.json) {
    console.log(JSON.stringify({
      networkId: profile.name,
      l2Network: profile.name,
      chainId: profile.chainId,
      planId,
      artifactPath,
      artifact
    }, null, 2));
    return;
  }

  console.log(`Igra L2 contract deploy plan built (${profile.source})`);
  console.log("");
  console.log(`Plan ID:    ${planId}`);
  console.log(`Network:    ${profile.name}`);
  console.log(`Chain ID:   ${profile.chainId}`);
  console.log(`Mode:       l2-rpc`);
  console.log(`From:       ${options.from}`);
  console.log(`Type:       contract-deploy`);
  console.log(`Value:      ${options.value ?? "0"} wei`);
  console.log(`Gas limit:  ${gasLimit}`);
  console.log(`Gas price:  ${gasPrice} wei`);
  console.log(`Est. fee:   ${estimatedFeeWei} wei`);
  if (nonce) console.log(`Nonce:      ${nonce}`);
  console.log(`Bytecode:   ${options.bytecode.substring(0, 32)}...`);
  console.log("");
  console.log("Artifact:");
  console.log(`  ${artifactPath}`);
  console.log("");
  console.log("Next:");
  console.log("  Sign:");
  console.log(`    hardkas l2 tx sign ${artifactPath} --account <account>`);
  console.log("");
  console.log("Warning:");
  console.log("  This is an Igra L2 EVM contract deployment plan, not a Kaspa L1 transaction.");
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
