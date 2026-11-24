import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { assertMainnetTransactionsDisabled, formatSompiToKas, loadManagedKaspaWasmSync } from "@hardkas/core";
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
import { broadcastYesHelp, requireBroadcastConfirmation } from "../broadcast-confirmation.js";

function out() {
  return getOutput();
}

function fail(code: string, message: string, exitCode = HardkasExitCode.RUNTIME_FAILURE): never {
  throw new HardkasCliError(code, message, { exitCode });
}

/**
 * The most a rescue may pay in fee (the limit `prepare` already applied), enforced again at sign and broadcast.
 *
 * G3 · an emergency path needs room above the node's minimum relay fee (100 sompi/g of the rescue's compute mass, about
 * 300,000 sompi for a v1 escrow): the limit was 500,000, so a larger script or a higher floor left no fee that passed.
 * It is now the dev-server escrow's default fee ceiling (2,500,000 sompi = 0.025 KAS), several times that minimum and
 * still a fixed bound that no file can raise.
 */
const RESCUE_MAX_FEE_SOMPI = 2_500_000n;
/** The fee `prepare` pays when --fee is not given, raised to the node's minimum relay fee for the rescue when that is higher. */
const RESCUE_DEFAULT_FEE_SOMPI = 400_000n;

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
    .option(
      "--fee <sompi>",
      "Miner fee in sompi (default 400000 sompi = 0.004 KAS, raised to the node's minimum relay fee for this rescue when that is higher; at most 2500000)"
    )
    .option("--json", "Output as JSON", false)
    .action(async (opts: any) => {
      const [txId, idxStr] = opts.outpoint.split(":");
      if (!txId || idxStr === undefined || !/^[0-9a-f]{64}$/i.test(txId) || !/^\d+$/.test(idxStr)) {
        return fail("RESCUE_OUTPOINT_INVALID", `Invalid outpoint '${opts.outpoint}'; expected format txid:index`);
      }
      const outputIndex = parseInt(idxStr, 10);
      // G3: an explicit --fee is used as given (if it meets the node's minimum); the default is raised to that minimum
      const explicitFee = opts.fee !== undefined && opts.fee !== "";
      let feeSompi = explicitFee ? BigInt(opts.fee) : RESCUE_DEFAULT_FEE_SOMPI;
      if (feeSompi > RESCUE_MAX_FEE_SOMPI) {
        return fail("ESCROW_FEE_EXCESSIVE_REFUSED", `Requested rescue fee (${feeSompi} sompi) exceeds maximum safe fee of ${RESCUE_MAX_FEE_SOMPI} sompi.`);
      }

      // L1-CORE-1 B3: the node of the network asked for (--url, else the workspace's declared endpoint; it was the
      // canonical localnet only), proven before anything is read from it; never mainnet. MAINNET TOTAL LOCKDOWN (lockdown oracle
      // O3): `prepare` reads the UTXO from the node, so its refusal is the connection one — the same code and exit for
      // `--network mainnet` and an alias that declares it (it was MAINNET_BROADCAST_DISABLED, exit 1, for the name only),
      // raised by resolveL1NodeTarget before anything is read; `broadcast` keeps MAINNET_BROADCAST_DISABLED. A node that
      // answers mainnet is refused by its one identity answer (proveL1Node). Both come before the escrow's arguments.
      const { resolveL1NodeTarget, proveL1Node } = await import("../runners/l1-node-target.js");
      const { rpc } = await proveL1Node(await resolveL1NodeTarget(String(opts.network), opts.url));
      // G7 e (kaspa-agent-notes cross-check): the destination must be an address of the rescue's own network. Another
      // prefix would pay the same key's script here while the package named a foreign address. After the node's proof,
      // so the mainnet and identity refusals keep coming first.
      const { addressMatchesNetwork } = await import("@hardkas/accounts");
      if (!addressMatchesNetwork(String(opts.to), String(opts.network))) {
        return fail(
          "NETWORK_ADDRESS_MISMATCH",
          `--to ${opts.to} is not an address of ${opts.network}: give the destination on the rescue's own network. Nothing was read or written.`,
          HardkasExitCode.USAGE_ERROR
        );
      }
      let utxoEntry: any;
      let compiled: Awaited<ReturnType<typeof compileSilverScript>>;
      let lock: { version: number; script: string };
      let k: any;
      const { ESCROW_V1_SOURCE, ESCROW_V1_CONTRACT_NAME } = await import("@hardkas/sdk");
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
      const insufficient = () => fail("RESCUE_INSUFFICIENT_FUNDS", `Outpoint amount (${totalSompi} sompi) is smaller than fee (${feeSompi} sompi)`);
      if (totalSompi <= feeSompi) return insufficient();

      const targetScript = k.payToAddressScript(new k.Address(opts.to));
      const targetSpkHex = targetScript.script;

      const contractUtxo = {
        outpoint: { transactionId: utxoEntry.outpoint.transactionId, index: Number(utxoEntry.outpoint.index) },
        amountSompi: BigInt(u.amount),
        scriptPublicKey,
        blockDaaScore: BigInt(u.blockDaaScore ?? 0),
        isCoinbase: !!u.isCoinbase
      };

      const { prepareSilverSpend } = await import("@hardkas/accounts");
      const draftFor = (fee: bigint) =>
        prepareSilverSpend({
          artifact: compiled.artifact,
          contractName: ESCROW_V1_CONTRACT_NAME,
          entry: "mutualRelease",
          args: [{ kind: "signer", signer: "buyer" }, { kind: "signer", signer: "seller" }],
          utxo: contractUtxo,
          outputs: [{ amountSompi: totalSompi - fee, scriptPublicKey: { version: 0 as const, script: targetSpkHex } }],
          networkId: opts.network
        });
      // G3: the node's minimum relay fee for this rescue (prepareSilverSpend measures it: 100 sompi/g of the compute mass;
      // it used to be the SDK's storage-inclusive figure, which a 0.1 KAS escrow output could not pay at the default fee)
      let draft: ReturnType<typeof draftFor>;
      try {
        draft = draftFor(feeSompi);
      } catch (e: any) {
        if (e?.code !== "FEE_BELOW_NETWORK_MINIMUM" || typeof e.minimumFeeSompi !== "string") throw e;
        const minimum = BigInt(e.minimumFeeSompi);
        if (explicitFee) {
          return fail(
            "FEE_BELOW_NETWORK_MINIMUM",
            `--fee ${feeSompi} sompi is below the node's minimum relay fee for this rescue (${minimum} sompi: 100 sompi/g of its compute mass). ` +
              `Pass --fee ${minimum} or more (at most ${RESCUE_MAX_FEE_SOMPI}). Nothing was written.`
          );
        }
        if (minimum > RESCUE_MAX_FEE_SOMPI) {
          return fail(
            "ESCROW_FEE_EXCESSIVE_REFUSED",
            `The node's minimum relay fee for this rescue (${minimum} sompi) is above the rescue fee limit of ${RESCUE_MAX_FEE_SOMPI} sompi. Nothing was written.`
          );
        }
        feeSompi = minimum;
        if (totalSompi <= feeSompi) return insufficient();
        draft = draftFor(feeSompi);
      }
      const recoverSompi = totalSompi - feeSompi;

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
      // G7-n: exact (bigint) sompi → KAS; Number() lost precision above 2^53 sompi
      out().writeLine(`  Recover:   ${pc.yellow(formatSompiToKas(recoverSompi))} KAS (${recoverSompi} sompi)`);
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
    .option("--yes", broadcastYesHelp("the rescue"), false)
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
      // BETA-FIX W2 · AUX-11 (tx send's rule): off simnet nothing is finalized or sent without --yes
      requireBroadcastConfirmation({
        command: "escrow rescue-v1 broadcast",
        network: String(network),
        yes: opts.yes,
        json: opts.json,
        nothingDone: "Nothing was finalized, broadcast or written; no node was contacted."
      });

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

  // ESCROW-LIFECYCLE-1: create, fund, status, prepare, sign, release, reconcile (v2 EscrowFull / EscrowSplit)
  registerEscrowLifecycleCommands(escrow);
}

// =====================================================================================================================
// ESCROW-LIFECYCLE-1 · the v2 escrow lifecycle (EscrowFull, EscrowSplit) on any node that proves its identity, through
// sdk.escrow: the dev server's rules (shared from @hardkas/sdk), records in .hardkas/escrows/, the workspace's accounts
// (development accounts and encrypted keystores, as `silver spend`), every transaction sent by sdk.tx.send. Signers may
// be different people: `prepare` writes a release request, each signer runs `escrow sign <file>` in their own workspace,
// then `escrow release <id> --signatures <file...>`. Mainnet is refused first; a public testnet needs the payments'
// opt-in (experimental: true and network.allowPublic: true).
// =====================================================================================================================

const ESCROW_NETWORK_HELP =
  "Network (default: the escrow's own, else the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config";
const ESCROW_URL_HELP =
  "Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). The canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced)";
const ESCROW_PASSWORD_ENV_HELP = "Read the keystore password of the encrypted account this command signs with from this environment variable (development accounts need none)";
const ESCROW_PASSWORD_STDIN_HELP = "Read the keystore password of the encrypted account this command signs with from stdin";
const ESCROW_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ESCROW_NOTHING_DONE = "Nothing was read, signed, broadcast or written; no node was contacted.";

/** A HardkasError of the SDK as the CLI fails with it: same code, an exit code for its kind. */
function escrowSdkFailure(e: unknown): never {
  if (e instanceof HardkasCliError) throw e;
  const code = typeof (e as any)?.code === "string" ? String((e as any).code) : "ESCROW_FAILED";
  const message = String((e as any)?.message ?? e).replace(new RegExp(`^${code}:\\s*`), "");
  const usage = /^(ESCROW_(CONFIG_INVALID|NOT_FOUND|RECORD_INVALID|REQUEST_INVALID|REQUEST_MISMATCH|NETWORK_MISMATCH|NETWORK_NOT_SUPPORTED|ROLE_NOT_REQUIRED|SIGNER_NOT_FOUND|BUYER_ACCOUNT_NOT_FOUND|BRANCH_UNKNOWN|SPLIT_SUM_MISMATCH|NOT_FUNDED|NOT_PREPARED|NOT_READY)|ACCOUNT_|KEYSTORE_|NETWORK_ADDRESS_MISMATCH)/.test(code);
  const policy = /^MAINNET_|^PUBLIC_NETWORK_BLOCKED$/.test(code);
  throw new HardkasCliError(code, message, { exitCode: policy ? HardkasExitCode.POLICY_DENIED : usage ? HardkasExitCode.USAGE_ERROR : HardkasExitCode.RUNTIME_FAILURE, cause: e });
}

async function escrowConfig(): Promise<any> {
  const { loadHardkasConfig } = await import("@hardkas/config");
  return (await loadHardkasConfig({ workspaceRoot: process.cwd() })).config as any;
}

/** MAINNET TOTAL LOCKDOWN first (the name and what its config entry declares), then the payments' public opt-in. */
async function gateEscrowNetwork(network: string, config?: any): Promise<void> {
  const { isMainnetNetworkId, declaredNetworkIdOf, MAINNET_CONNECTION_DISABLED, mainnetConnectionDisabledMessage } = await import("@hardkas/core");
  const refuseMainnet = () =>
    fail(MAINNET_CONNECTION_DISABLED, mainnetConnectionDisabledMessage(`the escrow on ${network}; nothing was read, signed or sent`), HardkasExitCode.POLICY_DENIED);
  if (isMainnetNetworkId(network)) refuseMainnet();
  let cfg = config;
  if (cfg === undefined) {
    try {
      cfg = await escrowConfig();
    } catch {
      cfg = {};
    }
  }
  if (isMainnetNetworkId(declaredNetworkIdOf(cfg, network))) refuseMainnet();
  const { isPublicKaspaNetwork } = await import("@hardkas/config");
  if (isPublicKaspaNetwork(network) && !(cfg?.network?.allowPublic === true && cfg?.experimental === true)) {
    fail(
      "PUBLIC_NETWORK_BLOCKED",
      `${network} needs the same opt-in as payments there: experimental: true and network.allowPublic: true in hardkas.config.ts. Nothing was done.`,
      HardkasExitCode.POLICY_DENIED
    );
  }
}

/**
 * The network an escrow command runs on: `--network` (checked first, before anything is read), else the record's (for a
 * command naming an escrow of this workspace), else the workspace's execution network, else simnet. Gated (mainnet,
 * public opt-in) before it is used.
 */
async function escrowNetworkOf(explicit: string | undefined, id?: string): Promise<string> {
  if (explicit !== undefined) {
    await gateEscrowNetwork(String(explicit));
    return String(explicit);
  }
  let network: string | undefined;
  if (id !== undefined && ESCROW_ID_RE.test(id)) {
    try {
      const { loadHardkasConfig } = await import("@hardkas/config");
      const { cwd } = await loadHardkasConfig({ workspaceRoot: process.cwd() });
      const record = JSON.parse(fs.readFileSync(path.join(cwd ?? process.cwd(), ".hardkas", "escrows", `${id}.json`), "utf8"));
      if (typeof record?.networkId === "string") network = record.networkId;
    } catch {
      network = undefined;
    }
  }
  const config = await escrowConfig().catch(() => ({}) as any);
  if (network === undefined) {
    const exec: any = config?.execution;
    const target = exec?.default ? exec.targets?.[exec.default] : undefined;
    network = typeof target?.network === "string" ? target.network : typeof config?.defaultNetwork === "string" ? config.defaultNetwork : "simnet";
    if (network === "simulated") network = "simnet";
  }
  await gateEscrowNetwork(network!, config);
  return network!;
}

/** The SDK on this workspace's `network`, a Kaspa node network (never the simulator); its client `rpc` when given. */
async function openEscrowSdk(network: string, rpc?: unknown): Promise<import("@hardkas/sdk").Hardkas> {
  const { Hardkas } = await import("@hardkas/sdk");
  let sdk: import("@hardkas/sdk").Hardkas;
  try {
    sdk = await Hardkas.open({ cwd: process.cwd(), network, autoBootstrap: true });
  } catch (e) {
    return escrowSdkFailure(e);
  }
  const e = sdk.execution;
  if (e.mode === "simulator" || e.domain !== "kaspa-l1") {
    await sdk.close();
    fail(
      "ESCROW_NETWORK_NOT_SUPPORTED",
      `the escrow lifecycle runs on a Kaspa node network; this workspace runs ${network} as ${e.mode} ${e.domain} ${e.network}. Nothing was read or written.`,
      HardkasExitCode.USAGE_ERROR
    );
  }
  if (rpc !== undefined) (sdk as any).rpc = rpc;
  return sdk;
}

/** `use` with the SDK on `network`, offline (no node is contacted). */
async function withEscrowSdk<T>(network: string, use: (sdk: import("@hardkas/sdk").Hardkas) => Promise<T>): Promise<T> {
  const sdk = await openEscrowSdk(network);
  try {
    return await use(sdk);
  } catch (e) {
    return escrowSdkFailure(e);
  } finally {
    await sdk.close();
  }
}

/** `use` with the SDK on the node of `network` (--url, else the workspace's), after it proved its identity and sync. */
async function withEscrowNode<T>(
  network: string,
  url: string | undefined,
  operation: string,
  use: (sdk: import("@hardkas/sdk").Hardkas, node: any) => Promise<T>
): Promise<T> {
  const { resolveL1NodeTarget, proveL1Node } = await import("../runners/l1-node-target.js");
  const target = await resolveL1NodeTarget(network, url);
  const { identity, rpc } = await proveL1Node(target, operation);
  try {
    const sdk = await openEscrowSdk(network, rpc);
    try {
      return await use(sdk, { managed: target.managed, rpcUrl: target.rpcUrl, identity });
    } catch (e) {
      return escrowSdkFailure(e);
    } finally {
      await sdk.close();
    }
  } finally {
    await rpc.close().catch(() => {});
  }
}

/** The keystore password of `account` when it is an encrypted one (never argv; at most once). */
async function escrowPassword(sdk: import("@hardkas/sdk").Hardkas, account: string, opts: any): Promise<string | undefined> {
  const { accountNeedsKeystorePassword } = await import("../runners/tx-sign-runner.js");
  let resolved: any;
  try {
    resolved = await sdk.accounts.resolve(account);
  } catch (e) {
    return escrowSdkFailure(e);
  }
  if (!accountNeedsKeystorePassword(resolved)) return undefined;
  const { acquirePassword } = await import("../runners/secrets.js");
  return acquirePassword({ env: opts.passwordEnv, stdin: Boolean(opts.passwordStdin), interactive: !opts.json, message: `Enter the keystore password of account '${resolved.name ?? account}':` });
}

function kasOption(value: unknown, flag: string): bigint {
  const v = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,8})?$/.test(v)) fail("ESCROW_CONFIG_INVALID", `${flag} '${v}' is not an amount of KAS (up to 8 decimals). Nothing was created.`, HardkasExitCode.USAGE_ERROR);
  const [whole, frac = ""] = v.split(".");
  const sompi = BigInt(whole!) * 100_000_000n + BigInt((frac + "00000000").slice(0, 8));
  if (sompi <= 0n) fail("ESCROW_CONFIG_INVALID", `${flag} must be positive. Nothing was created.`, HardkasExitCode.USAGE_ERROR);
  return sompi;
}

