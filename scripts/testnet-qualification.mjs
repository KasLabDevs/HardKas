#!/usr/bin/env node
/**
 * TQ-1 CLI entrypoint (Block 4).
 *
 * DRY-RUN (default): prints what would be attempted; touches no network.
 * --live: broadcasts to the target testnet-10 endpoint after a full env
 *         validation. Refuses mainnet. Never prints secrets.
 *
 * The live path wires @hardkas/sdk (plan + sign + RPC) into
 * `runQualification`. TQ does NOT build/sign transactions itself; the SDK
 * remains the product-layer authority. If the SDK cannot produce a signed
 * L1 tx or submit via its RPC, TQ returns a FAIL with a blocker payload —
 * TQ does not patch around it. That blocker is Block 5's input.
 *
 * Env vars (mandatory when --live):
 *   HARDKAS_TQ_ENDPOINT             wRPC URL to the testnet-10 node
 *   HARDKAS_TQ_ENDPOINT_CLASS       one of {wrpc, grpc, http} (default: wrpc)
 *   HARDKAS_TQ_WORKSPACE            path to the HardKAS workspace containing .hardkas/
 *   HARDKAS_TQ_FUNDING_ACCOUNT      HardKAS account name (in the workspace's keystore)
 *   HARDKAS_TQ_FUNDING_ADDRESS      declared funding address (redundant safety check vs the account)
 *   HARDKAS_TQ_FUNDING_TXID         declared source outpoint tx id
 *   HARDKAS_TQ_FUNDING_INDEX        declared source outpoint index
 *   HARDKAS_TQ_FUNDING_MIN_SOMPI    minimum amount that outpoint must show
 *   HARDKAS_TQ_DEST_ADDRESS         destination address for the L1 transfer
 *   HARDKAS_TQ_AMOUNT_SOMPI         amount to send in sompi
 *   HARDKAS_TQ_RECEIPTS_DIR         base receipts directory
 *                                   (default: ./.hardkas/testnet-qualification)
 *
 * Optional:
 *   HARDKAS_TQ_KEYSTORE_PASSWORD_ENV  the NAME of the env var that holds the funding account's keystore password
 *                                     (like the CLI's --password-env); the value is never printed or recorded.
 *                                     Without it an encrypted account cannot sign (KEYSTORE_PASSWORD_REQUIRED).
 *
 * TQ1-SCRIPT-BROKEN-1 (2026-10-15): ONE endpoint authority. The SDK talks to the workspace's endpoint for the
 * network (`networks[<network>].rpcUrl`, resolved by @hardkas/config resolveNodeEndpoint); HARDKAS_TQ_ENDPOINT must
 * name that same endpoint, and both are checked BEFORE the SDK opens (exit 4 otherwise, nothing contacted). The
 * probe's ENDPOINT-AUTHORITY-1 check stays as the second line. `allowPublic` is granted to the SDK for a
 * `testnet-<n>` qualification only (mainnet and anything else are refused above). Configuration errors are typed
 * refusals (`CONFIGURATION_REFUSED <CODE>`, exit 4), never a stack trace.
 *
 * TN10-CONFIRMATION-FIX-1 (2026-10-15): confirmation is BLUE-SCORE depth of the chain block that accepted the tx.
 * Before the submission the script records the sink (a known chain position); afterwards the product observer
 * (`sdk.tx.observe`, the same one `hardkas tx status` uses) scans the virtual chain from it, names the accepting block
 * and its blue-score depth, and that block is bound to the UTXO row (same DAA score). UTXO presence alone is never a
 * confirmation. Receipts are v3.
 *   --min-confirmations <n>        blue-score confirmations required (default 100, the HardKAS tx status policy)
 *   --confirmation-daa-delta <n>   LEGACY alias, kept temporarily. INCOMPATIBLE CHANGE: it used to compare a DAA delta
 *                                  (default 10); it now means blue-score confirmations, says so on stderr and the
 *                                  receipt records how the threshold was requested. A consumer that relied on the DAA
 *                                  meaning must migrate to --min-confirmations explicitly (there is no DAA mode).
 *                                  Given together with a different --min-confirmations it is refused (exit 4).
 *
 * Exit codes:
 *   0 → PASS + raw persisted
 *   2 → UNRESOLVED, or missing inputs, or dry-run informational
 *   3 → FAIL (product-layer or consensus)
 *   4 → configuration refusal (e.g. mainnet target)
 *   5 → PASS but raw persistence failed
 *   6 → PASS + raw persisted, shared persistence failed
 */

