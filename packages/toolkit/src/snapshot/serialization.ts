import { SnapshotState } from "./types.js";

/**
 * Custom JSON Replacer to safely serialize BigInt values.
 */
export function snapshotReplacer(key: string, value: any): any {
    if (typeof value === "bigint") {
        return { $bigint: value.toString() };
    }
    return value;
}

/**
 * Custom JSON Reviver to safely deserialize BigInt values.
 */
export function snapshotReviver(key: string, value: any): any {
    if (value !== null && typeof value === "object" && typeof value.$bigint === "string") {
        return BigInt(value.$bigint);
    }
    return value;
}
