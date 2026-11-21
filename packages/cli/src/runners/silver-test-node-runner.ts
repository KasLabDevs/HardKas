import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { getOutput } from "../output.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { recordModeOf } from "./l1-node-target.js";
import { writeSilverRecord } from "./silver-records.js";
import { exactValuesText, readExactTestsJson } from "../commands/silver-dev-framework.js";
import type { silverOnChainKit } from "../commands/silver.js";

/**
 * R4-S · `hardkas silver test <record> --tests <file> --on-node`: the runner's test cases as the REAL transactions they
 * describe, judged by a node. For every case @hardkas/core planSilverNodeTests decides whether its scenario is a
 * transaction a node can see; each one that is gets its own coin of the case's utxo_value at the contract's P2SH (one
 * output per case of ONE payment of the SDK's payment path from --from), then the spend through the case's entry, arguments (a `{"signature":
 * "<account>"}` signed by that account over the real transaction), outputs, sequence and lock time: transaction v0 (the
 * certified multi-party spend of @hardkas/accounts, wrapped in a plan of this workspace) or v1 (the SDK's engine). Every
 * transaction goes out through sdk.tx.send (node identity, synced node, the plan check and fee limit, one submission per
 * txId, its record). The node's answer is the case's verdict (CONSENSUS_SIMNET on simnet, CONSENSUS_NODE elsewhere), next
 * to the expected one; a case no node transaction reproduces is NOT_REPRODUCIBLE, never a pass. Nothing runs the
 * SilverScript runner.
 */

type Kit = typeof silverOnChainKit;

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const out = () => getOutput();
const fail = (code: string, message: string, exitCode = HardkasExitCode.RUNTIME_FAILURE): never => {
  throw new HardkasCliError(code, message, { exitCode });
};

/** The record of a node run (registered in @hardkas/core HardkasSchemas.SilverNodeTestV1). */
const RECORD_PREFIX = "silverNodeTest";
const NODE_SCOPE =
  "Each case's verdict is a Kaspa node's answer to the real transaction the case describes (its own coin at the " +
  "contract's P2SH, spent through the entry with the case's arguments, outputs, sequence and lock time), sent by HardKAS's " +
  "send machinery. A case no node transaction reproduces is NOT_REPRODUCIBLE: it has no verdict. One node's view, at one time.";

/** Node rejection classes about the coin, not the case: no verdict either way. */
const COIN_CLASSES = new Set(["INPUT_ALREADY_SPENT", "ORPHAN_REJECTED"]);
/** Node rejection classes about the transaction's shape or timing, not the contract's script. */
const OUTSIDE_SCRIPT_CLASSES = new Set([
  "FEE_BELOW_NODE_MINIMUM",
  "STORAGE_MASS_ABOVE_LIMIT",
  "LOCK_TIME_REJECTED",
  "SEQUENCE_LOCK_REJECTED",
  "TX_VERSION_RULE_REJECTED",
  "COVENANT_RULE_REJECTED"
]);

export const SILVER_TEST_ON_NODE_HELP =
  "Judge every case on a Kaspa node instead of the SilverScript runner: each case HardKAS can reproduce gets its own coin of the case's utxo_value at the contract's P2SH (paid from --from), then the real spend the case describes (entry, arguments, signatures of the named accounts, outputs, sequence, lock time; transaction v0, or v1 through the SDK's engine when the case's tx.version is 1 or absent), sent through HardKAS's send machinery. The node's answer is the verdict (CONSENSUS_SIMNET on simnet), next to the expected one; a case no real transaction reproduces is reported NOT_REPRODUCIBLE, never a pass. Needs a workspace that runs the network as a kaspa-l1 node";
export const SILVER_TEST_NETWORK_HELP =
  "With --on-node: the network (default: the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config";
export const SILVER_TEST_URL_HELP =
  "With --on-node: the node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet)";
export const SILVER_TEST_FROM_HELP =
  "With --on-node: the account that funds one coin per reproducible case at the contract's P2SH, all in ONE funding transaction (one output per case; local key)";
export const SILVER_TEST_TIMEOUT_HELP =
  "With --on-node: seconds to wait for each funding coin, each relative lock and each accepted spend to show in the node's UTXO index (default 120)";
export const SILVER_TEST_YES_HELP =
  "With --on-node: confirm the broadcasts (the funding and each case's spend). Required unless the network is simnet: without it the run is refused (NOT EXECUTED, exit 3, TX_SEND_CONFIRMATION_REQUIRED) and nothing is sent or written";

/** Options only the node mode takes: refused without --on-node (they would have no effect). */
export const SILVER_TEST_NODE_ONLY_OPTIONS = [
  ["network", "--network"],
  ["url", "--url"],
  ["from", "--from"],
  ["timeout", "--timeout"],
  ["yes", "--yes"]
] as const;