import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const eq = a.indexOf("=");
  if (eq > -1) args.set(a.slice(2, eq), a.slice(eq + 1));
  else {
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) { args.set(a.slice(2), next); i++; }
    else args.set(a.slice(2), "true");
  }
}

function fail(msg, code = 2) {
  process.stderr.write(`[TQ-CLI] ${msg}\n`);
  process.exit(code);
}

const expectedNetwork = args.get("expected-network") ?? "testnet-10";
if (expectedNetwork === "mainnet" || /^kaspa$/i.test(expectedNetwork)) {
  fail(`Refusing to run testnet qualification against '${expectedNetwork}'. TQ-1 targets testnet only.`, 4);
}
if (!/^testnet-\d+$/.test(expectedNetwork)) {
  fail(`Refusing to run against non-testnet network '${expectedNetwork}'. TQ-1 targets testnet only.`, 4);
}

/** A typed configuration refusal: `CONFIGURATION_REFUSED <CODE>: <message>`, exit 4, never a stack trace. */
function refuseConfiguration(err) {
  const message = String(err?.message ?? err);
  const code = (typeof err?.code === "string" && err.code) || /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/.exec(message)?.[1] || "CONFIG_ERROR";
  fail(`CONFIGURATION_REFUSED ${code}: ${message}`, 4);
}

// TN10-CONFIRMATION-FIX-1: the threshold is blue-score confirmations; the old DAA flag is a loud legacy alias
function confirmationsArg(name) {
  const raw = args.get(name);
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw)) fail(`CONFIGURATION_REFUSED MIN_CONFIRMATIONS_INVALID: --${name} must be a non-negative integer, got '${raw}'. Nothing was contacted.`, 4);
  return BigInt(raw);
}
const minConfirmationsFlag = confirmationsArg("min-confirmations");
const legacyDaaFlag = confirmationsArg("confirmation-daa-delta");
if (minConfirmationsFlag !== undefined && legacyDaaFlag !== undefined && minConfirmationsFlag !== legacyDaaFlag) {
  fail(
    `CONFIGURATION_REFUSED MIN_CONFIRMATIONS_CONFLICT: --min-confirmations ${minConfirmationsFlag} and the legacy --confirmation-daa-delta ${legacyDaaFlag} disagree. ` +
      `Give --min-confirmations only (blue-score confirmations). Nothing was contacted.`,
    4
  );
}
if (legacyDaaFlag !== undefined && minConfirmationsFlag === undefined) {
  process.stderr.write(
    `[TQ-CLI] LEGACY_FLAG --confirmation-daa-delta ${legacyDaaFlag}: this now requires ${legacyDaaFlag} BLUE-SCORE confirmations of the accepting chain block, ` +
      `not a DAA delta (incompatible with the old meaning). Use --min-confirmations; the receipt records how the threshold was requested.\n`
  );
}
const minConfirmations = minConfirmationsFlag ?? legacyDaaFlag ?? 100n;
const minConfirmationsRequestedVia =
  minConfirmationsFlag !== undefined
    ? "--min-confirmations"
    : legacyDaaFlag !== undefined
      ? "--confirmation-daa-delta (legacy alias, blue-score semantics)"
      : "default (HardKAS tx status policy v1: 100)";
const live = args.get("live") === "true";
const forSharing = args.get("for-sharing") === "true";

const endpointAddress = args.get("endpoint") ?? process.env.HARDKAS_TQ_ENDPOINT;
const endpointClassRaw = (args.get("endpoint-class") ?? process.env.HARDKAS_TQ_ENDPOINT_CLASS ?? "wrpc").toLowerCase();
const endpointClass = ["wrpc", "grpc", "http"].includes(endpointClassRaw) ? endpointClassRaw : "unknown";

const receiptsBase = args.get("receipts-dir") ?? process.env.HARDKAS_TQ_RECEIPTS_DIR
  ?? "./.hardkas/testnet-qualification";
const rawDir = path.join(receiptsBase, "raw");
const sharedDir = path.join(receiptsBase, "shared");

