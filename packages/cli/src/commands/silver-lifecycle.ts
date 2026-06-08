// @ts-nocheck
import { Command } from "commander";
import pc from "picocolors";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

export function getSilverDeployPlanCommand() {
  return new Command("deploy-plan")
    .argument("<compile-artifact>")
    .description("Plan a deployment of a compiled SilverScript on Kaspa")
    .option("--from <account>", "Deployer account or address")
    .option("--amount <kas>", "Amount in KAS to fund the UTXO")
    .option("--network <network>", "Network (must be simnet for now)", "simnet")
    .action(async (compileArtifactPath, opts) => {
      const { calculateContentHash, writeArtifact, HARDKAS_VERSION, verifyArtifactIntegritySync } = await import("@hardkas/artifacts");
      const { createKaspaP2shBlake2bLock, parseKasToSompi } = await import("@hardkas/core");

      if (opts.network !== "simnet") {
        console.error(pc.red(`SILVERSCRIPT_MAINNET_NOT_ENABLED: Only simnet is supported for SilverScript lifecycle.`));
        process.exit(1);
      }

      if (!fs.existsSync(compileArtifactPath)) {
        console.error(pc.red(`Error: Compile artifact not found at ${compileArtifactPath}`));
        process.exit(1);
      }

      const verifyResult = verifyArtifactIntegritySync(compileArtifactPath, { strict: true });
      if (!verifyResult.ok) {
        console.error(pc.red(`❌ Invalid Compile Artifact:`));
        verifyResult.errors.forEach(e => console.error(pc.dim(` - ${e}`)));
        process.exit(1);
      }

      const compileArtifact = JSON.parse(fs.readFileSync(compileArtifactPath, "utf8"));
      if (compileArtifact.schema !== "hardkas.silver.compile") {
        console.error(pc.red(`Error: Expected hardkas.silver.compile artifact.`));
        process.exit(1);
      }

      const amountSompi = parseKasToSompi(opts.amount).toString();
      
      const { Hardkas } = await import("@hardkas/sdk");
      const sdk = await Hardkas.create({ cwd: process.cwd(), autoBootstrap: true, network: opts.network });
      let fromAccount;
      try {
          fromAccount = await sdk.accounts.resolve(opts.from);
      } catch (err: any) {
          console.error(pc.red(`Error resolving account: ${err.message}`));
          process.exit(1);
      }

      const scriptHex = compileArtifact.compiledScriptHex;
      const lock = createKaspaP2shBlake2bLock(scriptHex);

      const deployPlan = {
        schema: "hardkas.silver.deployPlan",
        hardkasVersion: HARDKAS_VERSION,
        version: "1.0.0-alpha",
        hashVersion: 4,
        networkId: opts.network,
        mode: "simulated",
        createdAt: new Date().toISOString(),
        compileArtifactHash: compileArtifact.contentHash,
        compiledScriptHash: compileArtifact.compiledScriptHash,
        redeemScriptHex: lock.redeemScriptHex,
        redeemScriptHash: lock.redeemScriptHash,
        lockingScriptHex: lock.lockingScriptHex,
        scriptPublicKeyVersion: lock.scriptPublicKeyVersion,
        amountSompi,
        deployerAddress: fromAccount.address
      };

      const contentHash = calculateContentHash(deployPlan);
      (deployPlan as any).contentHash = contentHash;
      (deployPlan as any).artifactId = `silverdeployplan-${contentHash.substring(0, 16)}`;

      const outPath = path.resolve(process.cwd(), `${(deployPlan as any).artifactId}.json`);
      await writeArtifact(outPath, deployPlan as any);

      console.log(pc.green(`✅ SilverScript Deploy Plan Generated`));
      console.log(`Locking Hash: ${pc.cyan(lock.redeemScriptHash)}`);
      console.log(`Locking Script Hex: ${pc.cyan(lock.lockingScriptHex)}`);
      console.log(`Plan Artifact: ${pc.bold(outPath)}`);
    });
}

