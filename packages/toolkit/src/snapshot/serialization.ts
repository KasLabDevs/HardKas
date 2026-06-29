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

/**
 * Serializes a SnapshotState map to a string safely supporting BigInt.
 */
export function serializeState(state: Record<string, SnapshotState>): string {
    return JSON.stringify(state, snapshotReplacer, 2);
}

/**
 * Deserializes a SnapshotState map from a string safely supporting BigInt.
 */
export function deserializeState(data: string): Record<string, SnapshotState> {
    return JSON.parse(data, snapshotReviver);
}