const workspace = process.env.HARDKAS_TQ_WORKSPACE;
const fundingAccount = process.env.HARDKAS_TQ_FUNDING_ACCOUNT;
const fundingAddress = process.env.HARDKAS_TQ_FUNDING_ADDRESS;
const fundingTxid = process.env.HARDKAS_TQ_FUNDING_TXID;
const fundingIndexRaw = process.env.HARDKAS_TQ_FUNDING_INDEX;
const fundingMinSompi = process.env.HARDKAS_TQ_FUNDING_MIN_SOMPI;
const destAddress = process.env.HARDKAS_TQ_DEST_ADDRESS;
const amountSompiRaw = process.env.HARDKAS_TQ_AMOUNT_SOMPI;
// D5: the NAME of the variable holding the keystore password; its value is read once and never printed or recorded
const keystorePasswordEnv = process.env.HARDKAS_TQ_KEYSTORE_PASSWORD_ENV || undefined;

// D8: the HardKAS version recorded on the receipt — the repository's own CLI package, not npm_package_version
// (unset when this script runs as `node scripts/testnet-qualification.mjs`)
const hardkasVersion = await (async () => {
  try {
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(new URL("../packages/cli/package.json", import.meta.url), "utf8")).version ?? "unknown";
  } catch {
    return "unknown";
  }
})();

function requiredForLive() {
  const missing = [];
  if (!endpointAddress) missing.push("--endpoint / HARDKAS_TQ_ENDPOINT");
  if (!workspace) missing.push("HARDKAS_TQ_WORKSPACE");
  if (!fundingAccount) missing.push("HARDKAS_TQ_FUNDING_ACCOUNT");
  if (!fundingAddress) missing.push("HARDKAS_TQ_FUNDING_ADDRESS");
  if (!fundingTxid) missing.push("HARDKAS_TQ_FUNDING_TXID");
  if (!fundingIndexRaw) missing.push("HARDKAS_TQ_FUNDING_INDEX");
  if (!fundingMinSompi) missing.push("HARDKAS_TQ_FUNDING_MIN_SOMPI");
  if (!destAddress) missing.push("HARDKAS_TQ_DEST_ADDRESS");
  if (!amountSompiRaw) missing.push("HARDKAS_TQ_AMOUNT_SOMPI");
  return missing;
}

function describeEndpoint(addr) {
  if (!addr) return "<unset>";
  try {
    const u = new URL(addr);
    // Never leak userinfo or search string.
    return `${endpointClass}://${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return `${endpointClass}://<opaque>`;
  }
}

process.stdout.write(
  [
    "──────────────── HardKAS Testnet Qualification (TQ-1) ────────────────",
    `mode              : ${live ? "LIVE (broadcast enabled)" : "DRY-RUN (no broadcast)"}`,
    `network expected  : ${expectedNetwork}`,
    `endpoint          : ${describeEndpoint(endpointAddress)}`,
    `workspace         : ${workspace ?? "<unset>"}`,
    `hardkas version   : ${hardkasVersion}`,
    `funding account   : ${fundingAccount ?? "<unset>"}`,
    `keystore password : ${keystorePasswordEnv ? `from $${keystorePasswordEnv}` : "<none>"}`,
    `funding address   : ${fundingAddress ?? "<unset>"}`,
    `declared outpoint : ${fundingTxid ?? "<unset>"}:${fundingIndexRaw ?? "<unset>"}`,
    `amount sompi      : ${amountSompiRaw ?? "<unset>"}`,
    `destination       : ${destAddress ?? "<unset>"}`,
    `min confirmations : ${minConfirmations.toString()} blue-score (${minConfirmationsRequestedVia})`,
    `raw receipts dir  : ${rawDir}`,
    `shared enabled    : ${forSharing ? "yes" : "no"}`,
    "──────────────────────────────────────────────────────────────────────"
  ].join("\n") + "\n"
);

if (!live) {
  process.stdout.write(
    "Dry-run only. To perform a live testnet-10 qualification pass --live and provide all HARDKAS_TQ_* env vars.\n"
  );
  process.exit(2);
}