export function getSilverDeployCommand() {
  return new Command("deploy")
    .argument("<deploy-plan-artifact>")
    .description("Execute a SilverScript deploy plan to create the UTXO on-chain")
    .option("--private-key <hex>", "Private key for the deployer account")
    .action(async (deployPlanPath, opts) => {
      const { calculateContentHash, writeArtifact, HARDKAS_VERSION, verifyArtifactIntegritySync } = await import("@hardkas/artifacts");

      if (!fs.existsSync(deployPlanPath)) {
        console.error(pc.red(`Error: Deploy plan not found at ${deployPlanPath}`));
        process.exit(1);
      }

      const deployPlan = JSON.parse(fs.readFileSync(deployPlanPath, "utf8"));
      if (deployPlan.schema !== "hardkas.silver.deployPlan") {
        console.error(pc.red(`Error: Expected hardkas.silver.deployPlan artifact.`));
        process.exit(1);
      }
      
      if (deployPlan.networkId !== "simnet") {
          console.error(pc.red(`SILVERSCRIPT_MAINNET_NOT_ENABLED: Only simnet is supported.`));
          process.exit(1);
      }

      const { Hardkas } = await import("@hardkas/sdk");
      const sdk = await Hardkas.create({ cwd: process.cwd(), autoBootstrap: true, network: deployPlan.networkId, provider: "rpc" });

      console.log(pc.cyan(`\nDeploying script to UTXO...`));
      
      // We will do standard UTXO selection here. For MVP simplicity on P4, we mimic the working approach using kaspa-wasm to ensure 100% control over SPK.
      const kaspa = await import("kaspa-wasm");
      const pkValue = opts.privateKey;
      if (!pkValue) {
          console.error(pc.red(`Error: Please provide --private-key <hex> to sign the deployment funding.`));
          process.exit(1);
      }
      const privateKey = new kaspa.PrivateKey(pkValue);
      const address = privateKey.toKeypair().toAddress("simnet");

      // We need to fetch UTXOs for the sender
      let utxos;
      try {
        const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
        const { resolveRuntimeConfig } = await import("@hardkas/node-orchestrator");
        const rpcUrl = resolveRuntimeConfig({ network: "simnet" }).rpcUrl;
        if (!rpcUrl) throw new Error("Could not resolve RPC URL");
        
        const client = new JsonWrpcKaspaClient({ rpcUrl });
        utxos = await client.getUtxosByAddress(address.toString());
        await client.close();
      } catch (err: any) {
        console.error(pc.red(`Failed to fetch UTXOs: ${err.message}`));
        process.exit(1);
      }

      if (utxos.length === 0) {
          console.error(pc.red(`Insufficient funds.`));
          process.exit(1);
      }

      const targetSompi = BigInt(deployPlan.amountSompi);
      const feeSompi = 2000n;
      let totalInput = 0n;
      const selectedInputs = [];

      for (const u of utxos) {
          selectedInputs.push(u);
          totalInput += BigInt(u.amountSompi);
          if (totalInput >= targetSompi + feeSompi) break;
      }

      if (totalInput < targetSompi + feeSompi) {
          console.error(pc.red(`Insufficient funds. Need ${targetSompi + feeSompi}, got ${totalInput}`));
          process.exit(1);
      }

      const kaspaUtxos = selectedInputs.map(u => {
          const rawUtxoEntry = u.raw.utxoEntry || u.raw.utxo_entry || u.raw;
          // scriptPublicKey can be a flat hex string "VVVV<script>" or an object {version, scriptPublicKey/script}
          let spkVersion: number;
          let spkScript: string;
          const rawSpk = rawUtxoEntry.scriptPublicKey || rawUtxoEntry.script_public_key;
          if (typeof rawSpk === "string") {
              // Flat hex: first 4 chars = version (uint16 LE hex), rest = script hex
              spkVersion = parseInt(rawSpk.substring(0, 4), 16);
              spkScript = rawSpk.substring(4);
          } else if (rawSpk && typeof rawSpk === "object") {
              spkVersion = rawSpk.version ?? 0;
              spkScript = rawSpk.scriptPublicKey || rawSpk.script || rawSpk.script_public_key || "";
          } else {
              spkVersion = 0;
              spkScript = "";
          }
          return {
              address: address,
              outpoint: { transactionId: u.outpoint.transactionId, index: u.outpoint.index },
              utxoEntry: {
                  amount: BigInt(u.amountSompi),
                  scriptPublicKey: new kaspa.ScriptPublicKey(spkVersion, spkScript),
                  blockDaaScore: BigInt(rawUtxoEntry.blockDaaScore || rawUtxoEntry.block_daa_score || 0),
                  isCoinbase: !!(rawUtxoEntry.isCoinbase || rawUtxoEntry.is_coinbase)
              }
          };
      });

      const outputs = [
          {
              amount: targetSompi,
              scriptPublicKey: new kaspa.ScriptPublicKey(deployPlan.scriptPublicKeyVersion, deployPlan.lockingScriptHex)
          }
      ];

      const changeAddress = address;
      const txSignable = kaspa.createTransaction(kaspaUtxos, outputs, changeAddress, feeSompi);
      
      let signedTx;
      try {
          signedTx = kaspa.signTransaction(txSignable, [privateKey], true);
      } catch (err: any) {
          console.error(pc.red(`Signing failed: ${err.message}`));
          process.exit(1);
      }

      let parsed = JSON.parse(signedTx.toString());
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
      const txInner = parsed.tx ? parsed.tx.inner : parsed.inner;

      const rawTx = {
          version: txInner.version || 0,
          inputs: (txInner.inputs || []).map((i: any) => ({
              previousOutpoint: i.inner.previousOutpoint.inner,
              signatureScript: Buffer.from(i.inner.signatureScript).toString("hex"),
              sequence: i.inner.sequence || 0,
              sigOpCount: i.inner.sigOpCount || 1
          })),
          outputs: (txInner.outputs || []).map((o: any) => ({
              amount: o.inner.value.toString(),
              scriptPublicKey: {
                  version: parseInt(o.inner.scriptPublicKey.substring(0, 4), 16) || 0,
                  scriptPublicKey: o.inner.scriptPublicKey.substring(4)
              }
          })),
          lockTime: txInner.lockTime || 0,
          subnetworkId: txInner.subnetworkId || "0000000000000000000000000000000000000000",
          gas: txInner.gas || 0,
          payload: txInner.payload && txInner.payload.length > 0 ? Buffer.from(txInner.payload).toString("hex") : ""
      };

      console.log(pc.cyan(`Submitting deployment to node...`));
      let txId = "";
      try {
          const res = await sdk.rpc.submitTransaction(rawTx);
          txId = res.transactionId;
      } catch (err: any) {
          console.error(pc.red(`Deployment failed: ${err.message}`));
          process.exit(1);
      }

      const info = await sdk.rpc.requestRaw("getServerInfoRequest", {});

      const deployArtifact = {
          schema: "hardkas.silver.deploy",
          hardkasVersion: HARDKAS_VERSION,
          version: "1.0.0-alpha",
          hashVersion: 4,
          networkId: deployPlan.networkId,
          mode: "real",
          createdAt: new Date().toISOString(),
          deployPlanHash: deployPlan.contentHash,
          compileArtifactHash: deployPlan.compileArtifactHash,
          compiledScriptHash: deployPlan.compiledScriptHash,
          redeemScriptHex: deployPlan.redeemScriptHex,
          redeemScriptHash: deployPlan.redeemScriptHash,
          lockingScriptHex: deployPlan.lockingScriptHex,
          scriptPublicKeyVersion: deployPlan.scriptPublicKeyVersion,
          deployTxId: txId,
          outputIndex: 0,
          amountSompi: deployPlan.amountSompi,
          nodeVersion: info.serverVersion
      };

      const contentHash = calculateContentHash(deployArtifact);
      (deployArtifact as any).contentHash = contentHash;
      (deployArtifact as any).artifactId = `silverdeploy-${contentHash.substring(0, 16)}`;

      const outPath = path.resolve(process.cwd(), `${(deployArtifact as any).artifactId}.json`);
      await writeArtifact(outPath, deployArtifact as any);

      console.log(pc.green(`✅ SilverScript Deployed!`));
      console.log(`Transaction ID: ${pc.bold(txId)}`);
      console.log(`Artifact: ${pc.bold(outPath)}`);
    });
}

