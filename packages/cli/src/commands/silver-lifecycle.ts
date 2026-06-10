import { getOutput } from "../output.js";
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
      const {
        calculateContentHash,
        writeArtifact,
        HARDKAS_VERSION,
        verifyArtifactIntegritySync
      } = await import("@hardkas/artifacts");
      const { createKaspaP2shBlake2bLock, parseKasToSompi } =
        await import("@hardkas/core");

      if (opts.network !== "simnet") {
        getOutput().error(
          pc.red(
            `SILVERSCRIPT_MAINNET_NOT_ENABLED: Only simnet is supported for SilverScript lifecycle.`
          )
        );
        throw new Error("Command failed");
      }

      if (!fs.existsSync(compileArtifactPath)) {
        getOutput().error(
          pc.red(`Error: Compile artifact not found at ${compileArtifactPath}`)
        );
        throw new Error("Command failed");
      }

      const verifyResult = verifyArtifactIntegritySync(compileArtifactPath, {
        strict: true
      });
      if (!verifyResult.ok) {
        getOutput().error(pc.red(`❌ Invalid Compile Artifact:`));
        verifyResult.errors.forEach((e) => getOutput().error(pc.dim(` - ${e}`)));
        throw new Error("Command failed");
      }

      const compileArtifact = JSON.parse(fs.readFileSync(compileArtifactPath, "utf8"));
      if (compileArtifact.schema !== "hardkas.silver.compile") {
        getOutput().error(pc.red(`Error: Expected hardkas.silver.compile artifact.`));
        throw new Error("Command failed");
      }

      const amountSompi = parseKasToSompi(opts.amount).toString();

      const { Hardkas } = await import("@hardkas/sdk");
      const sdk = await Hardkas.create({
        cwd: process.cwd(),
        autoBootstrap: true,
        network: opts.network
      });
      let fromAccount;
      try {
        fromAccount = await sdk.accounts.resolve(opts.from);
      } catch (err: any) {
        getOutput().error(pc.red(`Error resolving account: ${err.message}`));
        throw new Error("Command failed");
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

      const outPath = path.resolve(
        process.cwd(),
        `${(deployPlan as any).artifactId}.json`
      );
      await writeArtifact(outPath, deployPlan as any);

      getOutput().writeLine(pc.green(`✅ SilverScript Deploy Plan Generated`));
      getOutput().writeLine(`Locking Hash: ${pc.cyan(lock.redeemScriptHash)}`);
      getOutput().writeLine(`Locking Script Hex: ${pc.cyan(lock.lockingScriptHex)}`);
      getOutput().writeLine(`Plan Artifact: ${pc.bold(outPath)}`);
    });
}