const missing = requiredForLive();
if (missing.length > 0) {
  fail(`Missing required inputs for --live:\n  - ${missing.join("\n  - ")}`, 4);
}
// D5: a password variable that was named must hold a password — refused before anything is contacted
const keystorePassword = keystorePasswordEnv ? process.env[keystorePasswordEnv] : undefined;
if (keystorePasswordEnv && !keystorePassword) {
  fail(`CONFIGURATION_REFUSED KEYSTORE_PASSWORD_ENV_UNSET: HARDKAS_TQ_KEYSTORE_PASSWORD_ENV names '${keystorePasswordEnv}', which is unset or empty. Nothing was contacted.`, 4);
}

// --- LIVE PATH ---------------------------------------------------------------
// From here everything imports the SDK + TQ. We resolve dist first (built
// artifacts) and fall back to source if the workspace is not yet built.

async function importDistOrSrc(distPath, srcPath) {
  try {
    return await import(distPath);
  } catch {
    return await import(srcPath);
  }
}

const tq = await importDistOrSrc(
  "../packages/testnet-qualification/dist/index.js",
  "../packages/testnet-qualification/src/index.ts"
);
const sdkMod = await importDistOrSrc(
  "../packages/sdk/dist/index.js",
  "../packages/sdk/src/index.ts"
);

const configMod = await importDistOrSrc(
  "../packages/config/dist/index.js",
  "../packages/config/src/index.ts"
);

const { runQualification, probeRemoteTestnet, assertSpendableOrFailClosed, createInMemoryReservationLedger, canonicalEndpoint, shownEndpoint } = tq;
const Hardkas = sdkMod.Hardkas ?? sdkMod.default?.Hardkas;
if (!Hardkas) fail("Could not resolve `Hardkas` from @hardkas/sdk. Build the sdk package first.", 4);

// D2 (TQ1-SCRIPT-BROKEN-1): ONE endpoint authority. The SDK below talks to the workspace's endpoint for the network —
// the shared resolver (TESTNET-PORT-COLLISION-1: declared rpcUrl, never a built-in public host, never the canonical
// localnet). HARDKAS_TQ_ENDPOINT must be that endpoint; checked before the SDK opens, so a mismatch contacts nothing.
let workspaceEndpoint;
try {
  const loaded = await configMod.loadHardkasConfig({ cwd: workspace });
  workspaceEndpoint = configMod.resolveNodeEndpoint({ config: loaded.config, networkId: expectedNetwork }).url;
} catch (err) {
  refuseConfiguration(err);
}
if (canonicalEndpoint(workspaceEndpoint) !== canonicalEndpoint(endpointAddress)) {
  fail(
    `CONFIGURATION_REFUSED ENDPOINT_DECLARATION_MISMATCH: HARDKAS_TQ_ENDPOINT ${shownEndpoint(endpointAddress)} is not the ` +
      `workspace's endpoint for '${expectedNetwork}' (${shownEndpoint(workspaceEndpoint)}), which the SDK would use. ` +
      `Declare networks['${expectedNetwork}'].rpcUrl as HARDKAS_TQ_ENDPOINT, or set HARDKAS_TQ_ENDPOINT to it. Nothing was contacted.`,
    4
  );
}

// Open the SDK workspace on that endpoint. D6: `allowPublic` is the qualification's own consent (--live, a
// `testnet-<n>` network — anything else was refused above); the workspace does not need network.allowPublic.
let sdk;
try {
  if (!/^testnet-\d+$/.test(expectedNetwork)) throw Object.assign(new Error(`allowPublic is granted to testnet qualifications only, not '${expectedNetwork}'`), { code: "TQ_NETWORK_REFUSED" });
  sdk = await Hardkas.open({
    cwd: workspace,
    mode: "developer",
    network: expectedNetwork,
    policy: { allowPublic: true }
  });
} catch (err) {
  refuseConfiguration(err);
}

