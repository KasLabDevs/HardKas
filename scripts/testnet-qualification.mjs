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
if (!expectedNetwork.startsWith("testnet-")) {
  fail(`Refusing to run against non-testnet network '${expectedNetwork}'. TQ-1 targets testnet only.`, 4);
}

const confirmationDaaDelta = BigInt(args.get("confirmation-daa-delta") ?? "10");
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
    `funding account   : ${fundingAccount ?? "<unset>"}`,
    `funding address   : ${fundingAddress ?? "<unset>"}`,
    `declared outpoint : ${fundingTxid ?? "<unset>"}:${fundingIndexRaw ?? "<unset>"}`,
    `amount sompi      : ${amountSompiRaw ?? "<unset>"}`,
    `destination       : ${destAddress ?? "<unset>"}`,
    `confirmation DAA δ: ${confirmationDaaDelta.toString()}`,
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

const { runQualification, probeRemoteTestnet, assertSpendableOrFailClosed, createInMemoryReservationLedger } = tq;
const Hardkas = sdkMod.Hardkas ?? sdkMod.default?.Hardkas;
if (!Hardkas) fail("Could not resolve `Hardkas` from @hardkas/sdk. Build the sdk package first.", 4);

// Open the SDK workspace bound to a wRPC endpoint that targets our node.
const sdk = await Hardkas.open({
  cwd: workspace,
  mode: "developer",
  network: expectedNetwork
});

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
  async getBlockDagInfo() {
    const r = await rpc.getBlockDagInfo();
    return { virtualDaaScore: r.virtualDaaScore };
  },
  async getMempoolEntry(txid) { return submissionRpc.getMempoolEntry(txid); },
  async getUtxosByAddress(address) {
    const raw = await rpc.getUtxosByAddress(address);
    return (raw ?? []).map((u) => ({
      outpoint: { transactionId: u.outpoint?.transactionId ?? u.transactionId, index: u.outpoint?.index ?? u.outputIndex ?? 0 },
      amountSompi: u.amountSompi ?? 0n,
      blockDaaScore: u.blockDaaScore,
      blockHash: u.blockHash ?? u.acceptingBlockHash
    }));
  }
};

// Product path: SDK does plan + sign; TQ takes the resulting signed payload.
const productPath = {
  async planAndSign(input) {
    const plan = await sdk.tx.plan({
      from: input.fromAddress,
      to: input.toAddress,
      amount: input.amountSompi,
      networkProfile: input.networkId
    });
    const signed = await sdk.tx.sign(plan, fundingAccount);
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
  toolchain: { hardkas: { version: process.env.npm_package_version ?? "unknown" } },
  authority,
  fundingEvidence,
  rawDir,
  ...(forSharing ? { sharedDir } : {}),
  startedAt,
  standardL1: {
    productPath,
    submissionRpc,
    observerRpc,
    fromAddress: fundingAddress,
    toAddress: destAddress,
    amountSompi: BigInt(amountSompiRaw),
    configuredDaaDelta,
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
    `submit calls     : ${outcome.scenarios.standardL1?.submission?.attempts ?? 0}`,
    `submission state : ${outcome.scenarios.standardL1?.submission?.state ?? "(none)"}`,
    `txid             : ${outcome.scenarios.standardL1?.plan?.txid ?? "(none)"}`,
    outcome.scenarios.standardL1?.inclusion ? `inclusion        : block ${outcome.scenarios.standardL1.inclusion.inclusionBlockHash} @ DAA ${outcome.scenarios.standardL1.inclusion.inclusionDaaScore}` : "inclusion        : (none)",
    outcome.scenarios.standardL1?.confirmation ? `confirmation     : delta ${outcome.scenarios.standardL1.confirmation.deltaDaa} >= ${outcome.scenarios.standardL1.confirmation.configuredDaaDelta}` : "confirmation     : (none)",
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