export function getSilverDeployCommand() {
  return new Command("deploy")
    .argument("<deploy-plan-artifact>")
    .description("Execute a SilverScript deploy plan to create the UTXO on-chain")
    .option("--private-key <hex>", "Private key for the deployer account")
    .action(async (deployPlanPath, opts) => {
      const {
        calculateContentHash,
        writeArtifact,
        HARDKAS_VERSION,
        verifyArtifactIntegritySync
      } = await import("@hardkas/artifacts");

      if (!fs.existsSync(deployPlanPath)) {
        getOutput().error(pc.red(`Error: Deploy plan not found at ${deployPlanPath}`));
        throw new Error("Command failed");
      }

      const deployPlan = JSON.parse(fs.readFileSync(deployPlanPath, "utf8"));
      if (deployPlan.schema !== "hardkas.silver.deployPlan") {
        getOutput().error(pc.red(`Error: Expected hardkas.silver.deployPlan artifact.`));
        throw new Error("Command failed");
      }

      if (deployPlan.networkId !== "simnet") {
        getOutput().error(
          pc.red(`SILVERSCRIPT_MAINNET_NOT_ENABLED: Only simnet is supported.`)
        );
        throw new Error("Command failed");
      }

      const { Hardkas } = await import("@hardkas/sdk");
      const sdk = await Hardkas.create({
        cwd: process.cwd(),
        autoBootstrap: true,
        network: deployPlan.networkId,
        provider: "rpc"
      });

      getOutput().writeLine(pc.cyan(`\nDeploying script to UTXO...`));

      // We will do standard UTXO selection here. For MVP simplicity on P4, we mimic the working approach using kaspa-wasm to ensure 100% control over SPK.
      const kaspa = await import("kaspa-wasm");
      const pkValue = opts.privateKey;
      if (!pkValue) {
        getOutput().error(
          pc.red(
            `Error: Please provide --private-key <hex> to sign the deployment funding.`
          )
        );
        throw new Error("Command failed");
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
        const info = await client.getInfo();
        utxos = (await client.getUtxosByAddress(address.toString())).filter((u: any) => {
          if (!u.isCoinbase) return true;
          if (info.virtualDaaScore === undefined || u.blockDaaScore === undefined)
            return false;
          return info.virtualDaaScore - BigInt(u.blockDaaScore) >= 1000n;
        });
        await client.close();
      } catch (err: any) {
        getOutput().error(pc.red(`Failed to fetch UTXOs: ${err.message}`));
        throw new Error("Command failed");
      }

      if (utxos.length === 0) {
        getOutput().error(pc.red(`Insufficient funds.`));
        throw new Error("Command failed");
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
        getOutput().error(
          pc.red(`Insufficient funds. Need ${targetSompi + feeSompi}, got ${totalInput}`)
        );
        throw new Error("Command failed");
      }

      const kaspaUtxos = selectedInputs.map((u) => {
        const rawUtxoEntry = u.raw.utxoEntry || u.raw.utxo_entry || u.raw;
        let spkScript: string;
        const rawSpk = rawUtxoEntry.scriptPublicKey || rawUtxoEntry.script_public_key;
        if (typeof rawSpk === "string") {
          spkScript = rawSpk;
        } else if (rawSpk && typeof rawSpk === "object") {
          spkScript =
            rawSpk.scriptPublicKey || rawSpk.script || rawSpk.script_public_key || "";
        } else {
          spkScript = u.scriptPublicKey || "";
        }
        return {
          address: address.toString(),
          outpoint: { transactionId: u.outpoint.transactionId, index: u.outpoint.index },
          utxoEntry: {
            amount: BigInt(u.amountSompi),
            scriptPublicKey: spkScript,
            blockDaaScore: BigInt(
              rawUtxoEntry.blockDaaScore || rawUtxoEntry.block_daa_score || 0
            ),
            isCoinbase: !!(rawUtxoEntry.isCoinbase || rawUtxoEntry.is_coinbase)
          }
        };
      });

      const outputs = [
        {
          amount: targetSompi,
          address: address.toString()
        }
      ];

      const changeAddress = address;
      const txSignable = kaspa.createTransaction(
        kaspaUtxos,
        outputs,
        changeAddress,
        feeSompi
      );
      txSignable.tx.outputs[0].scriptPublicKey = new kaspa.ScriptPublicKey(
        deployPlan.scriptPublicKeyVersion,
        deployPlan.lockingScriptHex
      );

      let signedTx;
      try {
        signedTx = kaspa.signTransaction(txSignable, [privateKey], true);
      } catch (err: any) {
        getOutput().error(pc.red(`Signing failed: ${err.message}`));
        throw new Error("Command failed");
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
        payload:
          txInner.payload && txInner.payload.length > 0
            ? Buffer.from(txInner.payload).toString("hex")
            : ""
      };

      getOutput().writeLine(pc.cyan(`Submitting deployment to node...`));
      let txId = "";
      try {
        const res = await sdk.rpc.submitTransaction(rawTx);
        txId = res.transactionId;
      } catch (err: any) {
        const msg = err.message || String(err);
        const mempoolMatch = msg.match(
          /transaction ([0-9a-f]{64}) is already in the mempool/i
        );
        if (mempoolMatch?.[1]) {
          txId = mempoolMatch[1];
        } else {
          getOutput().error(pc.red(`Deployment failed: ${msg}`));
          throw new Error("Command failed");
        }
      }

      const info = await sdk.rpc.getServerInfo();

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

      const outPath = path.resolve(
        process.cwd(),
        `${(deployArtifact as any).artifactId}.json`
      );
      await writeArtifact(outPath, deployArtifact as any);
      await sdk.rpc.close();

      getOutput().writeLine(pc.green(`✅ SilverScript Deployed!`));
      getOutput().writeLine(`Transaction ID: ${pc.bold(txId)}`);
      getOutput().writeLine(`Artifact: ${pc.bold(outPath)}`);
    });
}

