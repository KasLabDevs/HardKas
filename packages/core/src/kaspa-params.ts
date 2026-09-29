// Wave 2(a) · Q4 (ratified 2026-09-26) — Kaspa consensus parameters HardKAS relies on
// to DERIVE transaction states. Every number here is copied from upstream with its
// provenance; none is a HardKAS choice. HardKAS product choices (such as the default
// `minConfirmations`) live in the tx-status POLICY, never in this table.
//
// Only what no upstream API exposes is copied: the finality depth above all.
// Maturities come from the SDK (network-params.ts), never from here.

export const KASPA_CONSENSUS_PARAMS_PROVENANCE = Object.freeze({
  source: "kaspanet/rusty-kaspa",
  // v2.1.0 re-checked 2026-09-28 against the same four files: every value below is unchanged.
  refs: ["master@2026-09-26", "v2.0.1", "v2.1.0"],
  files: [
    "consensus/core/src/config/constants.rs",
    "consensus/core/src/config/bps.rs",
    "consensus/core/src/config/params.rs",
    "wallet/core/src/utxo/settings.rs"
  ],
  verifiedAt: "2026-09-28",
  notes: [
    "FINALITY_DURATION = 43_200 s (12 h); finality_depth = BPS × FINALITY_DURATION",
    "PRUNING_DURATION = 108_000 s (30 h)",
    "MERGE_DEPTH_DURATION = 3600 s; merge_depth_bound = BPS × MERGE_DEPTH_DURATION",
    "COINBASE_MATURITY_SECONDS = 100; coinbase_maturity = BPS × 100 (DAA)",
    "mainnet, testnet-10, simnet and devnet all use BlockrateParams::new::<10>() (Crescendo active)",
    "wallet-core user transaction maturity: 100 DAA (mainnet/testnet/simnet), 10 DAA (devnet) — wallet policy, not consensus"
  ]
});

export interface KaspaNetworkParams {
  readonly networkId: string;
  readonly bps: number;
  readonly targetTimePerBlockMs: number;
  readonly finalityDurationSeconds: number;
  /** Blue-score depth on the selected chain below which the virtual never reorganises. */
  readonly finalityDepth: number;
  readonly pruningDurationSeconds: number;
  readonly mergeDepth: number;
}

const tenBps = (networkId: string): KaspaNetworkParams =>
  Object.freeze({
    networkId,
    bps: 10,
    targetTimePerBlockMs: 100,
    finalityDurationSeconds: 43_200,
    finalityDepth: 10 * 43_200,
    pruningDurationSeconds: 108_000,
    mergeDepth: 10 * 3600
  });

/**
 * Networks whose parameters were verified upstream. A network absent here has NO
 * finality depth known to HardKAS: `FINALIZED` cannot be derived for it (the
 * derivation says so instead of guessing). `simulated` is not a Kaspa network.
 */
export const KASPA_NETWORK_PARAMS: Readonly<Record<string, KaspaNetworkParams>> = Object.freeze({
  mainnet: tenBps("mainnet"),
  testnet: tenBps("testnet"),
  "testnet-10": tenBps("testnet-10"),
  simnet: tenBps("simnet"),
  devnet: tenBps("devnet")
});

export function kaspaParamsFor(networkId: string | undefined): KaspaNetworkParams | undefined {
  if (typeof networkId !== "string") return undefined;
  return KASPA_NETWORK_PARAMS[networkId];
}

/** The finality depth (blue score) of `networkId`, or undefined when HardKAS has not verified it upstream. */
export function finalityDepthFor(networkId: string | undefined): number | undefined {
  return kaspaParamsFor(networkId)?.finalityDepth;
}