function sompiOption(value: unknown, flag: string): bigint {
  const v = String(value ?? "").trim();
  if (!/^\d{1,20}$/.test(v) || BigInt(v) <= 0n) fail("ESCROW_CONFIG_INVALID", `${flag} '${v}' is not a positive amount in sompi. Nothing was created.`, HardkasExitCode.USAGE_ERROR);
  return BigInt(v);
}

const kas = (sompi: unknown) => `${formatSompiToKas(BigInt(String(sompi)))} KAS (${String(sompi)} sompi)`;

/** A record as the commands print it: everything but the compiled artifact. */
const shownRecord = (r: any) => ({ ...r, artifact: undefined });

function readRequestFile(file: string): any {
  const p = path.resolve(process.cwd(), file);
  let text: string;
  try {
    text = fs.readFileSync(p, "utf8");
  } catch (e: any) {
    return fail("ESCROW_REQUEST_INVALID", `release request ${file}: ${e?.code ?? e?.message}. Nothing was signed.`, HardkasExitCode.USAGE_ERROR);
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return fail("ESCROW_REQUEST_INVALID", `release request ${file} is not JSON. Nothing was signed.`, HardkasExitCode.USAGE_ERROR);
  }
}

function writeJsonFile(file: string, value: unknown): string {
  const p = path.resolve(process.cwd(), file);
  fs.writeFileSync(p, JSON.stringify(value, null, 2), "utf8");
  return p;
}

