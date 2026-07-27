import type { PortableSigningPayload, PsktEncoding, PsktRuntimeCapabilities } from "./pskt.js";

export type PsktAdapterKind =
  | "wasm"
  | "native-bridge"
  | "local-rpc"
  | "custom"
  | "unavailable";

export type PsktOperation =
  | "export"
  | "import"
  | "inspect"
  | "sign"
  | "combine"
  | "finalize"
  | "extract";

export interface PsktAdapterTrustProfile {
  readonly processBoundary:
    | "same-process"
    | "child-process"
    | "local-rpc"
    | "remote-rpc";

  readonly privateKeysLeaveProcess: boolean;
  readonly payloadLeavesProcess: boolean;
  readonly verifiesUnsignedTxIdentity: boolean;

  readonly transportEncrypted: boolean;
  readonly adapterAuthenticated: boolean;
}

export interface PsktSignRequest {
  readonly participantId: string;
  readonly derivationPath?: string;
  readonly keyMaterialRef?: string;
  readonly keyMaterial?: Uint8Array;
  readonly inputIndexes: readonly number[];
}

export interface PsktInspection {
  readonly unsignedTransactionId?: string;
  readonly fee?: string | bigint;
  readonly mass?: string | bigint;
}

export interface PsktRuntimeAdapter {
  readonly id: string;
  readonly kind: PsktAdapterKind;
  readonly trustProfile: PsktAdapterTrustProfile;

  probe(): Promise<PsktRuntimeCapabilities>;

  exportPlan(
    plan: any,
  ): Promise<PortableSigningPayload>;

  importPayload(
    payload: PortableSigningPayload,
  ): Promise<PsktInspection>;

  sign(
    payload: PortableSigningPayload,
    request: PsktSignRequest,
  ): Promise<PortableSigningPayload>;

  combine(
    payloads: readonly PortableSigningPayload[],
  ): Promise<PortableSigningPayload>;

  finalize(
    payload: PortableSigningPayload,
  ): Promise<PortableSigningPayload>;

  extract(
    payload: PortableSigningPayload,
    networkId: string
  ): Promise<any>;
}