// Build a compact RPC facade over the SDK's rpc so TQ's submission-guard
// and observer see the exact interface they expect. We call SDK methods
// verbatim; TQ never wraps them in retries.
const rpc = sdk.rpc;
const submissionRpc = {
  async submitTransaction(signedTx) {
    return await rpc.submitTransaction(signedTx);
  },
  async getMempoolEntry(txid) {
    if (typeof rpc.getMempoolEntry === "function") {
      try {
        const r = await rpc.getMempoolEntry(txid);
        return r ?? null;
      } catch (err) {
        // Some Kaspa RPC surfaces throw when the tx isn't in mempool.
        if (/not found/i.test(String(err?.message ?? err))) return null;
        throw err;
      }
    }
    return null;
  },
  async getUtxosByAddress(address) {
    const raw = await rpc.getUtxosByAddress(address);
    return (raw ?? []).map((u) => ({
      outpoint: { transactionId: u.outpoint?.transactionId ?? u.transactionId, index: u.outpoint?.index ?? u.outputIndex ?? 0 },
      amountSompi: u.amountSompi ?? 0n
    }));
  }
};

const observerRpc = {
  async getMempoolEntry(txid) { return submissionRpc.getMempoolEntry(txid); },
  async getUtxosByAddress(address) {
    const raw = await rpc.getUtxosByAddress(address);
    // TN10-CONFIRMATION-FIX-1: a kaspad row carries the accepting chain block's DAA score and no block hash
    return (raw ?? []).map((u) => ({
      outpoint: { transactionId: u.outpoint?.transactionId ?? u.transactionId, index: u.outpoint?.index ?? u.outputIndex ?? 0 },
      amountSompi: u.amountSompi ?? 0n,
      blockDaaScore: u.blockDaaScore
    }));
  }
};

// TN10-CONFIRMATION-FIX-1: the chain observer is the product's (`sdk.tx.observe`, as `hardkas tx status`); TQ only
// captures the start point before the submission and reads back what each sealed observation found.
const qualificationPolicy = (n) => ({
  policyId: "hardkas.testnet-qualification.min-confirmations",
  policyVersion: 1,
  origin: "user",
  minConfirmations: Number(n),
  confirmationUnit: "blue-score"
});
const big = (v) => (v === undefined || v === null ? undefined : BigInt(v));
const chainObserver = {
  async captureStartPoint() {
    const dag = await rpc.getBlockDagInfo();
    const sinkHash = dag?.sink ?? dag?.sinkHash;
    if (typeof sinkHash !== "string" || !/^[0-9a-f]{64}$/.test(sinkHash)) {
      throw Object.assign(new Error(`getBlockDagInfo returned no usable sink (${String(sinkHash)})`), { code: "START_POINT_UNAVAILABLE" });
    }
    const sb = await rpc.getSinkBlueScore();
    return {
      sinkHash,
      sinkBlueScore: BigInt(sb?.blueScore ?? sb),
      virtualDaaScore: BigInt(dag.virtualDaaScore),
      capturedAt: new Date().toISOString()
    };
  },
  async look({ txid, since, minConfirmations }) {
    const r = await sdk.tx.observe(txid, { since, policy: qualificationPolicy(minConfirmations) });
    const o = r.observation;
    const f = o.finding ?? {};
    const finding =
      f.type === "chain_accepted"
        ? {
            type: "accepted",
            acceptingBlockHash: f.acceptingBlockHash,
            acceptingBlueScore: BigInt(f.acceptingBlueScore),
            ...(f.acceptingDaaScore !== undefined ? { acceptingDaaScore: BigInt(f.acceptingDaaScore) } : {}),
            confirmationsBlue: BigInt(f.confirmationsBlue),
            ...(f.confirmationsDaa !== undefined ? { confirmationsDaa: BigInt(f.confirmationsDaa) } : {}),
            finalityReached: false
          }
        : f.type === "finality_reached"
          ? {
              type: "accepted",
              acceptingBlockHash: f.acceptingBlockHash,
              acceptingBlueScore: BigInt(f.acceptingBlueScore),
              confirmationsBlue: BigInt(f.confirmationsBlue),
              finalityReached: true
            }
          : f.type === "mempool_entry"
            ? { type: "mempool" }
            : f.type === "not_found"
              ? { type: "not_found", ...(typeof f.scannedChainBlocks === "number" ? { scannedChainBlocks: f.scannedChainBlocks } : {}) }
              : f.type === "chain_removed"
                ? { type: "removed", acceptingBlockHash: f.acceptingBlockHash }
                : { type: "unobservable", reason: f.type === "pruned_unobservable" ? String(f.reason) : `unexpected finding '${String(f.type)}'` };
    return {
      observationArtifactId: o.contentHash,
      ...(r.observationPath ? { observationPath: r.observationPath } : {}),
      observedAt: o.observedAt,
      observerId: o.observer.observerId,
      point: { sinkHash: o.point.sinkHash, sinkBlueScore: big(o.point.sinkBlueScore), virtualDaaScore: big(o.point.virtualDaaScore) },
      finding,
      derivedStatus: r.derived.status
    };
  }
};