function printRelease(request: any) {
  out().writeLine(`  Branch:    ${request.branch} (signed by ${request.requiredSigners.join(" and ")})`);
  for (const o of request.outputs ?? []) out().writeLine(`  Pays:      ${kas(o.amountSompi)} to ${o.address ?? `script ${o.scriptPublicKey}`}`);
  out().writeLine(`  Fee:       ${kas(request.feeSompi)}`);
  out().writeLine(`  Signed by: ${Object.keys(request.signatures ?? {}).join(", ") || "(nobody yet)"}`);
}

export function registerEscrowLifecycleCommands(escrow: Command) {
  // ---------------------------------------------------------------- create
  escrow
    .command("create")
    .description(
      "Create a v2 escrow (EscrowFull with --amount, EscrowSplit with --buyer-amount and --seller-amount), compiled by the pinned silverc for the network, and record it in this workspace. Nothing is sent"
    )
    .requiredOption("--buyer <party>", "The buyer: an account of this workspace, a Schnorr address of the network, or a 32-byte x-only public key (hex)")
    .requiredOption("--seller <party>", "The seller (account, address or x-only public key)")
    .requiredOption("--arbiter <party>", "The arbiter (account, address or x-only public key)")
    .option("--buyer-destination <address|spk>", "Where refunds pay (default: the buyer's own address): an address of the network, or a script public key in hex without the version")
    .option("--seller-destination <address|spk>", "Where releases pay (default: the seller's own address)")
    .option("--amount <kas>", "EscrowFull: the principal every branch pays (KAS)")
    .option("--buyer-amount <kas>", "EscrowSplit: the buyer's allocation (KAS), with --seller-amount")
    .option("--seller-amount <kas>", "EscrowSplit: the seller's allocation (KAS), with --buyer-amount")
    .option("--fee-budget <sompi>", "The fee of every release, added to the funding (sompi; default 2000000 = 0.02 KAS; at least the node's minimum relay fee of a release, checked before funding)")
    .option("--nonce <hex>", "32-byte nonce that makes the escrow's address unique (default: random)")
    .option("--network <network>", ESCROW_NETWORK_HELP)
    .option("--json", "Output as JSON", false)
    .action(async (opts: any) => {
      const network = await escrowNetworkOf(opts.network);
      const full = opts.amount !== undefined;
      const split = opts.buyerAmount !== undefined || opts.sellerAmount !== undefined;
      if (full === split || (split && (opts.buyerAmount === undefined || opts.sellerAmount === undefined))) {
        fail(
          "ESCROW_CONFIG_INVALID",
          "give --amount (EscrowFull) or both --buyer-amount and --seller-amount (EscrowSplit), not both and not neither. Nothing was created.",
          HardkasExitCode.USAGE_ERROR
        );
      }
      const record = await withEscrowSdk(network, async (sdk) => {
        const [buyer, seller, arbiter] = [await sdk.escrow.partyOf(opts.buyer), await sdk.escrow.partyOf(opts.seller), await sdk.escrow.partyOf(opts.arbiter)];
        const config: any = {
          buyer: { publicKeyHex: buyer.publicKeyHex },
          seller: { publicKeyHex: seller.publicKeyHex },
          arbiter: { publicKeyHex: arbiter.publicKeyHex },
          buyerDestinationSpk: opts.buyerDestination !== undefined ? sdk.escrow.destinationOf(opts.buyerDestination) : buyer.destinationSpk,
          sellerDestinationSpk: opts.sellerDestination !== undefined ? sdk.escrow.destinationOf(opts.sellerDestination) : seller.destinationSpk,
          version: "v2",
          mode: full ? "full" : "split",
          ...(full ? { principal: kasOption(opts.amount, "--amount").toString() } : {}),
          ...(split ? { buyerAmount: kasOption(opts.buyerAmount, "--buyer-amount").toString(), sellerAmount: kasOption(opts.sellerAmount, "--seller-amount").toString() } : {}),
          ...(opts.feeBudget !== undefined ? { feeBudgetSompi: sompiOption(opts.feeBudget, "--fee-budget").toString() } : {}),
          ...(opts.nonce !== undefined ? { escrowNonce: String(opts.nonce) } : {})
        };
        return sdk.escrow.create(config);
      });
      const { escrowFundingAmount } = await import("@hardkas/sdk");
      const funding = escrowFundingAmount(record.config).toString();
      if (opts.json) return out().writeJson({ ok: true, id: record.id, address: record.p2shState.address, contract: record.provenance.contractName, networkId: record.networkId, fundingSompi: funding, escrow: shownRecord(record) });
      out().writeLine(pc.bold(pc.green(`✓ Escrow created (${record.provenance.contractName})`)));
      out().writeLine(`  Id:       ${pc.cyan(record.id)}`);
      out().writeLine(`  Address:  ${record.p2shState.address}`);
      out().writeLine(`  Network:  ${record.networkId}`);
      out().writeLine(`  Funding:  ${kas(funding)} (principal + fee budget)`);
      out().writeLine(pc.dim(`Next: hardkas escrow fund ${record.id} --from <buyer account>`));
    });

  // ---------------------------------------------------------------- fund
  escrow
    .command("fund <id>")
    .description("Fund an escrow from the buyer's account: one payment of its funding amount (principal + fee budget) to its address, planned, signed and sent by HardKAS's payment path. Refused before anything is signed if any release could not pay the node's minimum relay fee")
    .requiredOption("--from <account>", "The buyer's account of this workspace (its key must be the escrow's buyer key)")
    .option("--network <network>", ESCROW_NETWORK_HELP)
    .option("--url <url>", ESCROW_URL_HELP)
    .option("--wait", "Wait until a chain block accepts the funding", false)
    .option("--timeout <seconds>", "With --wait: how long to wait", "120")
    .option("--password-env <env>", ESCROW_PASSWORD_ENV_HELP)
    .option("--password-stdin", ESCROW_PASSWORD_STDIN_HELP, false)
    .option("--yes", broadcastYesHelp("the funding"), false)
    .option("--json", "Output as JSON", false)
    .action(async (id: string, opts: any) => {
      const network = await escrowNetworkOf(opts.network, id);
      // BETA-FIX W2 · AUX-11 (tx send's rule): off simnet nothing is read, signed or sent without --yes
      requireBroadcastConfirmation({ command: "escrow fund", network, yes: opts.yes, json: opts.json, nothingDone: ESCROW_NOTHING_DONE });
      const result = await withEscrowNode(network, opts.url, "escrow fund", async (sdk) => {
        const keystorePassword = await escrowPassword(sdk, String(opts.from), opts);
        return sdk.escrow.fund(id, { account: String(opts.from), ...(keystorePassword !== undefined ? { keystorePassword } : {}), ...(opts.wait ? { waitMs: Number(opts.timeout) * 1000 } : {}) });
      });
      if (opts.json) return out().writeJson({ ok: true, id, txId: result.txId, status: result.status, submissionArtifactId: result.submissionArtifactId, ...(result.warnings ? { warnings: result.warnings } : {}), escrow: shownRecord(result.record) });
      for (const w of result.warnings ?? []) out().warn(pc.yellow(`warning: ${w}`));
      out().writeLine(pc.bold(pc.green(`✓ Escrow funded (${result.status})`)));
      out().writeLine(`  TXID:    ${pc.cyan(result.txId)}`);
      out().writeLine(`  Amount:  ${kas(result.record.funding.amountSompi)}`);
      out().writeLine(pc.dim(`Next: hardkas escrow prepare ${id} --branch <branch>`));
    });

  // ---------------------------------------------------------------- status
  escrow
    .command("status <id>")
    .description("Show an escrow recorded in this workspace: its state, funding, prepared release, signatures and release (no node is contacted)")
    .option("--json", "Output as JSON", false)
    .action(async (id: string, opts: any) => {
      const network = await escrowNetworkOf(undefined, id);
      const record = await withEscrowSdk(network, (sdk) => sdk.escrow.status(id));
      if (opts.json) return out().writeJson({ ok: true, escrow: shownRecord(record) });
      out().writeLine(pc.bold(`Escrow ${record.id} (${record.provenance?.contractName ?? "?"}, ${record.networkId ?? "simnet"})`));
      out().writeLine(`  State:     ${record.state}`);
      out().writeLine(`  Address:   ${record.p2shState.address}`);
      out().writeLine(`  Funding:   ${record.funding.status}${record.funding.transactionId ? ` ${record.funding.transactionId}` : ""}`);
      if (record.preparedRelease) out().writeLine(`  Release:   ${record.preparedRelease.branch} prepared; signed by ${Object.keys(record.signatures).join(", ") || "(nobody yet)"}`);
      if (record.release) out().writeLine(`  Sent:      ${record.release.transactionId} (${record.release.status})`);
    });

  // ---------------------------------------------------------------- prepare
  escrow
    .command("prepare <id>")
    .description("Prepare the release of one branch over the recorded funding and write the release request each required signer signs (in this workspace, or in their own with `escrow sign <file>`)")
    .requiredOption("--branch <branch>", "EscrowFull: mutualRelease, refundBuyer, releaseToSeller; EscrowSplit: executeSplit, fullRefund, fullRelease, mutualRelease")
    .option("--buyer-share <kas>", "mutualRelease: what the buyer receives (KAS), with --seller-share; together the principal (default: the contract's default allocation)")
    .option("--seller-share <kas>", "mutualRelease: what the seller receives (KAS), with --buyer-share")
    .option("--out <file>", "The release request file (default escrow-<id>-<branch>.request.json)")
    .option("--network <network>", ESCROW_NETWORK_HELP)
    .option("--json", "Output as JSON", false)
    .action(async (id: string, opts: any) => {
      const network = await escrowNetworkOf(opts.network, id);
      if ((opts.buyerShare === undefined) !== (opts.sellerShare === undefined)) {
        fail("ESCROW_CONFIG_INVALID", "give both --buyer-share and --seller-share, or neither. Nothing was prepared.", HardkasExitCode.USAGE_ERROR);
      }
      const share = (v: unknown, flag: string): bigint => {
        const s = String(v ?? "").trim();
        if (/^0+(\.0*)?$/.test(s)) return 0n;
        return kasOption(s, flag);
      };
      const mutualSplit = opts.buyerShare !== undefined ? { buyerSompi: share(opts.buyerShare, "--buyer-share"), sellerSompi: share(opts.sellerShare, "--seller-share") } : undefined;
      const request = await withEscrowSdk(network, (sdk) => sdk.escrow.prepare(id, { branch: String(opts.branch), ...(mutualSplit ? { mutualSplit } : {}) }));
      const file = writeJsonFile(opts.out ?? `escrow-${id.slice(0, 8)}-${request.branch}.request.json`, request);
      if (opts.json) return out().writeJson({ ok: true, id, file, request });
      out().writeLine(pc.bold(pc.green("✓ Release prepared")));
      out().writeLine(`  Request:   ${pc.cyan(file)}`);
      printRelease(request);
      out().writeLine(pc.dim(`Next: each of ${request.requiredSigners.join(" and ")} runs  hardkas escrow sign ${path.basename(file)} --role <role> --account <account>`));
      out().writeLine(pc.dim(`      then  hardkas escrow release ${id} --signatures <signed request file>...`));
    });

  // ---------------------------------------------------------------- sign
  escrow
    .command("sign <id-or-request>")
    .description(
      "Sign an escrow's prepared release as one role: an escrow id of this workspace (the signature goes into its record), or a release request file, checked first against the escrow's own terms (the contract recompiled, the draft prepared again) and signed here, in the signer's own workspace"
    )
    .requiredOption("--role <role>", "buyer, seller or arbiter: a role the prepared branch requires")
    .requiredOption("--account <account>", "The account of this workspace that signs (its key must be the escrow's key for the role)")
    .option("--out <file>", "With a request file: where the signed request is written (default: the request file itself)")
    .option("--network <network>", ESCROW_NETWORK_HELP)
    .option("--password-env <env>", ESCROW_PASSWORD_ENV_HELP)
    .option("--password-stdin", ESCROW_PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (target: string, opts: any) => {
      if (opts.network !== undefined) await gateEscrowNetwork(String(opts.network));
      const role = String(opts.role);
      const account = String(opts.account);
      if (ESCROW_ID_RE.test(target) && !fs.existsSync(path.resolve(process.cwd(), target))) {
        const network = await escrowNetworkOf(opts.network, target);
        const r = await withEscrowSdk(network, async (sdk) => {
          const keystorePassword = await escrowPassword(sdk, account, opts);
          return sdk.escrow.sign(target, { role, account, ...(keystorePassword !== undefined ? { keystorePassword } : {}) });
        });
        if (opts.json) return out().writeJson({ ok: true, id: target, role, state: r.record.state, signatures: Object.keys(r.record.signatures) });
        out().writeLine(pc.bold(pc.green(`✓ Signed escrow ${target} as ${role} with '${account}'`)));
        out().writeLine(`  State:     ${r.record.state}`);
        return;
      }
      const request = readRequestFile(target);
      const network = await escrowNetworkOf(opts.network ?? (typeof request?.networkId === "string" ? request.networkId : undefined));
      const signed = await withEscrowSdk(network, async (sdk) => {
        const keystorePassword = await escrowPassword(sdk, account, opts);
        return sdk.escrow.signRequest(request, { role, account, ...(keystorePassword !== undefined ? { keystorePassword } : {}) });
      });
      const file = writeJsonFile(opts.out ?? target, signed.request);
      if (opts.json) return out().writeJson({ ok: true, id: signed.request.escrowId, role, file, signatures: Object.keys(signed.request.signatures) });
      out().writeLine(pc.bold(pc.green(`✓ Signed the release request as ${role} with '${account}'`)));
      out().writeLine(`  Request:   ${pc.cyan(file)}`);
      printRelease(signed.request);
    });

  // ---------------------------------------------------------------- release
  escrow
    .command("release <id>")
    .description("Send an escrow's prepared release once every required role signed: each signature verified (BIP340) before anything is sent, then one send through HardKAS's send machinery. An unknown outcome is recorded and never sent again before reconcile")
    .option("--signatures <files...>", "Signed release request files to take the signatures from (each checked against this escrow's prepared release)")
    .option("--network <network>", ESCROW_NETWORK_HELP)
    .option("--url <url>", ESCROW_URL_HELP)
    .option("--wait", "Wait until a chain block accepts the release (RELEASED)", false)
    .option("--timeout <seconds>", "With --wait: how long to wait", "120")
    .option("--yes", broadcastYesHelp("the release"), false)
    .option("--json", "Output as JSON", false)
    .action(async (id: string, opts: any) => {
      const network = await escrowNetworkOf(opts.network, id);
      // BETA-FIX W2 · AUX-11 (tx send's rule): off simnet nothing is read, recorded or sent without --yes (the --signatures
      // files are not added to the record either)
      requireBroadcastConfirmation({ command: "escrow release", network, yes: opts.yes, json: opts.json, nothingDone: ESCROW_NOTHING_DONE });
      const requests = ((opts.signatures ?? []) as string[]).map((f) => readRequestFile(f));
      if (requests.length > 0) {
        await withEscrowSdk(network, async (sdk) => {
          for (const r of requests) await sdk.escrow.addSignatures(id, r);
        });
      }
      const result = await withEscrowNode(network, opts.url, "escrow release", (sdk) => sdk.escrow.release(id, opts.wait ? { waitMs: Number(opts.timeout) * 1000 } : {}));
      if (opts.json) return out().writeJson({ ok: true, id, txId: result.txId, status: result.status, state: result.record.state, submissionArtifactId: result.submissionArtifactId, escrow: shownRecord(result.record) });
      out().writeLine(pc.bold(pc.green(`✓ Escrow release sent (${result.status})`)));
      out().writeLine(`  TXID:    ${pc.cyan(result.txId)}`);
      out().writeLine(`  State:   ${result.record.state}`);
      if (result.record.state !== "RELEASED") out().writeLine(pc.dim(`Next: hardkas escrow reconcile ${id}`));
    });

  // ---------------------------------------------------------------- reconcile
  escrow
    .command("reconcile <id>")
    .description("Look at the node once for an escrow's pending funding and release (its mempool, then its chain) and record what it shows: accepted by a chain block → confirmed (FUNDED / RELEASED)")
    .option("--network <network>", ESCROW_NETWORK_HELP)
    .option("--url <url>", ESCROW_URL_HELP)
    .option("--json", "Output as JSON", false)
    .action(async (id: string, opts: any) => {
      const network = await escrowNetworkOf(opts.network, id);
      const r = await withEscrowNode(network, opts.url, "escrow reconcile", (sdk) => sdk.escrow.reconcile(id));
      if (opts.json) return out().writeJson({ ok: true, id, state: r.record.state, observations: r.observations, escrow: shownRecord(r.record) });
      out().writeLine(pc.bold(`Escrow ${id}: ${r.record.state}`));
      for (const [what, look] of Object.entries(r.observations)) out().writeLine(`  ${what.padEnd(8)} ${look.state}${look.error ? ` (${look.error})` : ""}`);
      out().writeLine(`  Funding:  ${r.record.funding.status}${r.record.release ? `; release ${r.record.release.status}` : ""}`);
    });
}
