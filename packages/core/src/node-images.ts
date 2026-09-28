/**
 * Single source of truth for the Docker images HardKAS runs.
 *
 * The node is the latest official rusty-kaspa release HardKAS supports (v2.1.0, released
 * 2026-09-22), pinned by digest so every localnet, test harness and gauntlet runs the
 * same bytes. Change these only together with evidence of a new release.
 */
export const KASPAD_REFERENCE_VERSION = "v2.1.0";
export const KASPAD_REFERENCE_DIGEST = "sha256:f85da74b9514584451f83a2cbea3aa93f700248302fe7e3e0ab17288f93c905b";
export const KASPAD_REFERENCE_IMAGE = `kaspanet/rusty-kaspad:${KASPAD_REFERENCE_VERSION}@${KASPAD_REFERENCE_DIGEST}`;

/** Upstream Kaspa CPU miner, pinned by digest. */
export const CPUMINER_REFERENCE_IMAGE = "kaspanet/cpuminer@sha256:60f78ab2828ab24b249c99210eee5a2825303a5226154260dd021ff26d46748b";