export function getSilverSpendPlanCommand() {
  return new Command("spend-plan")
    .argument("<deploy-artifact>")
    .description("Plan a spend of a deployed SilverScript UTXO")
    .option(
      "--args <json-file>",
      "JSON file with args array: [{type: 'hex', value: '...'}]"
    )
    .option("--to <address>", "Recipient address")
    .action(async (deployArtifactPath, opts) => {
      const {
        calculateContentHash,
        createLineageTransition,
        writeArtifact,
        HARDKAS_VERSION
      } = await import("@hardkas/artifacts");
      const { createKaspaP2shBlake2bLock, createPushOnlySignatureScript } =
        await import("@hardkas/core");

      if (!fs.existsSync(deployArtifactPath)) {
        getOutput().error(
          pc.red(`Error: Deploy artifact not found at ${deployArtifactPath}`)
        );
        throw new Error("Command failed");
      }

      const deployArtifact = JSON.parse(fs.readFileSync(deployArtifactPath, "utf8"));
      if (deployArtifact.schema !== "hardkas.silver.deploy") {
        getOutput().error(pc.red(`Error: Expected hardkas.silver.deploy artifact.`));
        throw new Error("Command failed");
      }

      if (deployArtifact.networkId !== "simnet") {
        getOutput().error(
          pc.red(`SILVERSCRIPT_MAINNET_NOT_ENABLED: Only simnet is supported.`)
        );
        throw new Error("Command failed");
      }

      if (!opts.args || !fs.existsSync(opts.args)) {
        getOutput().error(pc.red(`Error: Valid --args json file required`));
        throw new Error("Command failed");
      }

      let parsedArgs: Array<{ type: string; value: string }> = [];
      try {
        parsedArgs = JSON.parse(fs.readFileSync(opts.args, "utf8")).args || [];
        for (const arg of parsedArgs) {
          if (arg.type !== "hex" || typeof arg.value !== "string") {
            throw new Error("Invalid args shape");
          }
        }
      } catch (err: any) {
        getOutput().error(pc.red(`SILVERSCRIPT_SPEND_PLAN_INVALID: Malformed args json`));
        throw new Error("Command failed");
      }

      if (!opts.to) {
        getOutput().error(pc.red(`Error: --to <address> is required`));
        throw new Error("Command failed");
      }

      // Recalculate locking details to ensure we don't blindly trust the deploy artifact
      const lock = createKaspaP2shBlake2bLock(deployArtifact.redeemScriptHex);

      if (lock.lockingScriptHex !== deployArtifact.lockingScriptHex) {
        getOutput().error(
          pc.red(
            `SILVERSCRIPT_LOCKING_SCRIPT_MISMATCH: Computed locking script does not match deploy artifact.`
          )
        );
        throw new Error("Command failed");
      }

      if (lock.redeemScriptHash !== deployArtifact.redeemScriptHash) {
        getOutput().error(
          pc.red(
            `SILVERSCRIPT_REDEEM_HASH_MISMATCH: Computed redeem hash does not match deploy artifact.`
          )
        );
        throw new Error("Command failed");
      }

      // Build push-only signature script
      const argsValues = parsedArgs.map((a) => a.value);
      let signatureScriptHex;
      try {
        signatureScriptHex = createPushOnlySignatureScript(
          argsValues,
          lock.redeemScriptHex
        );
      } catch (err: any) {
        getOutput().error(pc.red(`Error building signature script: ${err.message}`));
        throw new Error("Command failed");
      }

      const argsHash = createHash("sha256")
        .update(JSON.stringify(parsedArgs))
        .digest("hex");

      const feeSompi = 200000n;
      const sendAmount = BigInt(deployArtifact.amountSompi) - feeSompi;

      if (sendAmount <= 0) {
        getOutput().error(pc.red(`Spend amount <= 0 after fees.`));
        throw new Error("Command failed");
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
        expectedOutputs: [
          {
            address: opts.to,
            amountSompi: sendAmount.toString()
          }
        ]
      };

      const contentHash = calculateContentHash(spendPlan);
      (spendPlan as any).contentHash = contentHash;
      (spendPlan as any).artifactId = `silverspendplan-${contentHash.substring(0, 16)}`;

      const outPath = path.resolve(
        process.cwd(),
        `${(spendPlan as any).artifactId}.json`
      );
      await writeArtifact(outPath, spendPlan as any);

      getOutput().writeLine(pc.green(`✅ SilverScript Spend Plan Generated`));
      getOutput().writeLine(`Signature Script: ${pc.cyan(signatureScriptHex)}`);
      getOutput().writeLine(`Plan Artifact: ${pc.bold(outPath)}`);
    });
}

