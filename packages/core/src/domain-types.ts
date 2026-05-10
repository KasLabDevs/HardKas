/**
 * Lightweight branded/nominal types for domain-critical strings/numbers.
 * 
 * These types prevent accidental misuse of raw primitives across the monorepo.
 * Branded types remain plain strings/numbers at runtime.
 */

/**
 * A Brand type that adds a unique property to a primitive type.
 */
export type Brand<T, Name extends string> = T & { readonly __brand: Name };

/**
 * A canonical 32-byte hash (64 characters hex) representing a Kaspa Transaction.
 */
export type TxId = Brand<string, "TxId">;

/**
 * A unique identifier for a HardKAS Artifact.
 */
export type ArtifactId = Brand<string, "ArtifactId">;

/**
 * A SHA-256 or similar content hash.
 */
export type ContentHash = Brand<string, "ContentHash">;

/**
 * A correlation ID for tracking lineage across operations.
 */
export type LineageId = Brand<string, "LineageId">;

/**
 * A unique identifier for a Workflow execution.
 */
export type WorkflowId = Brand<string, "WorkflowId">;

/**
 * A unique identifier for an Event.
 */
export type EventId = Brand<string, "EventId">;

/**
 * A correlation ID that spans across multiple services/operations.
 */
export type CorrelationId = Brand<string, "CorrelationId">;

/**
 * A Kaspa Address (e.g. kaspa:..., kaspatest:...).
 */
export type KaspaAddress = Brand<string, "KaspaAddress">;

/**
 * A unique identifier for an RPC endpoint.
 */
export type RpcEndpointId = Brand<string, "RpcEndpointId">;

/**
 * A Kaspa Network Identifier (e.g. mainnet, testnet-11).
 */
export type NetworkId = Brand<string, "NetworkId">;

/**
 * A unique sequence number for an event within a stream or store.
 */
export type EventSequence = Brand<number, "EventSequence">;

/**
 * A Difficulty Adjustment Algorithm (DAA) score.
 * Support both number and bigint for compatibility.
 */
export type DaaScore = Brand<number | bigint, "DaaScore">;

// Helpers
export const asTxId = (id: string) => id as TxId;
export const asArtifactId = (id: string) => id as ArtifactId;
export const asContentHash = (hash: string) => hash as ContentHash;
export const asLineageId = (id: string) => id as LineageId;
export const asWorkflowId = (id: string) => id as WorkflowId;
export const asEventId = (id: string) => id as EventId;
export const asCorrelationId = (id: string) => id as CorrelationId;
export const asKaspaAddress = (addr: string) => addr as KaspaAddress;
export const asRpcEndpointId = (id: string) => id as RpcEndpointId;
export const asNetworkId = (id: string) => id as NetworkId;
export const asEventSequence = (seq: number) => seq as EventSequence;
export const asDaaScore = (score: number | bigint) => score as DaaScore;

// TODO: Add validation rules for each type in future phases.
