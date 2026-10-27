import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { nodeRpcUrl } from "@hardkas/core";
import {
  compileSilverScript,
  getSilContract,
  silContractBytecodeHex,
  silverP2shAddress,
  silverP2shLock,
  type SilArtifactValue
} from "@hardkas/core";
// Dynamic import used inside actions
import { submitSilverTransaction } from "./silver.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { getOutput } from "../output.js";

function out() {
  return getOutput();
}

function fail(code: string, message: string, exitCode = HardkasExitCode.RUNTIME_FAILURE): never {
  throw new HardkasCliError(code, message, { exitCode });
}

export function registerEscrowCommands(program: Command) {
  const escrow = program
    .command("escrow")
    .description("Escrow operations: lifecycle, security guards, and legacy v1 fund recovery");

  const rescue = escrow
    .command("rescue-v1")
    .description("Legacy v1 Escrow fund recovery tools without exposing private keys in CLI arguments");

  // ---------------------------------------------------------------- prepare
  rescue
    .command("prepare")
    .description("Prepare a v1 escrow rescue draft spending an orphaned UTXO to a target address")
    .requiredOption("--address <address>", "Legacy escrow P2SH address")
    .requiredOption("--outpoint <outpoint>", "Funding outpoint to spend (txId:index)")
    .requiredOption("--to <address>", "Destination address to recover funds to")
    .option("--network <network>", "Network id (default simnet)", "simnet")
    .option("--out <file>", "Output draft file path (default rescue-v1-plan.draft.json)", "rescue-v1-plan.draft.json")
    .option("--fee <sompi>", "Miner fee in sompi (default 400000 sompi = 0.004 KAS)", "400000")
    .option("--buyer-pk <hex>", "Buyer x-only public key (32 bytes hex)")
    .option("--seller-pk <hex>", "Seller x-only public key (32 bytes hex)")
    .option("--arbiter-pk <hex>", "Arbiter x-only public key (32 bytes hex)")
    .option("--json", "Output as JSON", false)
    .action(async (opts: any) => {
      const [txId, idxStr] = opts.outpoint.split(":");
      if (!txId || idxStr === undefined || !/^[0-9a-f]{64}$/i.test(txId) || !/^\d+$/.test(idxStr)) {
        return fail("RESCUE_OUTPOINT_INVALID", `Invalid outpoint '${opts.outpoint}'; expected format txid:index`);
      }
      const outputIndex = parseInt(idxStr, 10);
      const feeSompi = BigInt(opts.fee || "400000");
      if (feeSompi > 500_000n) {
        return fail("ESCROW_FEE_EXCESSIVE_REFUSED", `Requested rescue fee (${feeSompi} sompi) exceeds maximum safe fee of 500000 sompi.`);
      }

      const rpcUrl = nodeRpcUrl();
      const rpc = new JsonWrpcKaspaClient({ rpcUrl, expectedNetworkId: opts.network });
      let utxoEntry: any;
      try {
        const res = await rpc.getUtxosByAddresses([opts.address]);
        const entries = res.entries || [];
        utxoEntry = entries.find((e: any) => e.outpoint.transactionId.toLowerCase() === txId.toLowerCase() && Number(e.outpoint.index) === outputIndex);
      } catch (err: any) {
        return fail("RESCUE_RPC_FAILED", `Failed to query UTXOs from node: ${err.message}`);
      } finally {
        await rpc.close().catch(() => {});
      }

      if (!utxoEntry) {
        return fail("RESCUE_UTXO_NOT_FOUND", `Outpoint ${opts.outpoint} not found on address ${opts.address}`);
      }

      const totalSompi = BigInt(utxoEntry.utxoEntry.amount);
      if (totalSompi <= feeSompi) {
        return fail("RESCUE_INSUFFICIENT_FUNDS", `Outpoint amount (${totalSompi} sompi) is smaller than fee (${feeSompi} sompi)`);
      }
      const recoverSompi = totalSompi - feeSompi;

      // Compile v1 escrow contract
      const { loadKaspaWasm } = await import("@hardkas/accounts");
      const k = await loadKaspaWasm();

      // Resolve public keys
      const buyerPk = opts.buyerPk || "11".repeat(32);
      const sellerPk = opts.sellerPk || "22".repeat(32);
      const arbiterPk = opts.arbiterPk || "33".repeat(32);

      const targetScript = k.payToAddressScript(new k.Address(opts.to));
      const targetSpkHex = targetScript.script;

      const constructorArgs: SilArtifactValue[] = [
        { kind: "bytes", value: Buffer.from(buyerPk.replace(/^0x/, ""), "hex") },
        { kind: "bytes", value: Buffer.from(sellerPk.replace(/^0x/, ""), "hex") },
        { kind: "bytes", value: Buffer.from(arbiterPk.replace(/^0x/, ""), "hex") },
        { kind: "bytes", value: Buffer.concat([Buffer.from([0, 0]), Buffer.from(targetSpkHex, "hex")]) },
        { kind: "bytes", value: Buffer.concat([Buffer.from([0, 0]), Buffer.from(targetSpkHex, "hex")]) },
        { kind: "int", value: totalSompi / 2n },
        { kind: "int", value: totalSompi / 2n }
      ];

      const { ESCROW_V1_SOURCE, ESCROW_V1_CONTRACT_NAME } = await import("@hardkas/escrow");
      const compiled = await compileSilverScript({ source: ESCROW_V1_SOURCE, constructorArgs });
      const contract = getSilContract(compiled.artifact, ESCROW_V1_CONTRACT_NAME).contract;
      const redeemScriptHex = silContractBytecodeHex(contract);
      const lock = silverP2shLock(redeemScriptHex);

      const u = utxoEntry.utxoEntry;
      const spk = u.scriptPublicKey;
      const scriptPublicKey =
        spk && typeof spk === "object"
          ? { version: Number(spk.version ?? 0), script: String(spk.scriptPublicKey ?? spk.script ?? "") }
          : { version: parseInt(String(spk).slice(0, 4), 16) || 0, script: String(spk).slice(4) };

      const contractUtxo = {
        outpoint: { transactionId: utxoEntry.outpoint.transactionId, index: Number(utxoEntry.outpoint.index) },
        amountSompi: BigInt(u.amount),
        scriptPublicKey,
        blockDaaScore: BigInt(u.blockDaaScore ?? 0),
        isCoinbase: !!u.isCoinbase
      };

      const outputs = [
        {
          amountSompi: recoverSompi,
          scriptPublicKey: { version: 0 as const, script: targetSpkHex }
        }
      ];

      const { prepareSilverSpend } = await import("@hardkas/accounts");
      const draft = prepareSilverSpend({
        artifact: compiled.artifact,
        contractName: ESCROW_V1_CONTRACT_NAME,
        entry: "mutualRelease",
        args: [{ kind: "signer", signer: "buyer" }, { kind: "signer", signer: "seller" }],
        utxo: contractUtxo,
        outputs,
        networkId: opts.network
      });

      const rescuePackage = {
        schema: "hardkas.escrow.rescue.v1",
        networkId: opts.network,
        address: opts.address,
        outpoint: opts.outpoint,
        targetAddress: opts.to,
        totalSompi: totalSompi.toString(),
        recoveredSompi: recoverSompi.toString(),
        feeSompi: feeSompi.toString(),
        artifact: compiled.artifact,
        draft,
        signatures: {} as Record<string, string>
      };

      const outFile = path.resolve(process.cwd(), opts.out);
      fs.writeFileSync(outFile, JSON.stringify(rescuePackage, null, 2), "utf8");

      if (opts.json) {
        return out().writeJson({ ok: true, file: outFile, draft: rescuePackage });
      }

      out().writeLine(pc.bold(pc.green("✓ Rescue Draft Created Successfully")));
      out().writeLine(`  File:      ${pc.cyan(outFile)}`);
      out().writeLine(`  Recover:   ${pc.yellow((Number(recoverSompi) / 100_000_000).toFixed(4))} KAS (${recoverSompi} sompi)`);
      out().writeLine(`  Miner fee: ${pc.dim(`${feeSompi} sompi`)}`);
      out().writeLine(`  Target:    ${pc.dim(opts.to)}`);
      out().writeLine(pc.dim(`Next: hardkas escrow rescue-v1 sign ${opts.out} --account <name>`));
    });

  // ---------------------------------------------------------------- sign
  rescue
    .command("sign <draft-file>")
    .description("Sign a rescue draft with a local dev or keystore account")
    .requiredOption("--account <name>", "Account name or role (e.g. buyer, seller, or dev account name)")
    .option("--role <role>", "Contract role (buyer or seller)", "buyer")
    .option("--json", "Output as JSON", false)
    .action(async (draftFile: string, opts: any) => {
      const filePath = path.resolve(process.cwd(), draftFile);
      if (!fs.existsSync(filePath)) return fail("RESCUE_FILE_NOT_FOUND", `File not found: ${filePath}`);
      const raw = fs.readFileSync(filePath, "utf8");
      const pkg = JSON.parse(raw);

      if (pkg.schema !== "hardkas.escrow.rescue.v1") {
        return fail("RESCUE_SCHEMA_INVALID", `Invalid draft schema: ${pkg.schema}`);
      }

      const { listDevAccountsSync, getOrCreateDevAccount, signSilverSpend } = await import("@hardkas/accounts");
      const accounts = listDevAccountsSync(process.cwd());
      let accountObj: any = null;
      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i]?.name === opts.account) {
          accountObj = await getOrCreateDevAccount(process.cwd(), i, opts.account);
          break;
        }
      }

      if (!accountObj) {
        return fail("RESCUE_ACCOUNT_NOT_FOUND", `Account '${opts.account}' not found in workspace.`);
      }

      const sig = signSilverSpend(pkg.draft, accountObj.privateKey);
      pkg.signatures[opts.role || "buyer"] = sig;

      fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2), "utf8");

      if (opts.json) return out().writeJson({ ok: true, role: opts.role, signature: sig });

      out().writeLine(pc.bold(pc.green(`✓ Signed slot '${opts.role || "buyer"}' with account '${opts.account}'`)));
      out().writeLine(`  Draft file updated: ${pc.cyan(filePath)}`);
    });

  // ---------------------------------------------------------------- inspect
  rescue
    .command("inspect <draft-file>")
    .description("Inspect a rescue draft and verify balance and signature status")
    .option("--json", "Output as JSON", false)
    .action(async (draftFile: string, opts: any) => {
      const filePath = path.resolve(process.cwd(), draftFile);
      if (!fs.existsSync(filePath)) return fail("RESCUE_FILE_NOT_FOUND", `File not found: ${filePath}`);
      const pkg = JSON.parse(fs.readFileSync(filePath, "utf8"));

      if (opts.json) return out().writeJson(pkg);

      out().writeLine(pc.bold("HardKAS Escrow v1 Rescue Plan"));
      out().writeLine(`  Outpoint:    ${pkg.outpoint}`);
      out().writeLine(`  Destination: ${pkg.targetAddress}`);
      out().writeLine(`  Total Input: ${pkg.totalSompi} sompi`);
      out().writeLine(`  Recovered:   ${pc.green(pkg.recoveredSompi)} sompi`);
      out().writeLine(`  Miner Fee:   ${pc.yellow(pkg.feeSompi)} sompi`);
      out().writeLine(`  Signatures:  ${Object.keys(pkg.signatures || {}).join(", ") || "(none)"}`);
    });

  // ---------------------------------------------------------------- broadcast
  rescue
    .command("broadcast <draft-file>")
    .description("Finalize and broadcast the signed rescue transaction to the network")
    .option("--network <network>", "Network (default simnet)", "simnet")
    .option("--json", "Output as JSON", false)
    .action(async (draftFile: string, opts: any) => {
      const filePath = path.resolve(process.cwd(), draftFile);
      if (!fs.existsSync(filePath)) return fail("RESCUE_FILE_NOT_FOUND", `File not found: ${filePath}`);
      const pkg = JSON.parse(fs.readFileSync(filePath, "utf8"));

      if (!pkg.signatures?.buyer || !pkg.signatures?.seller) {
        return fail("RESCUE_INCOMPLETE_SIGNATURES", "Rescue requires both 'buyer' and 'seller' signatures before broadcast.");
      }

      const { finalizeSilverSpend } = await import("@hardkas/accounts");
      const finalized = finalizeSilverSpend(
        pkg.draft,
        pkg.artifact,
        [{ kind: "signer", signer: "buyer" }, { kind: "signer", signer: "seller" }],
        pkg.signatures
      );

      const rpcUrl = nodeRpcUrl();
      const rpc = new JsonWrpcKaspaClient({ rpcUrl, expectedNetworkId: opts.network || pkg.networkId || "simnet" });
      let txId: string;
      try {
        txId = await submitSilverTransaction(rpc, finalized.rpcTransaction, "escrow-v1-rescue", finalized.txId);
      } finally {
        await rpc.close().catch(() => {});
      }

      if (opts.json) return out().writeJson({ ok: true, txId });

      out().writeLine(pc.bold(pc.green("✓ Rescue Transaction Broadcast Successfully")));
      out().writeLine(`  TXID: ${pc.cyan(txId)}`);
      out().writeLine(`  Recovered: ${pkg.recoveredSompi} sompi`);
    });
}