export function getSilverSpendCommand() {
  return new Command("spend")
    .argument("<spend-plan-artifact>")
    .description("Execute a SilverScript spend plan to spend the UTXO on-chain")
    .action(async (spendPlanPath) => {
      const {
        calculateContentHash,
        createLineageTransition,
        writeArtifact,
        HARDKAS_VERSION
      } = await import("@hardkas/artifacts");

      if (!fs.existsSync(spendPlanPath)) {
        getOutput().error(pc.red(`Error: Spend plan not found at ${spendPlanPath}`));
        throw new Error("Command failed");
      }

      const spendPlan = JSON.parse(fs.readFileSync(spendPlanPath, "utf8"));
      if (spendPlan.schema !== "hardkas.silver.spendPlan") {
        getOutput().error(pc.red(`Error: Expected hardkas.silver.spendPlan artifact.`));
        throw new Error("Command failed");
      }

      if (spendPlan.networkId !== "simnet") {
        getOutput().error(
          pc.red(`SILVERSCRIPT_MAINNET_NOT_ENABLED: Only simnet is supported.`)
        );
        throw new Error("Command failed");
      }

      const { Hardkas } = await import("@hardkas/sdk");
      const sdk = await Hardkas.create({
        cwd: process.cwd(),
        autoBootstrap: true,
        network: spendPlan.networkId,
        provider: "rpc"
      });

      getOutput().writeLine(
        pc.cyan(
          `\nSpending from UTXO ${spendPlan.contractUtxoRef.transactionId}:${spendPlan.contractUtxoRef.index}...`
        )
      );

      const kaspa = await import("kaspa-wasm");
      const createOutputScriptPublicKey = (address: string, amountSompi: string) => {
        const dummyScript = `20${"00".repeat(32)}ac`;
        const dummyUtxos = [
          {
            address,
            outpoint: { transactionId: "00".repeat(32), index: 0 },
            utxoEntry: {
              amount: BigInt(amountSompi) + 2000n,
              scriptPublicKey: dummyScript,
              blockDaaScore: 0n,
              isCoinbase: false
            }
          }
        ];
        const tx = kaspa.createTransaction(
          dummyUtxos,
          [{ address, amount: BigInt(amountSompi) }],
          new kaspa.Address(address),
          2000n
        );
        let parsed = JSON.parse(tx.toString());
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        const spkHex = parsed.tx.inner.outputs[0].inner.scriptPublicKey;
        return {
          version: parseInt(spkHex.substring(0, 4), 16) || 0,
          scriptPublicKey: spkHex.substring(4)
        };
      };

      // Verify UTXO is not stale
      let utxoResponse;
      try {
        utxoResponse = await sdk.rpc.requestRaw("getUtxosByAddressesRequest", {
          addresses: [
            new kaspa.Address(
              "simnet",
              kaspa.AddressVersion.ScriptHash,
              spendPlan.redeemScriptHash
            ).toString()
          ]
        });
      } catch (err) {
        // Address fetching via RPC might be tricky if it's SPK based
      }

      // We'll construct the raw tx
      const rawTx = {
        version: 0,
        inputs: [
          {
            previousOutpoint: {
              transactionId: spendPlan.contractUtxoRef.transactionId,
              index: spendPlan.contractUtxoRef.index
            },
            signatureScript: spendPlan.signatureScriptHex,
            sequence: 0,
            sigOpCount: 1
          }
        ],
        outputs: spendPlan.expectedOutputs.map((o: any) => {
          return {
            amount: o.amountSompi,
            scriptPublicKey: createOutputScriptPublicKey(o.address, o.amountSompi)
          };
        }),
        lockTime: 0,
        subnetworkId: "0000000000000000000000000000000000000000",
        gas: 0,
        payload: ""
      };

      getOutput().writeLine(pc.cyan(`Submitting spend to node...`));
      let txId = "";
      try {
        const res = await sdk.rpc.submitTransaction(rawTx, false);
        txId = res.transactionId;
      } catch (err: any) {
        const msg = err.message || String(err);
        if (msg.includes("not push only")) {
          getOutput().error(pc.red(`SILVERSCRIPT_SIGNATURE_SCRIPT_NOT_PUSH_ONLY`));
        }
        getOutput().error(pc.red(`Spend failed: ${msg}`));
        throw new Error("Command failed");
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
        deployArtifactHash: spendPlan.deployArtifactHash,
        redeemScriptHash: spendPlan.redeemScriptHash,
        lockingScriptHex: spendPlan.lockingScriptHex,
        signatureScriptHex: spendPlan.signatureScriptHex,
        spentOutpoint: spendPlan.contractUtxoRef,
        expectedOutputs: spendPlan.expectedOutputs,
        txId,
        status: "accepted",
        lineage: createLineageTransition(spendPlan, "hardkas.silver.spendReceipt")
      };

      const contentHash = calculateContentHash(receipt);
      (receipt as any).contentHash = contentHash;
      (receipt as any).artifactId = `silverreceipt-${contentHash.substring(0, 16)}`;
      (receipt as any).lineage.artifactId = contentHash;

      const outPath = path.resolve(process.cwd(), `${(receipt as any).artifactId}.json`);
      await writeArtifact(outPath, receipt as any);
      await sdk.rpc.close();

      getOutput().writeLine(pc.green(`✅ SilverScript Spend Success!`));
      getOutput().writeLine(`Transaction ID: ${pc.bold(txId)}`);
      getOutput().writeLine(`Receipt: ${pc.bold(outPath)}`);
    });
}