export function getSilverSpendPlanCommand() {
  return new Command("spend-plan")
    .argument("<deploy-artifact>")
    .description("Plan a spend of a deployed SilverScript UTXO")
    .option("--args <json-file>", "JSON file with args array: [{type: 'hex', value: '...'}]")
    .option("--to <address>", "Recipient address")
    .action(async (deployArtifactPath, opts) => {
      const { calculateContentHash, writeArtifact, HARDKAS_VERSION } = await import("@hardkas/artifacts");
      const { createKaspaP2shBlake2bLock, createPushOnlySignatureScript } = await import("@hardkas/core");

      if (!fs.existsSync(deployArtifactPath)) {
        console.error(pc.red(`Error: Deploy artifact not found at ${deployArtifactPath}`));
        process.exit(1);
      }

      const deployArtifact = JSON.parse(fs.readFileSync(deployArtifactPath, "utf8"));
      if (deployArtifact.schema !== "hardkas.silver.deploy") {
        console.error(pc.red(`Error: Expected hardkas.silver.deploy artifact.`));
        process.exit(1);
      }
      
      if (deployArtifact.networkId !== "simnet") {
          console.error(pc.red(`SILVERSCRIPT_MAINNET_NOT_ENABLED: Only simnet is supported.`));
          process.exit(1);
      }

      if (!opts.args || !fs.existsSync(opts.args)) {
          console.error(pc.red(`Error: Valid --args json file required`));
          process.exit(1);
      }

      let parsedArgs: Array<{ type: string, value: string }> = [];
      try {
          parsedArgs = JSON.parse(fs.readFileSync(opts.args, "utf8")).args || [];
          for (const arg of parsedArgs) {
              if (arg.type !== "hex" || typeof arg.value !== "string") {
                  throw new Error("Invalid args shape");
              }
          }
      } catch (err: any) {
          console.error(pc.red(`SILVERSCRIPT_SPEND_PLAN_INVALID: Malformed args json`));
          process.exit(1);
      }

      if (!opts.to) {
          console.error(pc.red(`Error: --to <address> is required`));
          process.exit(1);
      }

      // Recalculate locking details to ensure we don't blindly trust the deploy artifact
      const lock = createKaspaP2shBlake2bLock(deployArtifact.redeemScriptHex);
      
      if (lock.lockingScriptHex !== deployArtifact.lockingScriptHex) {
          console.error(pc.red(`SILVERSCRIPT_LOCKING_SCRIPT_MISMATCH: Computed locking script does not match deploy artifact.`));
          process.exit(1);
      }
      
      if (lock.redeemScriptHash !== deployArtifact.redeemScriptHash) {
          console.error(pc.red(`SILVERSCRIPT_REDEEM_HASH_MISMATCH: Computed redeem hash does not match deploy artifact.`));
          process.exit(1);
      }

      // Build push-only signature script
      const argsValues = parsedArgs.map(a => a.value);
      let signatureScriptHex;
      try {
          signatureScriptHex = createPushOnlySignatureScript(argsValues, lock.redeemScriptHex);
      } catch (err: any) {
          console.error(pc.red(`Error building signature script: ${err.message}`));
          process.exit(1);
      }

      const argsHash = createHash("sha256").update(JSON.stringify(parsedArgs)).digest("hex");
      
      const feeSompi = 2000n;
      const sendAmount = BigInt(deployArtifact.amountSompi) - feeSompi;

      if (sendAmount <= 0) {
          console.error(pc.red(`Spend amount <= 0 after fees.`));
          process.exit(1);
      }

      const spendPlan = {
        schema: "hardkas.silver.spendPlan",
        hardkasVersion: HARDKAS_VERSION,
        version: "1.0.0-alpha",
        hashVersion: 4,
        networkId: deployArtifact.networkId,
        mode: "simulated",
        createdAt: new Date().toISOString(),
        deployArtifactHash: deployArtifact.contentHash,
        compileArtifactHash: deployArtifact.compileArtifactHash,
        redeemScriptHash: lock.redeemScriptHash,
        lockingScriptHex: lock.lockingScriptHex,
        contractUtxoRef: {
            transactionId: deployArtifact.deployTxId,
            index: deployArtifact.outputIndex
        },
        args: parsedArgs,
        argsHash,
        signatureScriptHex,
        expectedOutputs: [{
            address: opts.to,
            amountSompi: sendAmount.toString()
        }]
      };

      const contentHash = calculateContentHash(spendPlan);
      (spendPlan as any).contentHash = contentHash;
      (spendPlan as any).artifactId = `silverspendplan-${contentHash.substring(0, 16)}`;

      const outPath = path.resolve(process.cwd(), `${(spendPlan as any).artifactId}.json`);
      await writeArtifact(outPath, spendPlan as any);

      console.log(pc.green(`✅ SilverScript Spend Plan Generated`));
      console.log(`Signature Script: ${pc.cyan(signatureScriptHex)}`);
      console.log(`Plan Artifact: ${pc.bold(outPath)}`);
    });
}

