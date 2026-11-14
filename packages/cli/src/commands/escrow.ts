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

/**
 * C-4 · the constructor arguments of the v1 escrow being rescued, in its constructor's order (buyer, seller, arbiter,
 * buyerSpk, sellerSpk, refundAmount, releaseAmount), from the options: the values `createEscrow({ version: "v1" })` was
 * given. A destination is an address or a script public key in hex (without the version, as EscrowConfig stores it); the
 * contract compares the version-prefixed form. RESCUE_ESCROW_ARGS_INVALID for anything else. No node is contacted.
 */
export function rescueEscrowConstructorArgs(k: any, opts: Record<string, unknown>): SilArtifactValue[] {
  const invalid = (message: string): never => fail("RESCUE_ESCROW_ARGS_INVALID", `${message}. Nothing was read or written.`, HardkasExitCode.USAGE_ERROR);
  const flags: Array<[string, string]> = [
    ["--buyer-pk", "buyerPk"],
    ["--seller-pk", "sellerPk"],
    ["--arbiter-pk", "arbiterPk"],
    ["--buyer-destination", "buyerDestination"],
    ["--seller-destination", "sellerDestination"],
    ["--refund-amount", "refundAmount"],
    ["--release-amount", "releaseAmount"]
  ];
  const missing = flags.filter(([, name]) => opts[name] === undefined || String(opts[name]).trim() === "").map(([flag]) => flag);
  if (missing.length > 0) {
    invalid(`the escrow's constructor arguments are required (the values it was created with): missing ${missing.join(", ")}`);
  }
  const key = (flag: string, value: unknown): SilArtifactValue => {
    const hex = String(value ?? "").trim().replace(/^0x/i, "");
    if (!/^[0-9a-f]{64}$/i.test(hex)) invalid(`${flag} must be a 32-byte x-only public key (64 hex characters)`);
    return { kind: "bytes", value: Buffer.from(hex, "hex") };
  };
  const destination = (flag: string, value: unknown): SilArtifactValue => {
    const v = String(value ?? "").trim();
    let script: string;
    if (v.includes(":")) {
      if (!k.Address.validate(v)) invalid(`${flag} '${v}' is not a Kaspa address`);
      script = String(k.payToAddressScript(new k.Address(v)).script);
    } else {
      script = v.replace(/^0x/i, "");
      if (!/^(?:[0-9a-f]{2})+$/i.test(script)) invalid(`${flag} must be an address or a script public key in hex (without the version)`);
    }
    return { kind: "bytes", value: Buffer.concat([Buffer.from([0, 0]), Buffer.from(script, "hex")]) };
  };
  const amount = (flag: string, value: unknown): SilArtifactValue => {
    const v = String(value ?? "").trim();
    if (!/^\d+$/.test(v) || BigInt(v) <= 0n) invalid(`${flag} must be a positive amount in sompi`);
    return { kind: "int", value: BigInt(v) };
  };
  return [
    key("--buyer-pk", opts.buyerPk),
    key("--seller-pk", opts.sellerPk),
    key("--arbiter-pk", opts.arbiterPk),
    destination("--buyer-destination", opts.buyerDestination),
    destination("--seller-destination", opts.sellerDestination),
    amount("--refund-amount", opts.refundAmount),
    amount("--release-amount", opts.releaseAmount)
  ];
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
    .description(
      "Prepare a v1 escrow rescue draft spending an orphaned UTXO to a target address. The escrow is recompiled from the constructor arguments it was created with (createEscrow's v1 config); its lock must be --address and the UTXO's script, or nothing is read or written"
    )
    .requiredOption("--address <address>", "Legacy escrow P2SH address")
    .requiredOption("--outpoint <outpoint>", "Funding outpoint to spend (txId:index)")
    .requiredOption("--to <address>", "Destination address to recover funds to")
    // C-4 · the escrow's constructor arguments: all seven required. They are checked in the action (RESCUE_ESCROW_ARGS_INVALID)
    // rather than by commander, so that the mainnet refusal comes first, as for every other command
    .option("--buyer-pk <hex>", "Required: buyer x-only public key the escrow was created with (32 bytes hex)")
    .option("--seller-pk <hex>", "Required: seller x-only public key the escrow was created with (32 bytes hex)")
    .option("--arbiter-pk <hex>", "Required: arbiter x-only public key the escrow was created with (32 bytes hex)")
    .option("--buyer-destination <address|spk>", "Required: the buyer destination the escrow was created with: an address, or its script public key in hex without the version (EscrowConfig.buyerDestinationSpk)")
    .option("--seller-destination <address|spk>", "Required: the seller destination the escrow was created with: an address, or its script public key in hex without the version (EscrowConfig.sellerDestinationSpk)")
    .option("--refund-amount <sompi>", "Required: the escrow's refundAmount (sompi), as it was created")
    .option("--release-amount <sompi>", "Required: the escrow's releaseAmount (sompi), as it was created")
    .option("--network <network>", "Network id (default simnet); mainnet refused; testnet-<n> needs experimental + network.allowPublic", "simnet")
    .option("--url <url>", "Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet)")
    .option("--out <file>", "Output draft file path (default rescue-v1-plan.draft.json)", "rescue-v1-plan.draft.json")
    .option("--fee <sompi>", "Miner fee in sompi (default 400000 sompi = 0.004 KAS)", "400000")
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
      // canonical localnet only), proven before anything is read from it; never mainnet. MAINNET TOTAL LOCKDOWN (RC2 oracle
      // O3): `prepare` reads the UTXO from the node, so its refusal is the connection one — the same code and exit for
      // `--network mainnet` and an alias that declares it (it was MAINNET_BROADCAST_DISABLED, exit 1, for the name only),
      // raised by resolveL1NodeTarget before anything is read; `broadcast` keeps MAINNET_BROADCAST_DISABLED. A node that
      // answers mainnet is refused by its one identity answer (proveL1Node). Both come before the escrow's arguments.
      const { resolveL1NodeTarget, proveL1Node } = await import("../runners/l1-node-target.js");
      const { rpc } = await proveL1Node(await resolveL1NodeTarget(String(opts.network), opts.url));
      let utxoEntry: any;
      let compiled: Awaited<ReturnType<typeof compileSilverScript>>;
      let lock: { version: number; script: string };
      let k: any;
      const { ESCROW_V1_SOURCE, ESCROW_V1_CONTRACT_NAME } = await import("@hardkas/escrow");
      try {
        // C-4 · the escrow's own constructor arguments (no placeholder keys, no destination or amount derived from the
        // rescue), then the v1 escrow they compile (pinned silverc), which must be --address: before anything is read
        const { loadKaspaWasm } = await import("@hardkas/accounts");
        k = await loadKaspaWasm();
        const escrowArgs = rescueEscrowConstructorArgs(k, opts);
        compiled = await compileSilverScript({ source: ESCROW_V1_SOURCE, constructorArgs: escrowArgs });
        const contract = getSilContract(compiled.artifact, ESCROW_V1_CONTRACT_NAME).contract;
        const redeemScriptHex = silContractBytecodeHex(contract);
        lock = silverP2shLock(redeemScriptHex);
        const lockAddress = silverP2shAddress(redeemScriptHex, String(opts.network));
        if (String(lockAddress).toLowerCase() !== String(opts.address).trim().toLowerCase()) {
          return fail(
            "RESCUE_LOCK_MISMATCH",
            `The v1 escrow these constructor arguments compile is at ${lockAddress}, not at --address ${opts.address}: the keys, destinations or amounts are not the ones the escrow was created with. Nothing was read or written.`
          );
        }
        try {
          const res = await rpc.getUtxosByAddresses([opts.address]);
          const entries = res.entries || [];
          utxoEntry = entries.find((e: any) => e.outpoint.transactionId.toLowerCase() === txId.toLowerCase() && Number(e.outpoint.index) === outputIndex);
        } catch (err: any) {
          return fail("RESCUE_RPC_FAILED", `Failed to query UTXOs from node: ${err.message}`);
        }
      } finally {
        await rpc.close().catch(() => {});
      }

      if (!utxoEntry) {
        return fail("RESCUE_UTXO_NOT_FOUND", `Outpoint ${opts.outpoint} not found on address ${opts.address}`);
      }

      const u = utxoEntry.utxoEntry;
      const spk = u.scriptPublicKey;
      const scriptPublicKey =
        spk && typeof spk === "object"
          ? { version: Number(spk.version ?? 0), script: String(spk.scriptPublicKey ?? spk.script ?? "") }
          : { version: parseInt(String(spk).slice(0, 4), 16) || 0, script: String(spk).slice(4) };
      // C-4 · the UTXO the node lists must be locked to that same escrow, before anything is computed from it
      if (scriptPublicKey.version !== Number(lock.version) || scriptPublicKey.script.toLowerCase() !== String(lock.script).toLowerCase()) {
        return fail(
          "RESCUE_LOCK_MISMATCH",
          `Outpoint ${opts.outpoint} is locked to script ${scriptPublicKey.script}, not to the v1 escrow these constructor arguments compile (${lock.script}). Nothing was written.`
        );
      }

      const totalSompi = BigInt(u.amount);
      if (totalSompi <= feeSompi) {
        return fail("RESCUE_INSUFFICIENT_FUNDS", `Outpoint amount (${totalSompi} sompi) is smaller than fee (${feeSompi} sompi)`);
      }
      const recoverSompi = totalSompi - feeSompi;

      const targetScript = k.payToAddressScript(new k.Address(opts.to));
      const targetSpkHex = targetScript.script;

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
