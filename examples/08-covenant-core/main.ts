import { Hardkas } from "@hardkas/sdk";
import { ComputeGrams } from "@hardkas/core";
import * as path from "path";
import * as fs from "fs";

// We import Kaspa core types to manually derive the address
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const kaspa = require("../../vendor/kaspa-wasm");

import { buildPaymentPlan } from "../../packages/tx-builder/src";
import { createTxPlanArtifact } from "../../packages/artifacts/src";

async function main() {
  console.log("Starting HardKAS Covenant Core Roundtrip Demo...");

  const wasmPath = path.join(process.cwd(), "..", "..", "vendor", "kaspa-wasm");
  const sdk = await Hardkas.open({
    cwd: process.cwd(),
    network: "simnet",
    autoBootstrap: true,
    wasm: { 
      provider: "local",
      path: wasmPath
    }
  });

  // Load Fixture
  const fixturePath = path.resolve(process.cwd(), "fixtures");
  const manifest = JSON.parse(fs.readFileSync(path.join(fixturePath, "covenant.manifest.json"), "utf-8"));
  const bytecodeHex = fs.readFileSync(path.join(fixturePath, "covenant.bytecode.hex"), "utf-8").trim();

  console.log(`Loaded Covenant Fixture: ${manifest.purpose}`);

  // Identities
  // The person who creates the covenant
  const funderPriv = new kaspa.PrivateKey("1111111111111111111111111111111111111111111111111111111111111111");
  const funder = {
    privateKey: funderPriv.toString(),
    address: funderPriv.toPublicKey().toAddress("simnet").toString()
  };
  
  // The restricted recipient explicitly hardcoded in the covenant
  const recipientPriv = new kaspa.PrivateKey("2222222222222222222222222222222222222222222222222222222222222222");
  const recipient = {
    privateKey: recipientPriv.toString(),
    address: recipientPriv.toPublicKey().toAddress("simnet").toString()
  };

  console.log("Funder:   ", funder.address);
  console.log("Recipient:", recipient.address);

  // Derive covenant properties
  const p2shScript = kaspa.payToScriptHashScript(bytecodeHex);
  const covenantAddress = kaspa.addressFromScriptPublicKey(p2shScript, 'simnet').toString();
  console.log("Covenant Address:", covenantAddress);
  // We use an empty string for genesis covenant deployment to signal the SDK to populate it
  const genesisCovenantId = "";

  // Connect and start node
  await sdk.node.stop();
  await sdk.node.reset();
  await sdk.node.start({ mineTo: funder.address });
  await sdk.node.fundDevWallets([funder.address], { timeoutMs: 300_000 }); // mature coinbase
  // Mature coinbase handled by fundDevWallets

  // Get funds for the funder
  const funderBalance = await sdk.rpc.getBalanceByAddress(funder.address);
  console.log("Funder Balance:", funderBalance);

  const utxoProvider = {
    getUtxosByAddress: async (addr: string) => {
      const res = await sdk.rpc.getUtxosByAddresses([addr]);
      const blockDagInfo = await sdk.rpc.getBlockDagInfo();
      const currentDaaScore = BigInt(blockDagInfo.virtualDaaScore);
      const matureUtxos = res.entries.filter((u: any) => {
        const isCoinbase = u.utxoEntry.isCoinbase;
        const blockDaaScore = BigInt(u.utxoEntry.blockDaaScore);
        return !isCoinbase || (currentDaaScore - blockDaaScore >= 1000n);
      });
      return matureUtxos.map(e => {
        return {
          outpoint: e.outpoint,
          address: e.address || addr,
          amountSompi: BigInt(e.utxoEntry.amount),
          scriptPublicKey: typeof e.utxoEntry.scriptPublicKey === 'string' 
            ? e.utxoEntry.scriptPublicKey 
            : e.utxoEntry.scriptPublicKey.scriptPublicKey,
          blockDaaScore: BigInt(e.utxoEntry.blockDaaScore),
          isCoinbase: e.utxoEntry.isCoinbase,
          covenantId: e.utxoEntry.covenant ? e.utxoEntry.covenant.covenantId : undefined
        };
      });
    }
  };

  const deployAmount = 100000000n; // 1 KAS

  // 1. Deploy the covenant (fund it)
  const deployBuilderPlan = await buildPaymentPlan({
    fromAddress: funder.address,
    outputs: [
      {
        address: covenantAddress,
        amountSompi: deployAmount,
        covenant: {
          authorizingInput: 0,
          covenantId: genesisCovenantId
        }
      }
    ],
    availableUtxos: await utxoProvider.getUtxosByAddress(funder.address),
    feeRateSompiPerMass: 1n,
    version: 1,
    feePolicy: "toccata",
    computeBudget: 100n
  });

  const mockCtx = { clock: { now: () => Date.now() } } as any;

  const deployPlan = createTxPlanArtifact({
    planId: "deploy-plan",
    networkId: "simnet",
    mode: "real",
    ctx: mockCtx,
    from: { address: funder.address },
    to: { address: covenantAddress },
    amountSompi: "100000000",
    plan: deployBuilderPlan
  });

  sdk.artifacts.cacheArtifact(deployPlan);
  console.log("deployPlan.contentHash:", deployPlan.contentHash);

  const signedDeploy = await sdk.tx.sign(deployPlan, { 
    account: {
      name: "funder",
      kind: "kaspa-private-key",
      address: funder.address,
      privateKey: funder.privateKey
    }
  });
  console.log("signedDeploy.sourcePlanId:", signedDeploy.sourcePlanId);
  await sdk.artifacts.write(signedDeploy);
  
  const deployResult = await sdk.tx.send(signedDeploy);
  const deployTxId = deployResult.txId || deployResult.transactionId;
  console.log(`Deployed Covenant TXID: ${deployTxId}`);

  console.log("Mining block to settle deploy tx...");
  
  try {
    const mempoolEntry = await (sdk.rpc as any).call("getMempoolEntry", { transactionId: deployTxId, includeOrphanPool: true });
    console.log("Mempool entry exists:", !!mempoolEntry);
  } catch (e: any) {
    console.log("Could not check mempool:", e.message);
  }

  console.log("Checking mempool entry using SDK...");
  try {
    const mempoolEntry = await sdk.rpc.getMempoolEntry(deployTxId);
    console.log("Mempool entry exists:", !!mempoolEntry);
  } catch (e: any) {
    console.log("Error checking mempool:", e.message);
  }

  let realCovenantUtxo;
  for (let i = 0; i < 30; i++) {
    const covenantUtxos = await utxoProvider.getUtxosByAddress(covenantAddress);
    realCovenantUtxo = covenantUtxos.find(u => u.outpoint.transactionId === deployTxId);
    if (realCovenantUtxo) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  
  if (!realCovenantUtxo) {
    throw new Error("COVENANT_UTXO_NOT_FOUND: The deployed covenant UTXO could not be found.");
  }

  // Validate fields as requested
  if (realCovenantUtxo.outpoint.transactionId !== deployTxId) throw new Error("Mismatch transactionId");
  if (realCovenantUtxo.outpoint.index !== 0) throw new Error("Mismatch index");
  if (realCovenantUtxo.amountSompi !== deployAmount) throw new Error("Mismatch amount");
  
  console.log("Found real covenant UTXO:", realCovenantUtxo);

  // Now we create the spend.
  const spendBuilderPlan = await buildPaymentPlan({
    fromAddress: covenantAddress,
    outputs: [
      {
        address: recipient.address,
        amountSompi: deployAmount - 10_000_000n // leave room for fees (~0.1 KAS)
      }
    ],
    availableUtxos: [ realCovenantUtxo ],
    feeRateSompiPerMass: 1n,
    version: 1,
    feePolicy: "toccata",
    computeBudget: ComputeGrams.fromScriptUnits(5_000_000n)
  });

  console.log("DEBUG SCRIPT PUB KEY:", spendBuilderPlan.inputs[0].scriptPublicKey);

  const spendPlan = createTxPlanArtifact({
    planId: "spend-plan",
    networkId: "simnet",
    mode: "real",
    ctx: mockCtx,
    from: { address: covenantAddress },
    to: { address: recipient.address },
    amountSompi: (deployAmount - 10_000_000n).toString(),
    plan: spendBuilderPlan
  });
  
  await sdk.artifacts.write(spendPlan);
  console.log("spendPlan.contentHash:", spendPlan.contentHash);

  console.log("Building covenant spend transaction...");
  const sigScript = kaspa.payToScriptHashSignatureScript(bytecodeHex, []);
  const sigScriptHex = typeof sigScript === 'string' ? sigScript : Buffer.from(sigScript).toString('hex');
  
  console.log("spendPlan:", JSON.stringify(spendPlan, null, 2));
  const signedSpend = await sdk.tx.sign(spendPlan, {
    authorizers: {
      0: sdk.accounts.staticSignatureScriptAuthorizer(sigScriptHex)
    }
  });

  console.log("Signed spend payload:", signedSpend.signedTransaction.payload.substring(0, 500) + "...");
  
  const spendResult = await sdk.tx.send(signedSpend);
  const spendTxId = spendResult.txId || spendResult.transactionId;
  console.log(`Spent Covenant TXID: ${spendTxId}`);
  
  console.log("==========================================");
  console.log("🎉 P85.1 Covenant E2E Demo Completed!");
  console.log("==========================================");
  
  await sdk.node.stop();
}

main().catch(console.error);
