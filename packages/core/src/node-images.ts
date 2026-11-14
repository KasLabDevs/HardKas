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

/** An image reference pinned by its content digest: `<repository>[:tag]@sha256:<64 lowercase hex>` (a tag alone can move to other bytes). */
export const PINNED_IMAGE_REFERENCE = /^[^\s@]+@sha256:[0-9a-f]{64}$/;

/** Whether an image reference is pinned by its content digest (PINNED_IMAGE_REFERENCE). */
export function isPinnedImageReference(image: unknown): image is string {
  return typeof image === "string" && PINNED_IMAGE_REFERENCE.test(image);
}

/**
 * The typed code of a node image that is not pinned by digest. Every path that runs a node from `HARDKAS_KASPAD_IMAGE`
 * refuses such an image with it before Docker is asked to run anything: `hardkas node start` (which also checks
 * `--image`), the node runner (`localnet start`, `node restart|reset`, `sdk.node.start`) and the simnet test harness.
 */
export const NODE_IMAGE_DIGEST_REQUIRED = "NODE_IMAGE_DIGEST_REQUIRED" as const;

/** Upstream Kaspa CPU miner, pinned by digest. */
export const CPUMINER_REFERENCE_IMAGE = "kaspanet/cpuminer@sha256:60f78ab2828ab24b249c99210eee5a2825303a5226154260dd021ff26d46748b";
