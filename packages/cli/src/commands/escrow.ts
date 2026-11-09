import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { assertMainnetTransactionsDisabled, loadManagedKaspaWasmSync } from "@hardkas/core";
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

/** The most a rescue may pay in fee (the limit `prepare` already applied), enforced again at sign and broadcast. */
const RESCUE_MAX_FEE_SOMPI = 500_000n;

export interface RescueDraftSummary {
  readonly networkId: string;
  readonly outpoint: string;
  readonly totalSompi: bigint;
  readonly recoveredSompi: bigint;
  readonly feeSompi: bigint;
  /** The destination script the DRAFT pays (what is signed), and the address it encodes on the draft's network. */
  readonly destinationScript: { readonly version: number; readonly script: string };
  readonly destinationAddress: string | undefined;
}

/**
 * CA-TX-06 · what a rescue package's DRAFT (the transaction that is signed and broadcast) really does, checked against
 * the package's displayed fields (destination, amounts, fee, outpoint, network). Any difference is RESCUE_DRAFT_MISMATCH:
 * `inspect` used to print the file's fields while `sign` signed whatever draft the file carried.
 */
export function checkRescuePackage(pkg: any): RescueDraftSummary {
  if (pkg?.schema !== "hardkas.escrow.rescue.v1") fail("RESCUE_SCHEMA_INVALID", `Invalid draft schema: ${pkg?.schema}`);
  const d = pkg.draft;
  const mismatch = (what: string) => fail("RESCUE_DRAFT_MISMATCH", `The rescue draft does not do what the package says: ${what}. Nothing was signed or sent.`);
  if (!d || !d.input || !Array.isArray(d.outputs)) mismatch("the package carries no spend draft");
  const big = (v: unknown, what: string): bigint => {
    if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
    if (typeof v === "bigint") return v;
    return mismatch(`${what} is not an amount`);
  };
  if (d.networkId !== pkg.networkId) mismatch(`the draft is for network ${String(d.networkId)}, the package says ${String(pkg.networkId)}`);
  const outpoint = `${String(d.input.outpoint?.transactionId).toLowerCase()}:${Number(d.input.outpoint?.index)}`;
  if (outpoint !== String(pkg.outpoint).toLowerCase()) mismatch(`the draft spends ${outpoint}, the package says ${String(pkg.outpoint)}`);
  if (d.outputs.length !== 1) mismatch(`the draft has ${d.outputs.length} outputs, a rescue has one`);
  const total = big(d.input.amountSompi, "the draft's input");
  const recovered = big(d.outputs[0].valueSompi, "the draft's output");
  const fee = big(d.feeSompi, "the draft's fee");
  if (total - recovered !== fee) mismatch(`input ${total} - output ${recovered} is not the declared fee ${fee}`);
  if (big(pkg.totalSompi, "totalSompi") !== total) mismatch(`the draft spends ${total} sompi, the package says ${String(pkg.totalSompi)}`);
  if (big(pkg.recoveredSompi, "recoveredSompi") !== recovered) mismatch(`the draft recovers ${recovered} sompi, the package says ${String(pkg.recoveredSompi)}`);
  if (big(pkg.feeSompi, "feeSompi") !== fee) mismatch(`the draft pays ${fee} sompi of fee, the package says ${String(pkg.feeSompi)}`);
  if (fee > RESCUE_MAX_FEE_SOMPI) fail("ESCROW_FEE_EXCESSIVE_REFUSED", `The rescue pays ${fee} sompi of fee, above ${RESCUE_MAX_FEE_SOMPI}. Nothing was signed or sent.`);
  const k: any = loadManagedKaspaWasmSync();
  const out0 = d.outputs[0].scriptPublicKey ?? {};
  const destinationScript = { version: Number(out0.version ?? 0), script: String(out0.script ?? "").toLowerCase() };
  if (typeof pkg.targetAddress !== "string" || !k.Address.validate(pkg.targetAddress)) mismatch(`the package's target ${String(pkg.targetAddress)} is not a Kaspa address`);
  const target = k.payToAddressScript(new k.Address(pkg.targetAddress));
  if (Number(target.version) !== destinationScript.version || String(target.script).toLowerCase() !== destinationScript.script) {
    mismatch(`the draft pays script ${destinationScript.script}, not the package's target ${pkg.targetAddress}`);
  }
  let destinationAddress: string | undefined;
  try {
    destinationAddress = String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(destinationScript.version, destinationScript.script), d.networkId));
  } catch {
    destinationAddress = undefined;
  }
  return { networkId: String(d.networkId), outpoint, totalSompi: total, recoveredSompi: recovered, feeSompi: fee, destinationScript, destinationAddress };
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
    .option("--network <network>", "Network id (default simnet); mainnet refused; testnet-<n> needs experimental + network.allowPublic", "simnet")
    .option("--url <url>", "Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet)")
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

      // L1-CORE-1 B3: the node of the network asked for (--url, else the workspace's declared endpoint; it was the
      // canonical localnet only), proven before anything is read from it; never mainnet
      assertMainnetTransactionsDisabled("broadcast", [opts.network], "escrow rescue-v1 prepare");
      const { resolveL1NodeTarget, proveL1Node } = await import("../runners/l1-node-target.js");
      const { rpc } = await proveL1Node(await resolveL1NodeTarget(String(opts.network), opts.url));
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

      // CA-TX-06: what is signed is the draft; it must do exactly what the package shows (destination, amounts, fee)
      checkRescuePackage(pkg);
      assertMainnetTransactionsDisabled("sign", [pkg.networkId, pkg.draft?.networkId], "escrow rescue-v1 sign");

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
      // CA-TX-06: shown from the DRAFT (what would be signed), after checking that the package's fields agree with it
      const s = checkRescuePackage(pkg);

      if (opts.json) return out().writeJson({ ...pkg, verifiedDraft: { ...s, totalSompi: s.totalSompi.toString(), recoveredSompi: s.recoveredSompi.toString(), feeSompi: s.feeSompi.toString() } });

      out().writeLine(pc.bold("HardKAS Escrow v1 Rescue Plan (from the draft that is signed)"));
      out().writeLine(`  Network:     ${s.networkId}`);
      out().writeLine(`  Outpoint:    ${s.outpoint}`);
      out().writeLine(`  Destination: ${s.destinationAddress ?? `script ${s.destinationScript.script}`}`);
      out().writeLine(`  Total Input: ${s.totalSompi} sompi`);
      out().writeLine(`  Recovered:   ${pc.green(String(s.recoveredSompi))} sompi`);
      out().writeLine(`  Miner Fee:   ${pc.yellow(String(s.feeSompi))} sompi`);
      out().writeLine(`  Signatures:  ${Object.keys(pkg.signatures || {}).join(", ") || "(none)"}`);
    });

  // ---------------------------------------------------------------- broadcast
  rescue
    .command("broadcast <draft-file>")
    .description("Finalize and broadcast the signed rescue transaction to the network")
    .option("--network <network>", "Network (default: the draft's); must be the draft's")
    .option("--url <url>", "Node wRPC (JSON) endpoint (default: the one the workspace declares for the draft's network; simnet: the canonical localnet)")
    .option("--json", "Output as JSON", false)
    .action(async (draftFile: string, opts: any) => {
      const filePath = path.resolve(process.cwd(), draftFile);
      if (!fs.existsSync(filePath)) return fail("RESCUE_FILE_NOT_FOUND", `File not found: ${filePath}`);
      const pkg = JSON.parse(fs.readFileSync(filePath, "utf8"));
      // CA-TX-06: the draft is what is sent; the network is the draft's (a different --network is refused), never mainnet,
      // and the node must prove its identity before anything is sent (L1-CORE-1 B3: any node network, see below)
      const s = checkRescuePackage(pkg);
      const network = opts.network ?? s.networkId;
      if (network !== s.networkId) {
        return fail("RESCUE_NETWORK_MISMATCH", `--network ${network} is not the draft's network ${s.networkId}. Nothing was sent.`);
      }
      assertMainnetTransactionsDisabled("broadcast", [network], "escrow rescue-v1 broadcast");
      // L1-CORE-1 B3: the draft's network's node (--url, else the workspace's declared endpoint), proven before anything
      // is sent: container + digest for the managed localnet, its own report for any other node (only simnet was proven)
      const { resolveL1NodeTarget, proveL1Node } = await import("../runners/l1-node-target.js");
      const target = await resolveL1NodeTarget(String(network), opts.url);

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

      const { rpc } = await proveL1Node(target);
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
