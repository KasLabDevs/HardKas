/**
 * Single source of truth for the Docker images HardKAS runs.
 *
 * The node is the latest official rusty-kaspa release HardKAS supports (v2.0.1, the
 * Toccata guide minimum), pinned by digest so every localnet, test harness and gauntlet
 * runs the same bytes. Change these only together with evidence of a new release.
 */
export const KASPAD_REFERENCE_VERSION = "v2.0.1";
export const KASPAD_REFERENCE_DIGEST = "sha256:db36449e2f41cf33ab7c26683ce390cb71bdea9c403eefd2e740a7d5605bcd8b";
export const KASPAD_REFERENCE_IMAGE = `kaspanet/rusty-kaspad:${KASPAD_REFERENCE_VERSION}@${KASPAD_REFERENCE_DIGEST}`;

/** Upstream Kaspa CPU miner, pinned by digest. */
export const CPUMINER_REFERENCE_IMAGE = "kaspanet/cpuminer@sha256:60f78ab2828ab24b249c99210eee5a2825303a5226154260dd021ff26d46748b";