// Product path: SDK does plan + sign; TQ takes the resulting signed payload.
const productPath = {
  async planAndSign(input) {
    // D4: the network is this SDK instance's (Hardkas.open above); `networkProfile` is an artifact reference, not a
    // network id, so it is not passed
    const plan = await sdk.tx.plan({
      from: input.fromAddress,
      to: input.toAddress,
      amount: input.amountSompi
    });
    // D5: the keystore password from the named variable (never printed); without one an encrypted account refuses
    const signed = await sdk.tx.sign(plan, {
      account: fundingAccount,
      ...(keystorePassword ? { keystorePassword } : {})
    });
    const signedPayload = signed.signedTransaction?.payload
      ? JSON.parse(signed.signedTransaction.payload)
      : signed.signedTransaction ?? signed;
    const txid = signed.txId ?? plan.txId ?? plan.planId;
    if (!txid) throw Object.assign(new Error("HardKAS SDK did not return a stable txid; TQ cannot proceed."), { code: "SDK_TXID_MISSING" });
    return {
      txid,
      signedTransaction: signedPayload,
      plannerAuthority: plan?.ctx?.plannerAuthority ?? "KASPA_WASM_GENERATOR",
      plannerAuthorityDetail: plan?.ctx?.plannerAuthorityDetail,
      mass: BigInt(plan?.estimatedMass ?? plan?.plan?.estimatedMass ?? 0),
      fee: BigInt(plan?.estimatedFeeSompi ?? plan?.plan?.estimatedFeeSompi ?? 0),
      outputs: (plan?.outputs ?? plan?.plan?.outputs ?? []).map((o) => ({
        address: o.address,
        amountSompi: BigInt(o.amountSompi ?? 0)
      })),
      changeAddress: plan?.change?.address ?? plan?.plan?.change?.address,
      changeAmountSompi: plan?.change?.amountSompi ? BigInt(plan.change.amountSompi) : undefined
    };
  }
};

// --- Probe + funding --------------------------------------------------------

process.stdout.write("[TQ-CLI] Probing REMOTE_TESTNET_NODE...\n");
let authority;
try {
  authority = await probeRemoteTestnet({
    endpoint: { class: endpointClass, address: endpointAddress },
    rpc: {
      // ENDPOINT-AUTHORITY-1: the endpoint the SDK's client really talks to; the probe fails closed if it is not the
      // declared HARDKAS_TQ_ENDPOINT (the rest of this script is TQ1-SCRIPT-BROKEN-1's)
      ...(typeof rpc.url === "string" ? { endpoint: rpc.url } : {}),
      async getServerInfo() { return await rpc.getServerInfo(); },
      async getBlockDagInfo() { return await rpc.getBlockDagInfo(); },
      ...(typeof rpc.getNetworkParams === "function" ? { getNetworkParams: (n) => rpc.getNetworkParams(n) } : {}),
      ...(typeof rpc.getFeeEstimate === "function" ? { getFeeEstimate: (i) => rpc.getFeeEstimate(i) } : {})
    },
    expectedNetworkId: expectedNetwork
  });
} catch (err) {
  fail(`REMOTE_TESTNET_NODE probe failed: ${err?.message ?? err}`, 3);
}
process.stdout.write(`[TQ-CLI] Node OK: ${authority.serverVersion} @ ${authority.network.observed}\n`);

process.stdout.write("[TQ-CLI] Validating funding input...\n");
let fundingEvidence;
try {
  fundingEvidence = await assertSpendableOrFailClosed({
    rpc: { getUtxosByAddress: (addr) => rpc.getUtxosByAddress(addr) },
    spec: {
      authority: { address: fundingAddress },
      declaredOutpoint: { transactionId: fundingTxid, index: Number(fundingIndexRaw) },
      expectedMinimumSompi: BigInt(fundingMinSompi)
    },
    localReservation: createInMemoryReservationLedger(),
    runTag: `tq-run-${Date.now()}`
  });
} catch (err) {
  fail(`Funding input rejected: ${err?.message ?? err}`, 3);
}
process.stdout.write(`[TQ-CLI] Funding OK: ${fundingEvidence.amountSompi} sompi at ${fundingEvidence.address}\n`);

