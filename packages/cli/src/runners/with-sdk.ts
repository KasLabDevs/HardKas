import type { Hardkas, HardkasOptions } from "@hardkas/sdk";

/**
 * RESOURCE-LIFECYCLE-1 (RL-I1/RL-I3): opens the SDK for one use and releases what it opened (sdk.close()) when the use
 * ends, on success and on error. For a runner that needs the SDK for a bounded step only; a runner that keeps the SDK
 * for its whole body closes it in its own finally.
 */
export async function withSdk<T>(options: HardkasOptions, use: (sdk: Hardkas) => T | Promise<T>): Promise<T> {
  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.open(options);
  try {
    return await use(sdk);
  } finally {
    await sdk.close();
  }
}