/** Usage checks of `silver test` that come before anything is read: the node-only options need --on-node, and the reverse. */
export function assertSilverTestModeOptions(opts: Record<string, unknown>): void {
  if (opts.onNode) {
    const runnerOnly = [opts.runner !== undefined ? "--runner" : undefined, opts.allowUnverifiedRunner ? "--allow-unverified-runner" : undefined].filter(Boolean);
    if (runnerOnly.length > 0) {
      fail(
        "SILVER_TEST_OPTION_CONFLICT",
        `${runnerOnly.join(" and ")} select the SilverScript runner; --on-node runs every case on a node and none on the runner. Leave ${runnerOnly.length > 1 ? "them" : "it"} out, or run without --on-node`,
        HardkasExitCode.USAGE_ERROR
      );
    }
    return;
  }
  const given = SILVER_TEST_NODE_ONLY_OPTIONS.filter(([key]) => opts[key] !== undefined).map(([, flag]) => flag);
  if (given.length > 0) {
    fail("SILVER_TEST_OPTION_NEEDS_ON_NODE", `${given.join(", ")} appl${given.length > 1 ? "y" : "ies"} to --on-node only (the runner runs no transaction on any node)`, HardkasExitCode.USAGE_ERROR);
  }
}

function timeoutOption(value: unknown): number {
  if (value === undefined) return 120;
  const s = String(value);
  const n = /^\d{1,5}$/.test(s) ? Number(s) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 3600) fail("SILVER_OPTION_INVALID", `--timeout '${s}' is not a number of seconds from 1 to 3600`, HardkasExitCode.USAGE_ERROR);
  return n;
}

function readFileOrFail(file: string, what: string): Buffer {
  try {
    return fs.readFileSync(path.resolve(file));
  } catch (e: any) {
    return fail("SILVER_FILE_NOT_FOUND", `${what} ${file}: ${e?.code ?? e?.message}`, HardkasExitCode.USAGE_ERROR);
  }
}

const relativePath = (file: string) => path.relative(process.cwd(), path.resolve(file)).replace(/\\/g, "/");
const messageOf = (e: unknown) => String((e as { message?: unknown } | null | undefined)?.message ?? e);
const codeOf = (e: unknown) => {
  const c = (e as { code?: unknown } | null | undefined)?.code;
  return typeof c === "string" ? c : undefined;
};
const bigintText = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
const short = (s: string, n = 400) => (s.length > n ? `${s.slice(0, n)}…` : s);

type Outcome = "PASS" | "FAIL" | "INCONCLUSIVE" | "NOT_REPRODUCIBLE";

interface CaseRun {
  readonly name: string;
  readonly function: string;
  readonly expect: "pass" | "fail";
  outcome?: Outcome;
  txVersion?: 0 | 1;
  verdictLevel?: "CONSENSUS_SIMNET" | "CONSENSUS_NODE" | null;
  nodeVerdict?: "ACCEPTED" | "REJECTED" | null;
  txId?: string;
  coin?: { outpoint: { transactionId: string; index: number }; valueSompi: string; fundingTxId: string };
  effect?: "SPENT_IN_CHAIN" | "NOT_OBSERVED";
  nodeReason?: string;
  nodeReasonCode?: string;
  notReproducible?: { code: string; reason: string; hardkasCode?: string };
  inconclusive?: string;
  notes: string[];
}