// --- Runner ------------------------------------------------------------------

const startedAt = new Date();
const outcome = await runQualification({
  qualificationId: `tq-${startedAt.toISOString().replace(/[:.]/g, "")}`,
  toolchain: { hardkas: { version: hardkasVersion } },
  authority,
  fundingEvidence,
  rawDir,
  ...(forSharing ? { sharedDir } : {}),
  startedAt,
  standardL1: {
    productPath,
    submissionRpc,
    observerRpc,
    chainObserver,
    fromAddress: fundingAddress,
    toAddress: destAddress,
    amountSompi: BigInt(amountSompiRaw),
    minConfirmations,
    minConfirmationsRequestedVia,
    submissionOptions: { probeWaitBeforeMs: 1000, probeMaxWaitMs: 10_000, probePollIntervalMs: 1000 },
    acceptanceOptions: { pollIntervalMs: 2000, maxWaitMs: 120_000 },
    confirmationOptions: { pollIntervalMs: 2000, maxWaitMs: 120_000 }
  }
});

// --- Report ------------------------------------------------------------------

const q = outcome.qualification;
const p = outcome.evidencePersistence;
process.stdout.write(
  [
    "──────────────── Qualification Result ────────────────",
    `qualification    : ${q.outcome}`,
    q.blocker ? `blocker          : ${q.blocker.code} @ ${q.blocker.stage}` : "blocker          : (none)",
    // D7: from the attempt record — a call the guard could not classify still counts
    `submit calls     : ${outcome.scenarios.standardL1?.submissionAttempt?.attempts ?? 0}`,
    `submission outcome : ${outcome.scenarios.standardL1?.submissionAttempt?.outcome ?? "not_attempted"}`,
    `submission state : ${outcome.scenarios.standardL1?.submission?.state ?? "(none)"}`,
    `txid             : ${outcome.scenarios.standardL1?.plan?.txid ?? "(none)"}`,
    outcome.scenarios.standardL1?.startPoint ? `start point      : sink ${outcome.scenarios.standardL1.startPoint.sinkHash} (captured before submit)` : "start point      : (none)",
    outcome.scenarios.standardL1?.chainAcceptance
      ? `accepting block  : ${outcome.scenarios.standardL1.chainAcceptance.acceptingBlockHash} (blue score ${outcome.scenarios.standardL1.chainAcceptance.acceptingBlueScore}; UTXO binding ${outcome.scenarios.standardL1.chainAcceptance.utxoBinding.result})`
      : "accepting block  : (none)",
    outcome.scenarios.standardL1?.confirmation
      ? `confirmation     : ${outcome.scenarios.standardL1.confirmation.confirmationsBlue} blue-score confirmations >= ${outcome.scenarios.standardL1.confirmation.policy.minConfirmations} (${outcome.scenarios.standardL1.confirmation.observedStatus})`
      : "confirmation     : (none)",
    `raw evidence     : ${p.raw}${p.rawFilePath ? ` → ${p.rawFilePath}` : ""}`,
    `raw digest       : ${p.rawDigest ?? "(none)"}`,
    `shared evidence  : ${p.shared}${p.sharedFilePath ? ` → ${p.sharedFilePath}` : ""}`,
    `shared digest    : ${p.sharedDigest ?? "(none)"}`,
    "──────────────────────────────────────────────────────"
  ].join("\n") + "\n"
);

// Exit code strictly derives from the outcome/persistence combination.
if (q.outcome === "PASS" && p.raw === "persisted" && (p.shared === "persisted" || p.shared === "not-attempted")) {
  process.exit(0);
}
if (q.outcome === "PASS" && p.raw === "persisted" && p.shared === "failed") {
  process.exit(6);
}
if (q.outcome === "PASS" && p.raw === "failed") {
  process.exit(5);
}
if (q.outcome === "FAIL") process.exit(3);
process.exit(2); // UNRESOLVED or any other combination
