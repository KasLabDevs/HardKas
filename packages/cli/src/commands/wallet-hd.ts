import { Command } from "commander";
import { UI } from "../ui.js";
import { getOutput } from "../output.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { broadcastYesHelp, requireBroadcastConfirmation } from "../broadcast-confirmation.js";

/*
 * WALLET-HD-1 · `hardkas wallet hd …`: recoverable BIP39/BIP32 Kaspa HD wallets kept in the workspace
 * (`.hardkas/wallets/<walletId>.json`, encrypted, @hardkas/accounts HdWalletManager) and spent through the SDK's send
 * machinery (@hardkas/sdk HardkasHdWallets: one plan over every address's UTXOs, one key per input, sdk.tx.send).
 * Secrets come from a named environment variable or stdin, never from an argument; a recovery phrase is printed only by
 * `reveal --yes`. Mainnet is refused first, in every command, before any password, phrase or node is touched.
 */

const PASSWORD_ENV = "Read the wallet password from this environment variable";
const PASSWORD_STDIN = "Read the wallet password from stdin";
const PASSPHRASE_ENV = "Read the wallet's BIP39 passphrase (the optional \"25th word\") from this environment variable; never stored";
const JSON_OPT = "Output as JSON";

interface SecretOptions {
  passwordEnv?: string;
  passwordStdin?: boolean;
  passphraseEnv?: string;
  json?: boolean;
}

function usage(code: string, message: string, suggestion?: string): HardkasCliError {
  return new HardkasCliError(code, message, { exitCode: HardkasExitCode.USAGE_ERROR, ...(suggestion ? { suggestion } : {}) });
}

async function readStdin(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (text += chunk));
    process.stdin.on("end", () => resolve(text.trim()));
    process.stdin.on("error", reject);
  });
}

/** The workspace root and its configuration (none when the workspace has no loadable config). */
async function workspace(): Promise<{ root: string; config: Record<string, any> | undefined }> {
  const { invocationWorkspaceRoot } = await import("../workspace-root.js");
  const { workspaceConfigForGuard } = await import("../mainnet-guard.js");
  const root = invocationWorkspaceRoot();
  return { root, config: (await workspaceConfigForGuard(root)) as Record<string, any> | undefined };
}

/** The network a new wallet is declared on: --network (a config entry or a network id), else the workspace's, else simnet. */
async function walletNetworkFor(config: Record<string, any> | undefined, given: string | undefined): Promise<{ name: string; declared: string }> {
  const { declaredNetworkIdOf } = await import("@hardkas/core");
  let name = given;
  if (!name) {
    try {
      const { resolveWorkspaceExecution } = await import("@hardkas/config");
      name = resolveWorkspaceExecution({ config: (config ?? {}) as any }).networkId;
    } catch {
      name = undefined;
    }
  }
  name = name && name.trim() !== "" ? name : "simnet";
  return { name, declared: declaredNetworkIdOf(config, name) ?? name };
}

async function password(o: SecretOptions, why: string, required = true): Promise<string | undefined> {
  if (!o.passwordEnv && !o.passwordStdin && !required) return undefined;
  const { acquirePassword } = await import("../runners/secrets.js");
  return acquirePassword({ env: o.passwordEnv, stdin: o.passwordStdin, interactive: !o.json, message: `Wallet password (${why}):` });
}

function passphrase(o: SecretOptions): string | undefined {
  if (!o.passphraseEnv) return undefined;
  const value = process.env[o.passphraseEnv];
  if (!value) {
    throw usage("HD_WALLET_PASSPHRASE_REQUIRED", `The environment variable ${o.passphraseEnv} named by --passphrase-env is not set or is empty.`);
  }
  return value;
}

function nonNegativeInt(value: string | undefined, option: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw usage("INVALID_ARGUMENT", `${option} takes a non-negative integer (got ${JSON.stringify(value)}).`);
  return Number(value);
}

/** The public description of a wallet, as printed (never a secret). */
function publicView(w: any) {
  return {
    walletId: w.walletId,
    name: w.label,
    network: w.network,
    kind: w.kind,
    accounts: w.accounts,
    passphraseRequired: w.passphraseRequired,
    ...(w.mnemonicWords !== undefined ? { mnemonicWords: w.mnemonicWords } : {}),
    createdAt: w.createdAt,
    origin: w.origin,
    path: w.path,
    verified: w.verified
  };
}

async function manager(root: string) {
  const { HdWalletManager } = await import("@hardkas/accounts");
  return new HdWalletManager({ workspaceRoot: root });
}