/** One send through HardKAS's send machinery, as a verdict, a refusal before the broadcast, or a stop of the run. */
async function sendForVerdict(
  send: () => Promise<any>,
  expectedTxId: string,
  label: string
): Promise<{ kind: "accepted"; txId: string } | { kind: "rejected"; txId: string; message: string } | { kind: "refused"; code: string; message: string }> {
  const { submitOutcomeOf } = await import("@hardkas/artifacts");
  const { isNodeNetworkIdentityError, isRpcRequestNotSentError } = await import("@hardkas/kaspa-rpc");
  let r: any;
  try {
    r = await send();
  } catch (e: unknown) {
    const code = codeOf(e);
    const message = messageOf(e);
    if (code === "SUBMIT_NOT_SENT" || isRpcRequestNotSentError(e) || isNodeNetworkIdentityError(e)) {
      return fail("SILVER_SUBMIT_NOT_SENT", `${label}: nothing was sent (${message}); the run stopped without a verdict for this case`);
    }
    // a typed refusal of the send machinery before the broadcast says so ("Nothing was sent or recorded")
    if (code !== undefined && code !== "EVENT_LEDGER_APPEND_FAILED" && code !== "TX_ALREADY_SUBMITTED" && /nothing was sent/i.test(message)) {
      return { kind: "refused", code, message };
    }
    // anything else: HardKAS cannot tell from the error whether the transaction left (fail closed: never a verdict)
    return fail(
      "SILVER_SUBMIT_OUTCOME_UNKNOWN",
      `${label}: ${code ? `${code}: ` : ""}${message}. This error does not say whether transaction ${expectedTxId} left: it was not re-submitted, and the run stopped without a verdict.`
    );
  }
  const named = typeof r?.txId === "string" ? r.txId.toLowerCase() : undefined;
  if ((r?.submitted === true || r?.alreadySubmitted === true) && named === expectedTxId) return { kind: "accepted", txId: expectedTxId };
  const result = r?.submission?.submitResult ?? {};
  if (submitOutcomeOf(result) === "rejected") return { kind: "rejected", txId: expectedTxId, message: String(result.error ?? "the node refused the transaction") };
  return fail(
    "SILVER_SUBMIT_OUTCOME_UNKNOWN",
    `${label}: the outcome is unknown (${String(result.error ?? "no answer naming the transaction")}); the node may have transaction ${expectedTxId}. It was not re-submitted, and the run stopped without a verdict.`
  );
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** The virtual DAA score the node reports now. */
async function virtualDaaOf(rpc: any): Promise<bigint> {
  return BigInt((await rpc.getBlockDagInfo()).virtualDaaScore);
}

/** Whether `outpoint` is listed unspent at `address` by the node's UTXO index. */
async function isListed(rpc: any, address: string, outpoint: { transactionId: string; index: number }): Promise<boolean> {
  const listed: any[] = await rpc.getUtxosByAddress(address);
  return listed.some((u: any) => String(u?.outpoint?.transactionId).toLowerCase() === outpoint.transactionId && Number(u?.outpoint?.index) === outpoint.index);
}

/**
 * The run. `kit` is `silver`'s on-chain plumbing (silverOnChainKit): the same network target (mainnet refused first,
 * public networks behind the payments' opt-in, endpoint authority), records, workspace check, keys before any node, node
 * identity proof and engine context as `silver deploy | spend`.
 */
export async function runSilverTestOnNode(file: string, opts: any, kit: Kit): Promise<void> {
  // usage before anything is read; then the network (mainnet refused, public network opt-in, endpoint) before any record,
  // key or node
  assertSilverTestModeOptions(opts);
  const timeoutSec = timeoutOption(opts.timeout);
  const target = await kit.silverTarget({ network: opts.network, url: opts.url });
  // BETA-FIX W2 · AUX-11 (tx send's rule): off simnet nothing is read, funded or sent without --yes
  {
    const { requireBroadcastConfirmation } = await import("../broadcast-confirmation.js");
    requireBroadcastConfirmation({
      command: "silver test --on-node",
      network: target.network,
      yes: opts.yes === true,
      json: opts.json === true,
      nothingDone: "Nothing was read, funded, signed, broadcast or written; no key was read and no node was contacted."
    });
  }
  if (typeof opts.from !== "string" || opts.from.trim() === "") {
    fail("SILVER_TEST_FUNDER_REQUIRED", "--on-node funds one coin per reproducible case at the contract's P2SH: name the funding account with --from <account>", HardkasExitCode.USAGE_ERROR);
  }
  const core = await import("@hardkas/core");
  const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
  const S = await kit.schemas();
  const compileRecord = await kit.readRecord(file, S.SilverCompileV1);
  kit.assertCompiledForCanonical(compileRecord, file, target.network);
  const artifact = await kit.loadCompiled(compileRecord);
  if (sha256(compileRecord.source.text) !== compileRecord.provenance.sourceSha256) {
    fail("SILVER_RECORD_TAMPERED", "compile record source does not match its provenance", HardkasExitCode.CORRUPTION_DETECTED);
  }
  const ctorCanonical = opts.args
    ? core.serializeSilArtifactValues(core.parseSilArtifactValuesJson(exactValuesText(core.stripBom(readFileOrFail(opts.args, "constructor-args file").toString("utf8")), "--args")))
    : "[]";
  if (sha256(ctorCanonical) !== compileRecord.provenance.constructorArgsSha256) {
    fail("SILVER_CONSTRUCTOR_ARGS_MISMATCH", "these constructor arguments are not the ones the record was compiled with (pass them with --args)", HardkasExitCode.USAGE_ERROR);
  }
  const testsBytes = readFileOrFail(opts.tests, "test file");
  let tests: unknown;
  try {
    tests = readExactTestsJson(testsBytes.toString("utf8"), "--tests");
  } catch (e) {
    if (e instanceof HardkasCliError) throw e;
    fail("SILVER_TEST_FILE_INVALID", `${opts.tests} is not JSON`, HardkasExitCode.USAGE_ERROR);
  }
  let plan!: ReturnType<typeof core.planSilverNodeTests>;
  try {
    plan = core.planSilverNodeTests({ artifact, contractName: opts.contract, tests, networkId: target.network });
  } catch (e: any) {
    if (typeof e?.code === "string" && /^SILVER_(TEST_|CONTRACT_)/.test(e.code)) fail(e.code, String(e.message).replace(`${e.code}: `, ""), HardkasExitCode.USAGE_ERROR);
    throw e;
  }
  const name = plan.contract;
  const { contract } = core.getSilContract(artifact, name);
  const bytecode = core.silContractBytecodeHex(contract);
  // G2: a redeem script above the mempool's signature-operation limit can never be spent through a standard node
  await kit.assertSigOpsStandard(name, bytecode);

  const runs: CaseRun[] = plan.cases.map((c) => ({
    name: c.name,
    function: c.function,
    expect: c.expect,
    notes: c.reproducible ? [...c.notes] : [],
    ...(c.reproducible ? { txVersion: c.txVersion } : {}),
    ...(c.reproducible ? {} : { outcome: "NOT_REPRODUCIBLE" as const, verdictLevel: null, nodeVerdict: null, notReproducible: { code: c.code, reason: c.reason } })
  }));
  const refuse = (run: CaseRun, e: unknown, before: string) => {
    const code = codeOf(e) ?? "UNCODED";
    run.outcome = "NOT_REPRODUCIBLE";
    run.verdictLevel = null;
    run.nodeVerdict = null;
    run.notReproducible = { code: "HARDKAS_REFUSED", hardkasCode: code, reason: `HardKAS refused this transaction ${before} (${code}: ${short(messageOf(e).replace(`${code}: `, ""), 300)})` };
  };

  // the workspace runs this network as a kaspa-l1 node (the SDK's send machinery and engine run on it); keys before any node
  const workspaceRoot = await kit.assertCanonicalWorkspace(target);
  const keys = { ...kit.keySource(opts), network: target.network };
  await kit.accountKey(String(opts.from), keys, target.network);
  const signerKeys = new Map<string, { privateKey: string; address: string }>();
  for (const c of plan.cases) {
    if (!c.reproducible) continue;
    for (const s of c.signers) if (!signerKeys.has(s)) signerKeys.set(s, await kit.accountKey(s, keys, target.network));
  }

  // transaction v0: built once on a placeholder coin before anything is funded (the fee floor, the masses, the ABI
  // encoding, the lock time and the fee limit do not depend on the outpoint): a refusal costs no coin
  const accounts = await import("@hardkas/accounts");
  const txb = await import("@hardkas/tx-builder");
  const { loadHardkasConfig } = await import("@hardkas/config");
  const { config } = await loadHardkasConfig({ workspaceRoot });
  const lockTimeOf = (lt: bigint) => (lt === 0n ? undefined : lt < txb.LOCK_TIME_THRESHOLD ? { daaScore: lt.toString() } : { timestampMs: lt.toString() });
  const draftArgsOf = (c: any) => c.args.map((a: any) => (a.kind === "signer" ? { kind: "signer", signer: a.signer } : a));
  const prepareV0 = (c: any, utxo: any) =>
    accounts.prepareSilverSpend({
      artifact,
      contractName: name,
      entry: c.function,
      args: draftArgsOf(c),
      utxo,
      outputs: c.outputs.map((o: any) => ({ amountSompi: o.amountSompi, scriptPublicKey: o.scriptPublicKey })),
      networkId: target.network,
      sequence: c.sequence,
      sigOpCount: c.sigOpCount,
      ...(lockTimeOf(c.lockTime) ? { lockTime: lockTimeOf(c.lockTime) as any } : {})
    });
  const runnable: Array<{ c: any; run: CaseRun }> = [];
  plan.cases.forEach((c, i) => {
    if (!c.reproducible) return;
    const run = runs[i]!;
    if (c.txVersion === 0) {
      try {
        prepareV0(c, { outpoint: { transactionId: "00".repeat(32), index: 0 }, amountSompi: c.utxoValueSompi, scriptPublicKey: plan.lockingScript, blockDaaScore: 0n, isCoinbase: false });
        const fee = c.utxoValueSompi - c.outputs.reduce((s: bigint, o: any) => s + o.amountSompi, 0n);
        txb.assertFeeWithinLimitInForce(fee, txb.feeLimitInForce({ config, network: target.network }), "send", target.network);
      } catch (e) {
        refuse(run, e, "before anything was funded");
        return;
      }
    }
    runnable.push({ c, run });
  });

  // transaction v1: the engine reproduces the contract with the pinned silverc from these constructor arguments
  const anyV1 = runnable.some(({ c }) => c.txVersion === 1);
  const v1ConstructorArgs = anyV1 ? await kit.engineConstructorArgs(compileRecord, name, opts.args) : undefined;

  const network = target.network;
  const verdictLevel = network === "simnet" ? ("CONSENSUS_SIMNET" as const) : ("CONSENSUS_NODE" as const);
  let identity: any;
  let unspentLeft: string[] = [];
  if (runnable.length > 0) {
    const node = await kit.silverNode(target, "silver test --on-node");
    identity = node.identity;
    const rpc: any = node.rpc;
    const engine = await import("./silver-onchain-runner.js");
    let sdk: any;
    try {
      sdk = await engine.openSilverSdk(workspaceRoot, rpc, target);
    } catch (e) {
      await rpc.close?.();
      throw e;
    }
    try {
      // 1 · one coin per case, ALL in ONE funding transaction: the SDK's multi-output payment (`tx.plan({ outputs })`: one
      // output per case, in case order, to the contract's P2SH; one change output, one fee, the fee limit and every other
      // payment guard), signed and sent once; case i's coin is (fundingTxId, i). BETA-FIX W2: one funding planned per case
      // right after the previous broadcast reused the input that broadcast had spent (a node's UTXO index lags its
      // mempool; on Testnet-10 the funder's one UTXO was planned twice: COVENANT_UTXO_UNVERIFIED, the run stopped).
      //   BETA-FIX (TN10 rehearsal, 21-nov): several small coins in one transaction can exceed the standard storage mass
      //   (KIP-9: it grows with every small output) where each alone fits — 0.5 + 0.2 + 0.2 + 0.5 TKAS were refused as
      //   OUTPUT_BELOW_STANDARD_AMOUNT. Then the cases are funded in smaller groups (halved until each plans), and a group
      //   is planned only after the node's UTXO index lists the previous group's funding (its coin listed: its inputs gone,
      //   its change there), so no group reuses an input another just spent.
      {
        const tooBigForOneTx = (e: unknown) => /OUTPUT_BELOW_STANDARD_AMOUNT|TOO_MANY_OUTPUTS|storage mass|\bmass\b/i.test(`${(e as any)?.code ?? ""} ${(e as any)?.message ?? ""}`);
        let previousFunding: { transactionId: string; index: number } | undefined;
        const fundGroup = async (group: typeof runnable): Promise<void> => {
          const values: bigint[] = group.map((r) => r.c.utxoValueSompi as bigint);
          if (previousFunding) {
            await kit.waitForUtxo(rpc, plan.address, previousFunding, timeoutSec);
            previousFunding = undefined;
          }
          let p: any;
          try {
            p = await sdk.tx.plan({ from: String(opts.from), outputs: values.map((amount) => ({ to: plan.address, amount })) });
          } catch (e) {
            if (group.length > 1 && tooBigForOneTx(e)) {
              const half = Math.ceil(group.length / 2);
              await fundGroup(group.slice(0, half));
              await fundGroup(group.slice(half));
              return;
            }
            throw e;
          }
          const outputs: any[] = p.outputs ?? [];
          const misplaced = values.findIndex((value, i) => outputs[i]?.address !== plan.address || BigInt(outputs[i]?.amountSompi ?? -1) !== value);
          if (misplaced >= 0) {
            fail(
              "SILVER_TEST_FUNDING_FAILED",
              `${group[misplaced]!.run.name}: the funding plan's output ${misplaced} does not pay ${values[misplaced]} sompi to ${plan.address}. Nothing was signed or sent.`
            );
          }
          const signed: any = await sdk.tx.sign(p, { account: String(opts.from), ...(keys.password !== undefined ? { keystorePassword: keys.password } : {}) });
          const fundingTxId = String(signed.txId).toLowerCase();
          const label = group.length === 1 ? `${group[0]!.run.name}: funding` : `the funding of ${group.length} cases (${group.map((r) => r.run.name).join(", ")})`;
          const sent = await sendForVerdict(() => sdk.tx.send(signed), fundingTxId, label);
          if (sent.kind !== "accepted") {
            fail("SILVER_TEST_FUNDING_FAILED", `${label}: the funding transaction was ${sent.kind === "rejected" ? "refused by the node" : "refused before the broadcast"}: ${short(sent.message)}`);
          }
          group.forEach((r, index) => {
            r.run.coin = { outpoint: { transactionId: fundingTxId, index }, valueSompi: values[index]!.toString(), fundingTxId };
          });
          previousFunding = { transactionId: fundingTxId, index: 0 };
        };
        await fundGroup(runnable);
      }
      // 2 · each coin as the node lists it (accepted by a chain block)
      const coins = new Map<CaseRun, any>();
      for (const r of runnable) coins.set(r.run, await kit.waitForUtxo(rpc, plan.address, r.run.coin!.outpoint, timeoutSec));

      // 3 · the real spends
      const ctx = anyV1
        ? {
            sdk,
            facts: accounts.createWorkspaceV1Facts({ workspaceRoot: sdk.workspace.root, records: [compileRecord] }),
            compileRecords: [compileRecord],
            keys: engine.silverEngineKeys([...signerKeys.entries()].map(([n, k]) => ({ names: [n], ...k })))
          }
        : undefined;
      const accepted: CaseRun[] = [];
      for (const { c, run } of runnable) {
        const utxo = coins.get(run);
        // a relative lock (the input's sequence) counts from the coin's DAA score: wait until the node passes it
        const lock = accounts.relativeLockOf(c.sequence);
        if (lock !== undefined) {
          const unlockAt = BigInt(utxo.blockDaaScore) + lock;
          const deadline = Date.now() + timeoutSec * 1000;
          let now = await virtualDaaOf(rpc);
          while (now < unlockAt && Date.now() < deadline) {
            await sleep(1000);
            now = await virtualDaaOf(rpc);
          }
          if (now < unlockAt) {
            run.outcome = "NOT_REPRODUCIBLE";
            run.verdictLevel = null;
            run.nodeVerdict = null;
            run.notReproducible = {
              code: "SEQUENCE_LOCK_NOT_REACHED",
              reason: `its sequence enables a relative lock of ${lock} DAA from the coin's DAA score ${utxo.blockDaaScore}: spendable from ${unlockAt}, the node was at ${now} after ${timeoutSec}s (sent earlier the node would refuse it for that, not for the contract)`
            };
            continue;
          }
          run.notes.push(`waited for the relative lock: spendable from DAA score ${unlockAt}`);
        }
        let expectedTxId: string;
        let send: () => Promise<any>;
        try {
          if (c.txVersion === 0) {
            const draft = prepareV0(c, utxo);
            const signatures = Object.fromEntries(c.signers.map((s: string) => [s, accounts.signSilverSpend(draft, signerKeys.get(s)!.privateKey)]));
            const finalized = accounts.finalizeSilverSpend(draft, artifact, draftArgsOf(c), signatures);
            const wrapped = await wrapV0Spend(sdk, network, plan.address, draft, finalized);
            expectedTxId = String(finalized.txId).toLowerCase();
            send = () => sdk.tx.send(wrapped.signed);
          } else {
            const ref = kit.engineRecordRef(compileRecord, file, workspaceRoot);
            const contractRef = { compileRecord: ref, contract: name, constructorArgs: v1ConstructorArgs };
            const facts = await ctx!.facts.contract(contractRef as any);
            const computeBudget = txb.proposeComputeBudget({ kind: "p2sh", templateHash: facts.templateHash, entry: c.function })?.budget ?? "estimate";
            const signOptions = { facts: ctx!.facts, compileRecords: ctx!.compileRecords, keys: ctx!.keys };
            const v1Plan = await sdk.covenants.planContractSpend(
              {
                outpoint: run.coin!.outpoint,
                contract: { ...contractRef, entry: c.function, args: c.args.map((a: any) => (a.kind === "signer" ? a : accounts.silToV1Arg(a))) } as any,
                payments: c.outputs.map((o: any) => ({ address: o.address, amountSompi: o.amountSompi })),
                computeBudget,
                sequence: c.sequence,
                ...(lockTimeOf(c.lockTime) ? { lockTime: lockTimeOf(c.lockTime) as any } : {})
              },
              signOptions
            );
            const s = await sdk.covenants.sign(v1Plan, signOptions);
            expectedTxId = String(s.txId).toLowerCase();
            run.notes.push(`v1 input compute budget ${String(v1Plan.inputs?.[0]?.computeBudget)} (${typeof computeBudget === "number" ? "certified for this entry" : "rusty-kaspa's estimate"})`);
            send = () => sdk.covenants.send(s.signed, signOptions);
          }
        } catch (e) {
          if (e instanceof HardkasCliError) throw e;
          if (codeOf(e) === undefined) throw e;
          refuse(run, e, "before it was signed or sent; its coin stays unspent at the contract");
          continue;
        }
        const sent = await sendForVerdict(send, expectedTxId, run.name);
        if (sent.kind === "refused") {
          refuse(run, { code: sent.code, message: sent.message }, "before the broadcast; its coin stays unspent at the contract");
          continue;
        }
        run.txId = expectedTxId;
        run.verdictLevel = verdictLevel;
        if (sent.kind === "accepted") {
          run.nodeVerdict = "ACCEPTED";
          accepted.push(run);
          continue;
        }
        run.nodeVerdict = "REJECTED";
        run.nodeReason = short(sent.message);
        const { classifyNodeRejection } = await import("@hardkas/artifacts");
        const cls = classifyNodeRejection(sent.message).code;
        run.nodeReasonCode = cls;
        if (COIN_CLASSES.has(cls)) {
          run.outcome = "INCONCLUSIVE";
          run.inconclusive = `the node refused it for its coin (${cls}), not for the case: no verdict`;
        } else if (run.expect === "pass") {
          run.outcome = "FAIL";
        } else if (OUTSIDE_SCRIPT_CLASSES.has(cls)) {
          run.outcome = "INCONCLUSIVE";
          run.inconclusive = `the node refused it for a reason outside the contract's script (${cls}): no verdict on the expected failure`;
        } else {
          run.outcome = "PASS";
        }
      }
      // 4 · an accepted spend's effect: its coin no longer listed unspent (spent by a chain block)
      const deadline = Date.now() + timeoutSec * 1000;
      let pending = [...accepted];
      while (pending.length > 0) {
        const still: CaseRun[] = [];
        for (const run of pending) {
          if (await isListed(rpc, plan.address, run.coin!.outpoint)) still.push(run);
          else run.effect = "SPENT_IN_CHAIN";
        }
        pending = still;
        if (pending.length === 0 || Date.now() >= deadline) break;
        await sleep(1000);
      }
      for (const run of accepted) {
        if (run.effect !== "SPENT_IN_CHAIN") {
          run.effect = "NOT_OBSERVED";
          if (run.expect === "pass") {
            run.outcome = "INCONCLUSIVE";
            run.inconclusive = `the node accepted the spend into its mempool, but its coin was still unspent after ${timeoutSec}s (is a miner running?)`;
            continue;
          }
        }
        run.outcome = run.expect === "pass" ? "PASS" : "FAIL";
      }
      unspentLeft = runs.filter((r) => r.coin && r.outcome === "NOT_REPRODUCIBLE").map((r) => `${r.coin!.outpoint.transactionId}:${r.coin!.outpoint.index}`);
    } finally {
      await sdk.close();
      await rpc.close?.();
    }
  }

  const count = (o: Outcome) => runs.filter((r) => r.outcome === o).length;
  const passed = count("PASS");
  const failed = count("FAIL");
  const inconclusive = count("INCONCLUSIVE");
  const notReproducible = count("NOT_REPRODUCIBLE");
  const atLevel = runs.filter((r) => r.verdictLevel === verdictLevel && (r.outcome === "PASS" || r.outcome === "FAIL")).length;
  const status = failed > 0 ? "FAIL" : inconclusive + notReproducible > 0 ? "INCOMPLETE" : "PASS";
  const { path: recordPath, record } = await writeSilverRecord(
    {
      schema: S.SilverNodeTestV1,
      hardkasVersion: HARDKAS_VERSION,
      createdAt: new Date().toISOString(),
      networkId: network,
      evidence: "node-verdicts",
      scope: NODE_SCOPE,
      compileRecord: { path: relativePath(file), contentHash: compileRecord.contentHash, artifactSha256: compileRecord.provenance.artifactSha256 },
      contract: name,
      address: plan.address,
      lockingScript: plan.lockingScript,
      testFile: { path: relativePath(opts.tests), sha256: sha256(testsBytes) },
      funder: String(opts.from),
      ...(identity ? { node: kit.nodeRecordOf(identity) } : {}),
      results: runs.map((r) => ({
        name: r.name,
        function: r.function,
        expect: r.expect,
        outcome: r.outcome ?? "INCONCLUSIVE",
        verdictLevel: r.verdictLevel ?? null,
        nodeVerdict: r.nodeVerdict ?? null,
        ...(r.txVersion !== undefined ? { txVersion: r.txVersion } : {}),
        ...(r.txId ? { txId: r.txId } : {}),
        ...(r.coin ? { coin: r.coin } : {}),
        ...(r.effect ? { effect: r.effect } : {}),
        ...(r.nodeReason ? { nodeReason: r.nodeReason } : {}),
        ...(r.nodeReasonCode ? { nodeReasonCode: r.nodeReasonCode } : {}),
        ...(r.notReproducible ? { notReproducible: r.notReproducible } : {}),
        ...(r.inconclusive ? { inconclusive: r.inconclusive } : {}),
        ...(r.notes.length > 0 ? { notes: r.notes } : {})
      })),
      summary: { total: runs.length, passed, failed, inconclusive, notReproducible, level: verdictLevel, casesAtLevel: atLevel },
      status
    },
    RECORD_PREFIX,
    opts.out,
    recordModeOf(target)
  );

  if (opts.json) {
    // every value of the record is a string, a number below 2^53, a boolean or null: written as it is
    out().writeJson({ ...record, recordPath });
  } else {
    const label = (r: CaseRun) =>
      r.outcome === "PASS" ? pc.green("PASS") : r.outcome === "FAIL" ? pc.red("FAIL") : r.outcome === "INCONCLUSIVE" ? pc.yellow("N/V ") : pc.yellow("N/R ");
    out().writeLine(`${pc.bold("SilverScript tests on a node")} ${pc.dim(`(${network}${identity ? `, ${String(identity?.serverVersion ?? identity?.version ?? "rusty-kaspad")} at ${target.rpcUrl}` : ""})`)}`);
    for (const r of runs) {
      const what =
        r.nodeVerdict === "ACCEPTED"
          ? `accepted by the node, tx ${r.txId}${r.effect === "NOT_OBSERVED" ? " (not seen in a chain block)" : ""}`
          : r.nodeVerdict === "REJECTED"
            ? `refused by the node (${r.nodeReasonCode}): ${short(r.nodeReason ?? "", 160)}`
            : `not reproducible on a node (${r.notReproducible?.hardkasCode ?? r.notReproducible?.code}): ${short(r.notReproducible?.reason ?? "", 200)}`;
      out().writeLine(`  ${label(r)}  ${r.name}  ${pc.dim(`expect ${r.expect} · ${what}${r.verdictLevel ? ` [${r.verdictLevel}]` : ""}`)}`);
      if (r.inconclusive) out().writeLine(pc.yellow(`        ${r.inconclusive}`));
    }
    out().writeLine(
      `${runs.length} tests: ${passed} passed, ${failed} failed, ${inconclusive} without a verdict, ${notReproducible} not reproducible ${pc.dim(`· level ${verdictLevel} for ${atLevel} of ${runs.length} cases`)}`
    );
    if (unspentLeft.length > 0) out().writeLine(pc.dim(`  coins left unspent at ${plan.address}: ${unspentLeft.join(", ")}`));
    out().writeLine(pc.dim(`record: ${recordPath}`));
  }
  if (failed > 0) fail("SILVER_TEST_FAILED", `${failed} of ${runs.length} tests failed on the node (${network})`);
  if (inconclusive > 0) fail("SILVER_TEST_INCONCLUSIVE", `${inconclusive} of ${runs.length} tests got no verdict from the node (${network})`);
  if (notReproducible > 0) fail("SILVER_TEST_NOT_REPRODUCIBLE", `${notReproducible} of ${runs.length} tests are not reproducible as a real transaction: they have no node verdict (never a pass)`);
}

/**
 * The finalized v0 spend as this workspace's send machinery takes it (the escrow release's way): a v0 plan (the coin
 * in, the case's outputs out by address, no change; HardKAS's fee limit) written to the store, and the signed artifact
 * of the finalized transaction, its lineage parent that plan.
 */
async function wrapV0Spend(sdk: any, network: string, address: string, draft: any, finalized: { rpcTransaction: any; txId: string }): Promise<{ plan: any; signed: any }> {
  const { systemRuntimeContext, HardkasSchemas } = await import("@hardkas/core");
  const { ARTIFACT_VERSION, CURRENT_HASH_VERSION, HARDKAS_VERSION, calculateContentHash, createLineageTransition, createTxPlanArtifact, recomputeMass, verifyFeeSemantics } = await import(
    "@hardkas/artifacts"
  );
  const k: any = (await import("@hardkas/core")).loadManagedKaspaWasmSync();
  const outputs = (draft.outputs as any[]).map((o) => ({
    address: String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(Number(o.scriptPublicKey.version), String(o.scriptPublicKey.script)), network)),
    amountSompi: BigInt(o.valueSompi)
  }));
  const total = outputs.reduce((s, o) => s + o.amountSompi, 0n);
  const planWithMass = (estimatedMass: bigint) =>
    createTxPlanArtifact({
      networkId: network as any,
      mode: sdk.execution.mode as any,
      from: { input: address, address },
      to: { input: outputs[0]!.address, address: outputs[0]!.address },
      amountSompi: total,
      plan: {
        inputs: [
          {
            outpoint: { transactionId: String(draft.input.outpoint.transactionId), index: Number(draft.input.outpoint.index) },
            amountSompi: BigInt(draft.input.amountSompi),
            address,
            scriptPublicKey: `0000${String(draft.input.scriptPublicKey.script)}`
          }
        ],
        outputs,
        estimatedFeeSompi: BigInt(draft.feeSompi),
        estimatedMass
      } as any,
      ctx: systemRuntimeContext
    });
  // A v0 plan's economic check (verifyFeeSemantics, strict at send) prices the plan's own unsigned transaction with the
  // SDK, which does not know a P2SH unlock: the plan states that figure, so plan and check agree. The real signed shape
  // (the contract's unlock) was priced against the node's minimum relay fee by prepareSilverSpend, and the send machinery
  // derives the fee it records from the signed transaction itself.
  const plan = planWithMass(recomputeMass(planWithMass(BigInt(draft.mass ?? 0)) as any));
  const audit = verifyFeeSemantics(plan);
  if (!audit.ok) {
    const e: any = new Error(`SILVER_TEST_PLAN_UNPRICED: the send machinery's economic check refuses this spend's plan (${audit.issues.join("; ")}). Nothing was sent.`);
    e.code = "SILVER_TEST_PLAN_UNPRICED";
    throw e;
  }
  const storedPlan: any = (await sdk.artifacts.write(plan as any)).artifact ?? plan;
  const signed: any = {
    schema: HardkasSchemas.SignedTx,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    status: "signed",
    createdAt: new Date(systemRuntimeContext.clock.now()).toISOString(),
    txId: finalized.txId,
    sourcePlanId: storedPlan.planId,
    networkId: storedPlan.networkId,
    mode: storedPlan.mode,
    from: { address: storedPlan.from.address },
    to: { address: storedPlan.to.address },
    amountSompi: storedPlan.amountSompi,
    signedTransaction: { format: "hex", payload: JSON.stringify(finalized.rpcTransaction, bigintText) },
    lineage: createLineageTransition(storedPlan, HardkasSchemas.SignedTx),
    ...(storedPlan.execution ? { execution: storedPlan.execution } : {}),
    ...(storedPlan.workflowId ? { workflowId: storedPlan.workflowId } : {})
  };
  const contentHash = calculateContentHash(signed, CURRENT_HASH_VERSION);
  signed.signedId = `signed-${contentHash.slice(0, 16)}`;
  signed.contentHash = contentHash;
  if (signed.lineage) signed.lineage.artifactId = contentHash;
  const storedSigned: any = (await sdk.artifacts.write(signed)).artifact ?? signed;
  return { plan: storedPlan, signed: storedSigned };
}
