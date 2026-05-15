// SAFETY_LEVEL: SIMULATION_ONLY
//
// Semantic assertion matchers for HardKAS transaction testing.

import { expect } from "vitest";

export interface HardKasMatchers<R = void> {
  /** Assert a receipt has status "accepted". */
  toBeAccepted(): R;
  /** Assert a receipt has status "failed". */
  toBeFailed(): R;
  /** Assert a receipt contains a valid txId (starts with "simtx_" or is 64-char hex). */
  toHaveValidTxId(): R;
  /** Assert an artifact has a valid contentHash (64-char hex). */
  toHaveValidContentHash(): R;
  /** Assert an artifact passes lineage verification. */
  toPassLineageCheck(): R;
  /** Assert a GHOSTDAG result colors this block as blue. */
  toBeBlueBlock(): R;
  /** Assert a GHOSTDAG result colors this block as red. */
  toBeRedBlock(): R;
  /** Assert a balance (bigint sompi) increased by at least `amount`. */
  toHaveIncreasedBy(amount: bigint): R;
  /** Assert a balance (bigint sompi) decreased by at least `amount`. */
  toHaveDecreasedBy(amount: bigint): R;
  /** Assert a simulated DAG has no red blocks. */
  toHaveNoRedBlocks(): R;
  /** Assert a simulated DAG has exactly N tips. */
  toHaveDagWidth(width: number): R;
}

declare module "vitest" {
  interface Assertion<T = any> extends HardKasMatchers<T> {}
  interface AsymmetricMatchersContaining extends HardKasMatchers {}
}

export const hardKasMatchers = {
  toBeAccepted(received: any) {
    const pass = received?.status === "accepted";
    return {
      pass,
      message: () => pass
        ? `Expected receipt NOT to be accepted, but status is "${received.status}"`
        : `Expected receipt to be accepted, but status is "${received?.status ?? "undefined"}"`,
    };
  },

  toBeFailed(received: any) {
    const pass = received?.status === "failed";
    return {
      pass,
      message: () => pass
        ? `Expected receipt NOT to be failed, but status is "failed"`
        : `Expected receipt to be failed, but status is "${received?.status ?? "undefined"}"`,
    };
  },

  toHaveValidTxId(received: any) {
    const txId = received?.txId || (typeof received === "string" ? received : "");
    const pass = typeof txId === "string" && (txId.startsWith("simtx_") || /^[0-9a-fA-F]{64}$/.test(txId));
    return {
      pass,
      message: () => pass
        ? `Expected "${txId}" NOT to be a valid txId`
        : `Expected "${txId}" to be a valid txId (starts with "simtx_" or is 64-char hex)`,
    };
  },

  toHaveValidContentHash(received: any) {
    const hash = received?.contentHash || (typeof received === "string" ? received : "");
    const pass = typeof hash === "string" && /^[0-9a-fA-F]{64}$/.test(hash);
    return {
      pass,
      message: () => pass
        ? `Expected "${hash}" NOT to be a valid content hash`
        : `Expected "${hash}" to be a valid content hash (64-char hex)`,
    };
  },

  toPassLineageCheck(received: any) {
    // For simulation purposes, we check if lineage array exists and is not empty if required
    const pass = Array.isArray(received?.lineage) && received.lineage.length > 0;
    return {
      pass,
      message: () => pass
        ? `Expected artifact NOT to pass lineage check`
        : `Expected artifact to pass lineage check (missing or empty lineage)`,
    };
  },

  toBeBlueBlock(received: any) {
    const pass = received?.isBlue === true;
    return {
      pass,
      message: () => pass
        ? `Expected block NOT to be blue, but it is`
        : `Expected block to be blue, but it is red or unknown`,
    };
  },

  toBeRedBlock(received: any) {
    const pass = received?.isBlue === false;
    return {
      pass,
      message: () => pass
        ? `Expected block NOT to be red, but it is`
        : `Expected block to be red, but it is blue or unknown`,
    };
  },

  toHaveIncreasedBy(received: any, amount: bigint) {
    const actual = BigInt(received);
    const pass = actual >= amount;
    return {
      pass,
      message: () => pass
        ? `Expected increase NOT to be at least ${amount}, but got ${actual}`
        : `Expected increase to be at least ${amount}, but got ${actual}`,
    };
  },

  toHaveDecreasedBy(received: any, amount: bigint) {
    const actual = BigInt(received);
    const pass = actual >= amount;
    return {
      pass,
      message: () => pass
        ? `Expected decrease NOT to be at least ${amount}, but got ${actual}`
        : `Expected decrease to be at least ${amount}, but got ${actual}`,
    };
  },

  toHaveNoRedBlocks(received: any) {
    const redBlocks = Object.values(received?.blocks || {}).filter((b: any) => b.isBlue === false);
    const pass = redBlocks.length === 0;
    return {
      pass,
      message: () => pass
        ? `Expected DAG to have red blocks, but it has none`
        : `Expected DAG to have no red blocks, but found ${redBlocks.length}`,
    };
  },

  toHaveDagWidth(received: any, width: number) {
    // Width is count of tips
    const allBlockIds = Object.keys(received?.blocks || {});
    const parentIds = new Set();
    for (const block of Object.values(received?.blocks || {}) as any) {
      for (const p of block.parents) {
        parentIds.add(p);
      }
    }
    const tips = allBlockIds.filter(id => !parentIds.has(id));
    const pass = tips.length === width;
    return {
      pass,
      message: () => pass
        ? `Expected DAG NOT to have width ${width}, but it does`
        : `Expected DAG to have width ${width}, but got ${tips.length}`,
    };
  },
};