export function registerWalletHdCommands(program: Command) {
  const walletCmd = program.command("wallet").description("Wallets kept in the workspace");
  const hd = walletCmd
    .command("hd")
    .description(
      `Recoverable HD wallets: a BIP39 recovery phrase (12 or 24 English words) and Kaspa's BIP32 derivation (m/44'/111111'/<account>'/<0 receive|1 change>/<index>), encrypted in .hardkas/wallets/; they receive on many addresses and spend from all of them. Mainnet is refused while it is locked down ${UI.maturity("experimental")}`
    );

  hd.command("create")
    .description(`Create a wallet with a new random recovery phrase, encrypted under its password (the phrase is not printed: back it up with 'wallet hd reveal') ${UI.maturity("experimental")}`)
    .requiredOption("--name <name>", "Wallet name: 1 to 64 letters, digits, _ and -")
    .option("--network <network>", "Network the wallet is declared on: a network id (simnet, devnet, testnet-<n>) or a workspace network entry (default: the workspace's network, else simnet). Mainnet, in any spelling or through a config alias, is refused: MAINNET_SIGNING_DISABLED, nothing is generated")
    .option("--words <count>", "Recovery phrase length: 12 or 24 (default 24)")
    .option("--password-env <env>", PASSWORD_ENV)
    .option("--password-stdin", PASSWORD_STDIN, false)
    .option("--passphrase-env <env>", PASSPHRASE_ENV)
    .option("--json", JSON_OPT, false)
    .action(async (o: SecretOptions & { name: string; network?: string; words?: string }) => {
      const { root, config } = await workspace();
      const { refuseMainnetSigning } = await import("../mainnet-guard.js");
      refuseMainnetSigning(config, [o.network ?? (await walletNetworkFor(config, undefined)).name], "wallet hd create: no mainnet key is made while mainnet is locked down");
      const net = await walletNetworkFor(config, o.network);
      const words = o.words === undefined ? 24 : Number(o.words);
      if (words !== 12 && words !== 24) throw usage("HD_WALLET_WORD_COUNT_UNSUPPORTED", `--words takes 12 or 24 (got ${JSON.stringify(o.words)}).`);
      const pw = await password(o, `new wallet ${o.name}`);
      const pp = passphrase(o);
      const m = await manager(root);
      const w = await m.create({ label: o.name, network: net.declared, password: pw!, ...(pp !== undefined ? { passphrase: pp } : {}), words });
      const first = m.watch(w.walletId).address("receive", 0, w.network);
      const result = { ...publicView(w), firstReceiveAddress: first, backup: `hardkas wallet hd reveal ${w.label} --yes (prints the recovery phrase once: write it down offline)` };
      if (o.json) return getOutput().writeJson(result);
      getOutput().writeLine(`HD wallet '${w.label}' created on ${w.network} (${w.mnemonicWords}-word phrase${w.passphraseRequired ? ", with a BIP39 passphrase" : ""}).`);
      getOutput().writeLine(`  id:       ${w.walletId}`);
      getOutput().writeLine(`  file:     ${w.path}`);
      getOutput().writeLine(`  account 0 public key: ${w.accounts[0]?.xpub}`);
      getOutput().writeLine(`  first receive address: ${first}`);
      getOutput().writeLine(`  Back up the recovery phrase now: ${result.backup}. Without it (and the passphrase, if any) the wallet cannot be recovered.`);
    });

  hd.command("import")
    .description(`Recover a wallet from its BIP39 recovery phrase (12 or 24 English words) and, if it had one, its passphrase ${UI.maturity("experimental")}`)
    .requiredOption("--name <name>", "Wallet name: 1 to 64 letters, digits, _ and -")
    .option("--network <network>", "Network the wallet is declared on (as for create). Mainnet is refused: MAINNET_SIGNING_DISABLED, nothing is read or written")
    .option("--mnemonic-env <env>", "Read the recovery phrase from this environment variable")
    .option("--mnemonic-stdin", "Read the recovery phrase from stdin (then the password must come from --password-env)", false)
    .option("--password-env <env>", PASSWORD_ENV)
    .option("--password-stdin", PASSWORD_STDIN, false)
    .option("--passphrase-env <env>", PASSPHRASE_ENV)
    .option("--json", JSON_OPT, false)
    .action(async (o: SecretOptions & { name: string; network?: string; mnemonicEnv?: string; mnemonicStdin?: boolean }) => {
      const { root, config } = await workspace();
      const { refuseMainnetSigning } = await import("../mainnet-guard.js");
      refuseMainnetSigning(config, [o.network ?? (await walletNetworkFor(config, undefined)).name], "wallet hd import: no mainnet key is made while mainnet is locked down");
      const net = await walletNetworkFor(config, o.network);
      if (o.mnemonicStdin && o.passwordStdin) {
        throw usage("HD_WALLET_STDIN_CONFLICT", "Only one secret can come from stdin: pass the phrase or the password through an environment variable.");
      }
      let phrase: string | undefined;
      if (o.mnemonicEnv) phrase = process.env[o.mnemonicEnv] || undefined;
      else if (o.mnemonicStdin) phrase = (await readStdin()) || undefined;
      if (!phrase) {
        throw usage(
          "HD_WALLET_MNEMONIC_REQUIRED",
          o.mnemonicEnv ? `The environment variable ${o.mnemonicEnv} is not set or is empty.` : "The recovery phrase is required: pass it with --mnemonic-env <VAR> or --mnemonic-stdin (never as an argument)."
        );
      }
      const pw = await password(o, `wallet ${o.name}`);
      const pp = passphrase(o);
      const m = await manager(root);
      const w = await m.importMnemonic({ label: o.name, network: net.declared, mnemonic: phrase, password: pw!, ...(pp !== undefined ? { passphrase: pp } : {}) });
      const result = { ...publicView(w), firstReceiveAddress: m.watch(w.walletId).address("receive", 0, w.network) };
      if (o.json) return getOutput().writeJson(result);
      getOutput().writeLine(`HD wallet '${w.label}' recovered on ${w.network}: id ${w.walletId}, account 0 public key ${w.accounts[0]?.xpub}.`);
      getOutput().writeLine(`  first receive address: ${result.firstReceiveAddress}`);
      getOutput().writeLine(`  'hardkas wallet hd balance ${w.label}' scans its addresses on the node.`);
    });

  hd.command("import-watch-only")
    .description(`Add a watch-only wallet from an account's extended public key (kpub/ktub of m/44'/111111'/<account>'): addresses and balance, no keys, nothing to sign with ${UI.maturity("experimental")}`)
    .requiredOption("--name <name>", "Wallet name: 1 to 64 letters, digits, _ and -")
    .requiredOption("--xpub <kpub>", "The account-level extended public key (a master key is refused: HD_WALLET_XPUB_INVALID)")
    .option("--network <network>", "Network the wallet is declared on (as for create). Mainnet is refused: MAINNET_CONNECTION_DISABLED")
    .option("--json", JSON_OPT, false)
    .action(async (o: { name: string; xpub: string; network?: string; json?: boolean }) => {
      const { root, config } = await workspace();
      const { refuseMainnetConnection } = await import("../mainnet-guard.js");
      refuseMainnetConnection(config, [o.network ?? (await walletNetworkFor(config, undefined)).name], "wallet hd import-watch-only: a mainnet wallet would only read mainnet");
      const net = await walletNetworkFor(config, o.network);
      const w = await (await manager(root)).importWatchOnly({ label: o.name, network: net.declared, xpub: o.xpub });
      if (o.json) return getOutput().writeJson(publicView(w));
      getOutput().writeLine(`Watch-only wallet '${w.label}' added on ${w.network} (account ${w.accounts[0]?.index}): it can show addresses and balance, and cannot sign.`);
    });

  hd.command("list")
    .description(`List the workspace's HD wallets (public header only; nothing is decrypted) ${UI.maturity("experimental")}`)
    .option("--json", JSON_OPT, false)
    .action(async (o: { json?: boolean }) => {
      const { root } = await workspace();
      const list = (await manager(root)).list().map(publicView);
      if (o.json) return getOutput().writeJson({ wallets: list });
      if (list.length === 0) return getOutput().writeLine("No HD wallets in this workspace ('hardkas wallet hd create --name <name>' makes one).");
      for (const w of list) {
        const a = w.accounts[0];
        getOutput().writeLine(`${w.name.padEnd(16)} ${w.network.padEnd(12)} ${w.kind.padEnd(10)} accounts ${w.accounts.length}  next receive ${a?.nextReceive ?? 0}  ${w.walletId}`);
      }
    });

  hd.command("address <wallet>")
    .description(`Show a receive (or --change) address. Without --index: the next unused one, and the wallet's index advances. An HD wallet is opened with its password first, so the address comes from its authenticated keys ${UI.maturity("experimental")}`)
    .option("--change", "A change address instead of a receive address", false)
    .option("--index <n>", "This address index (the wallet's index does not move)")
    .option("--account <n>", "Account index (default 0)")
    .option("--password-env <env>", PASSWORD_ENV)
    .option("--password-stdin", PASSWORD_STDIN, false)
    .option("--passphrase-env <env>", PASSPHRASE_ENV)
    .option("--json", JSON_OPT, false)
    .action(async (ref: string, o: SecretOptions & { change?: boolean; index?: string; account?: string }) => {
      const { root } = await workspace();
      const m = await manager(root);
      const described = m.describe(ref);
      const watchOnly = described.kind === "watch-only";
      const pw = watchOnly ? undefined : await password(o, `wallet ${described.label}`);
      const pp = passphrase(o);
      const index = nonNegativeInt(o.index, "--index");
      const account = nonNegativeInt(o.account, "--account");
      const req = {
        ...(account !== undefined ? { account } : {}),
        ...(index !== undefined ? { index } : {}),
        ...(pw !== undefined ? { password: pw } : {}),
        ...(pp !== undefined ? { passphrase: pp } : {})
      };
      const a = o.change ? await m.changeAddress(ref, req) : await m.receiveAddress(ref, req);
      if (o.json) return getOutput().writeJson(a);
      getOutput().writeLine(a.address);
      getOutput().writeLine(`  ${a.chain} ${a.index} of account ${a.account} (${a.path}) of '${a.label}' on ${a.network}${a.verified ? "" : " — watch-only: from the public key as written in the wallet file, not authenticated"}`);
    });

  hd.command("balance <wallet>")
    .description(`Scan the wallet's receive and change addresses on the node (gap limit) and show what they hold: every address the wallet's index handed out (zero where emptied) and any funded one past it. Mainnet is refused: MAINNET_CONNECTION_DISABLED ${UI.maturity("experimental")}`)
    .option("--network <network>", "The workspace network to read (default: the workspace's): it must be the wallet's")
    .option("--gap-limit <n>", "Consecutive unused addresses per chain before the scan stops (default 20)")
    .option("--account <n>", "Account index (default 0)")
    .option("--password-env <env>", `${PASSWORD_ENV} (optional: the scan then uses the authenticated keys; without it the result says verified: false)`)
    .option("--password-stdin", PASSWORD_STDIN, false)
    .option("--passphrase-env <env>", PASSPHRASE_ENV)
    .option("--json", JSON_OPT, false)
    .action(async (ref: string, o: SecretOptions & { network?: string; gapLimit?: string; account?: string }) => {
      const { root, config } = await workspace();
      const m = await manager(root);
      const described = m.describe(ref);
      const { refuseMainnetConnection } = await import("../mainnet-guard.js");
      refuseMainnetConnection(config, [o.network, described.network], "wallet hd balance", true);
      const gapLimit = nonNegativeInt(o.gapLimit, "--gap-limit");
      const account = nonNegativeInt(o.account, "--account");
      const pw = await password(o, `wallet ${described.label}`, false);
      const pp = passphrase(o);
      const { withSdk } = await import("../runners/with-sdk.js");
      const scan = await withSdk({ cwd: root, ...(o.network ? { network: o.network } : {}) }, async (sdk) => {
        const { HardkasHdWallets } = await import("@hardkas/sdk");
        return new HardkasHdWallets(sdk).scan(ref, {
          ...(gapLimit !== undefined ? { gapLimit } : {}),
          ...(account !== undefined ? { account } : {}),
          ...(pw !== undefined ? { password: pw } : {}),
          ...(pp !== undefined ? { passphrase: pp } : {})
        });
      });
      if (o.json) return getOutput().writeJson(scan);
      const { formatSompiToKas: formatSompi } = await import("@hardkas/core");
      // BETA-FIX W2: `used` lists every address the local index handed out (zero where emptied), not only the funded ones
      const funded = scan.used.filter((u) => u.utxoCount > 0).length;
      getOutput().writeLine(
        `'${scan.label}' on ${scan.network}, account ${scan.account}: ${formatSompi(scan.totalSompi)} KAS in ${scan.utxoCount} UTXO(s) on ${funded} address(es); ${scan.used.length} used address(es)${scan.verified ? "" : " (addresses from the wallet file's public key, not authenticated: pass the password to check it)"}`
      );
      for (const u of scan.used) {
        getOutput().writeLine(`  ${u.path.padEnd(24)} ${u.address}  ${formatSompi(u.balanceSompi)} KAS (${u.utxoCount} UTXO)${u.handedOut ? "" : " (found by the scan, past the local index)"}`);
      }
      getOutput().writeLine(`  scanned ${scan.scanned.receive} receive + ${scan.scanned.change} change addresses (gap limit ${scan.gapLimit}); next unused: receive ${scan.nextReceive}, change ${scan.nextChange}`);
    });

  hd.command("send <wallet>")
    .description(
      `Pay from the wallet: one plan over the UTXOs of all its addresses (the payment planner), change to its next unused change address, each input signed with its own address's key, sent through the same send path as 'tx send' (synced node, one submission per txId, records). Mainnet is refused: MAINNET_BROADCAST_DISABLED, before the password is read; off simnet it needs --yes, as 'tx send' ${UI.maturity("experimental")}`
    )
    .requiredOption("--to <address>", "Recipient: a Kaspa address or a workspace account name")
    .requiredOption("--amount <kas>", "Amount in KAS (decimal string)")
    .option("--network <network>", "The workspace network to send on (default: the workspace's): it must be the wallet's")
    .option("--fee-rate <sompiPerGram>", "Fee rate in sompi per gram (default: the node's normal estimate)")
    .option("--max-fee-sompi <sompi>", "The most this payment may pay in fees, in sompi (the workspace's or HardKAS's default limit applies anyway)")
    .option("--gap-limit <n>", "Consecutive unused addresses per chain before the scan stops (default 20)")
    .option("--account <n>", "Account index (default 0)")
    .option("--preflight", "Check every input and signature against the node right before the broadcast (as 'tx send --preflight')", false)
    .option("--yes", broadcastYesHelp("the payment"), false)
    .option("--password-env <env>", PASSWORD_ENV)
    .option("--password-stdin", PASSWORD_STDIN, false)
    .option("--passphrase-env <env>", PASSPHRASE_ENV)
    .option("--json", JSON_OPT, false)
    .action(async (ref: string, o: SecretOptions & { to: string; amount: string; network?: string; feeRate?: string; maxFeeSompi?: string; gapLimit?: string; account?: string; preflight?: boolean; yes?: boolean }) => {
      const { root, config } = await workspace();
      const m = await manager(root);
      const described = m.describe(ref);
      const { refuseMainnetBroadcast } = await import("../mainnet-guard.js");
      refuseMainnetBroadcast(config, [o.network, described.network], "wallet hd send", true);
      // BETA-FIX W2 · AUX-11 (tx send's rule): off the simulator and simnet nothing is read, signed or sent without --yes.
      // The network is the one asked for (as its config entry declares it), else the wallet's own (it must be the same).
      {
        const { declaredNetworkIdOf } = await import("@hardkas/core");
        requireBroadcastConfirmation({
          command: "wallet hd send",
          network: String(o.network !== undefined ? (declaredNetworkIdOf(config, o.network) ?? o.network) : described.network),
          yes: o.yes,
          json: o.json,
          nothingDone: "Nothing was read, signed, broadcast or written (the wallet was not opened)."
        });
      }
      const gapLimit = nonNegativeInt(o.gapLimit, "--gap-limit");
      const account = nonNegativeInt(o.account, "--account");
      if (o.feeRate !== undefined && !/^\d+$/.test(o.feeRate)) throw usage("INVALID_FEE_RATE", `--fee-rate takes a positive integer of sompi per gram (got ${JSON.stringify(o.feeRate)}).`);
      if (described.kind === "watch-only") throw usage("HD_WALLET_WATCH_ONLY", `Wallet '${described.label}' is watch-only: it holds no keys and cannot send.`);
      const pw = await password(o, `wallet ${described.label}`);
      const pp = passphrase(o);
      const { withSdk } = await import("../runners/with-sdk.js");
      const out = await withSdk({ cwd: root, ...(o.network ? { network: o.network } : {}) }, async (sdk) => {
        const { HardkasHdWallets } = await import("@hardkas/sdk");
        return new HardkasHdWallets(sdk).send(ref, {
          to: o.to,
          amount: o.amount,
          password: pw!,
          ...(pp !== undefined ? { passphrase: pp } : {}),
          ...(gapLimit !== undefined ? { gapLimit } : {}),
          ...(account !== undefined ? { account } : {}),
          ...(o.feeRate !== undefined ? { feeRate: BigInt(o.feeRate) } : {}),
          ...(o.maxFeeSompi !== undefined ? { maxFeeSompi: o.maxFeeSompi } : {}),
          send: { ...(o.preflight ? { preflight: true } : {}) }
        });
      });
      const result = {
        txId: out.signed.txId,
        submitted: out.sent?.submitted === true,
        alreadySubmitted: out.sent?.alreadySubmitted === true,
        planId: (out.plan as any).contentHash,
        signedId: (out.signed as any).contentHash,
        submission: (out.sent as any)?.artifactId,
        to: (out.plan as any).to?.address,
        amountSompi: (out.plan as any).amountSompi,
        feeSompi: (out.plan as any).estimatedFeeSompi,
        inputs: out.inputs,
        change: out.change,
        ...(out.sent?.rejection ? { rejection: out.sent.rejection } : {})
      };
      if (o.json) return getOutput().writeJson(result);
      const { formatSompiToKas: formatSompi } = await import("@hardkas/core");
      getOutput().writeLine(`${result.submitted ? "Sent" : result.alreadySubmitted ? "Already submitted" : "Not sent"}: ${result.txId}`);
      getOutput().writeLine(`  ${formatSompi(BigInt(result.amountSompi))} KAS to ${result.to}, fee ${formatSompi(BigInt(result.feeSompi))} KAS`);
      for (const i of out.inputs) getOutput().writeLine(`  input ${i.index}: ${i.outpoint} (${i.path})`);
      if (out.change.amountSompi > 0n) getOutput().writeLine(`  change ${formatSompi(out.change.amountSompi)} KAS to ${out.change.address} (${out.change.path})`);
      getOutput().writeLine(`  'hardkas tx status ${result.txId}' follows it.`);
    });

  hd.command("reveal <wallet>")
    .description(`Print the wallet's recovery phrase (SECRET: anyone who reads it owns the funds). Needs the password and --yes ${UI.maturity("experimental")}`)
    .option("--yes", "Confirm that the recovery phrase is printed to this terminal (or to stdout with --json)", false)
    .option("--password-env <env>", PASSWORD_ENV)
    .option("--password-stdin", PASSWORD_STDIN, false)
    .option("--json", JSON_OPT, false)
    .action(async (ref: string, o: SecretOptions & { yes?: boolean }) => {
      const { root } = await workspace();
      const m = await manager(root);
      const described = m.describe(ref);
      if (!o.yes) {
        throw usage("HD_WALLET_REVEAL_CONFIRMATION_REQUIRED", `'wallet hd reveal' prints the recovery phrase of '${described.label}': pass --yes to confirm. Nothing was decrypted.`);
      }
      const pw = await password(o, `wallet ${described.label}`);
      const phrase = await m.revealMnemonic(ref, { password: pw! });
      if (o.json) return getOutput().writeJson({ walletId: described.walletId, name: described.label, network: described.network, passphraseRequired: described.passphraseRequired, mnemonic: phrase });
      getOutput().writeLine(phrase);
      getOutput().warn(
        `This is the recovery phrase of '${described.label}'${described.passphraseRequired ? " (the wallet also needs its BIP39 passphrase, which HardKAS never stores)" : ""}. Write it down offline; never paste it into a chat, a ticket or a file you share.`
      );
    });

  hd.command("change-password <wallet>")
    .description(`Re-encrypt the wallet under a new password (the recovery phrase and the addresses do not change) ${UI.maturity("experimental")}`)
    .option("--password-env <env>", "Read the CURRENT wallet password from this environment variable")
    .option("--password-stdin", "Read the CURRENT wallet password from stdin", false)
    .requiredOption("--new-password-env <env>", "Read the NEW wallet password (at least 8 characters) from this environment variable")
    .option("--json", JSON_OPT, false)
    .action(async (ref: string, o: SecretOptions & { newPasswordEnv: string }) => {
      const { root } = await workspace();
      const m = await manager(root);
      const described = m.describe(ref);
      const newPassword = process.env[o.newPasswordEnv];
      if (!newPassword) throw usage("KEYSTORE_PASSWORD_REQUIRED", `The environment variable ${o.newPasswordEnv} named by --new-password-env is not set or is empty.`);
      const old = await password(o, `current password of ${described.label}`);
      const w = await m.changePassword(ref, { oldPassword: old!, newPassword });
      if (o.json) return getOutput().writeJson({ ...publicView(w), passwordChanged: true });
      getOutput().writeLine(`The password of '${w.label}' was changed; its recovery phrase and addresses are unchanged.`);
    });
}
