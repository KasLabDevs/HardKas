/**
 * PSKT (Partially Signed Kaspa Transaction) schemas and types.
 * Defines the canonical HardKAS envelope for Portable Signing Sessions.
 */

export interface PsktRuntimeCapabilities {
  readonly provider: string;
  readonly version: string;
  readonly available: boolean;
  readonly serialize: boolean;
  readonly deserialize: boolean;
  readonly combine: boolean;
  readonly finalize: boolean;
  readonly extract: boolean;
}

export type PsktEncoding = "pskt-binary-base64" | "pskb-bundle-json";

export type PortableSigningPayload =
  | {
      readonly format: "pskt-binary-base64";
      readonly encoding: "base64";
      readonly data: string;
      readonly byteLength: number;
      readonly payloadHash: string;
    }
  | {
      readonly format: "pskb-bundle-json";
      readonly encoding: "canonical-json";
      readonly data: unknown;
      readonly payloadHash: string;
    };

export type SigningSessionState =
  | "created"
  | "partially-signed"
  | "ready-to-finalize"
  | "finalized"
  | "extracted"
  | "cancelled"
  | "blocked-by-runtime";

export interface SigningParticipant {
  readonly id: string;
  readonly role?: string;
  readonly publicKey?: string;
  readonly keyFingerprint?: string;
  readonly derivationPath?: string;
  readonly deviceType?: "software" | "hardware" | "air-gapped" | "remote";
}

export interface InputSignatureRequirement {
  readonly inputIndex: number;
  readonly threshold: number;
  readonly eligibleParticipants: readonly string[];
  readonly fulfilledBy: readonly string[];
}

export interface SessionAttestation {
  readonly participantId: string;
  readonly action: "sign" | "merge" | "finalize" | "extract";
  readonly previousPayloadHash: string;
  readonly resultingPayloadHash: string;
  readonly adapter: string;
  readonly adapterVersion?: string;
  readonly timestamp?: string;
}

export interface PortableSigningSession {
  readonly kind: "hardkas-portable-signing-session";
  readonly schemaVersion: 1;

  readonly sessionId: string;
  readonly revision: number;
  readonly parentRevisionHash?: string;

  readonly planId: string;
  readonly networkId: string;
  readonly unsignedTransactionId?: string;

  readonly state: SigningSessionState;
  readonly payload: PortableSigningPayload;

  readonly participants: readonly SigningParticipant[];
  readonly requirements: readonly InputSignatureRequirement[];
  readonly attestations: readonly SessionAttestation[];

  readonly runtime: PsktRuntimeCapabilities;

  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createdAt?: string;
  readonly updatedAt?: string;

  readonly integrityHash: string;
}