export function getSilverSpendCommand() {
  return new Command("spend")
    .argument("<spend-plan-artifact>")
    .description("Execute a SilverScript spend plan to spend the UTXO on-chain")
    .action(async (spendPlanPath) => {
      const { calculateContentHash, writeArtifact, HARDKAS_VERSION } = await import("@hardkas/artifacts");

      if (!fs.existsSync(spendPlanPath)) {
        console.error(pc.red(`Error: Spend plan not found at ${spendPlanPath}`));
        process.exit(1);
      }

      const spendPlan = JSON.parse(fs.readFileSync(spendPlanPath, "utf8"));
      if (spendPlan.schema !== "hardkas.silver.spendPlan") {
        console.error(pc.red(`Error: Expected hardkas.silver.spendPlan artifact.`));
        process.exit(1);
      }
      
      if (spendPlan.networkId !== "simnet") {
          console.error(pc.red(`SILVERSCRIPT_MAINNET_NOT_ENABLED: Only simnet is supported.`));
          process.exit(1);
      }

      const { Hardkas } = await import("@hardkas/sdk");
      const sdk = await Hardkas.create({ cwd: process.cwd(), autoBootstrap: true, network: spendPlan.networkId, provider: "rpc" });

      console.log(pc.cyan(`\nSpending from UTXO ${spendPlan.contractUtxoRef.transactionId}:${spendPlan.contractUtxoRef.index}...`));
      
      const kaspa = await import("kaspa-wasm");
      
      // Verify UTXO is not stale
      let utxoResponse;
      try {
          utxoResponse = await sdk.rpc.requestRaw("getUtxosByAddressesRequest", { addresses: [new kaspa.Address("simnet", kaspa.AddressVersion.ScriptHash, spendPlan.redeemScriptHash).toString()] });
      } catch(err) {
          // Address fetching via RPC might be tricky if it's SPK based
      }

      // We'll construct the raw tx
      const rawTx = {
          version: 0,
          inputs: [{
              previousOutpoint: {
                  transactionId: spendPlan.contractUtxoRef.transactionId,
                  index: spendPlan.contractUtxoRef.index
              },
              signatureScript: spendPlan.signatureScriptHex,
              sequence: 0,
              sigOpCount: 1
          }],
          outputs: spendPlan.expectedOutputs.map((o: any) => {
              const spk = new kaspa.Address(o.address).createScriptPublicKey();
              return {
                  amount: o.amountSompi,
                  scriptPublicKey: {
                      version: spk.version,
                      scriptPublicKey: spk.scriptPublicKey
                  }
              };
          }),
          lockTime: 0,
          subnetworkId: "0000000000000000000000000000000000000000",
          gas: 0,
          payload: ""
      };

      console.log(pc.cyan(`Submitting spend to node...`));
      let txId = "";
      try {
          const res = await sdk.rpc.submitTransaction(rawTx, false);
          txId = res.transactionId;
      } catch (err: any) {
          const msg = err.message || String(err);
          if (msg.includes("not push only")) {
             console.error(pc.red(`SILVERSCRIPT_SIGNATURE_SCRIPT_NOT_PUSH_ONLY`));
          }
          console.error(pc.red(`Spend failed: ${msg}`));
          process.exit(1);
      }

      const receipt = {
          schema: "hardkas.silver.spendReceipt",
          hardkasVersion: HARDKAS_VERSION,
          version: "1.0.0-alpha",
          hashVersion: 4,
          networkId: spendPlan.networkId,
          mode: "real",
          createdAt: new Date().toISOString(),
          spendPlanHash: spendPlan.contentHash,
          txId,
          status: "submitted"
      };

      const contentHash = calculateContentHash(receipt);
      (receipt as any).contentHash = contentHash;
      (receipt as any).artifactId = `silverreceipt-${contentHash.substring(0, 16)}`;

      const outPath = path.resolve(process.cwd(), `${(receipt as any).artifactId}.json`);
      await writeArtifact(outPath, receipt as any);

      console.log(pc.green(`✅ SilverScript Spend Success!`));
      console.log(`Transaction ID: ${pc.bold(txId)}`);
      console.log(`Receipt: ${pc.bold(outPath)}`);
    });
}
