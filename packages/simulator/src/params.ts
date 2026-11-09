/*
 * Consensus parameters the simulator follows, from rusty-kaspa v2.1.0 consensus/core/src/config: every network
 * (mainnet, testnet, simnet, devnet) runs at 10 blocks per second (params.rs `BlockrateParams::new::<10>()`).
 */

/** params.rs: blocks per second of every network in v2.1.0. */
export const CONSENSUS_BPS = 10n;

/** config/constants.rs `COINBASE_MATURITY_SECONDS`. */
export const COINBASE_MATURITY_SECONDS = 100n;

/**
 * bps.rs `coinbase_maturity()` = BPS × COINBASE_MATURITY_SECONDS = 1000 DAA scores (it was 100 in the simulator; the
 * node refuses a coinbase spend before it with ImmatureCoinbaseSpend).
 */
export const CONSENSUS_COINBASE_MATURITY = CONSENSUS_BPS * COINBASE_MATURITY_SECONDS;

/** bps.rs `ghostdag_k()` at 10 BPS. The approximate engine defaults to a smaller K (see ghostdag-engine.ts DEFAULT_K). */
export const CONSENSUS_GHOSTDAG_K = 124;
