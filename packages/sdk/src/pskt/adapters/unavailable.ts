import {
  PsktRuntimeAdapter,
  PsktAdapterTrustProfile,
  PsktRuntimeCapabilities,
  PsktOperationUnsupportedError,
  PortableSigningPayload,
  PsktSignRequest,
  PsktInspection
} from "@hardkas/core";

export class UnavailablePsktAdapter implements PsktRuntimeAdapter {
  readonly id = "unavailable";
  readonly kind = "unavailable";
  
  readonly trustProfile: PsktAdapterTrustProfile = {
    processBoundary: "same-process",
    privateKeysLeaveProcess: false,
    payloadLeavesProcess: false,
    verifiesUnsignedTxIdentity: false,
    transportEncrypted: true,
    adapterAuthenticated: true
  };

  private readonly reason: string;

  constructor(options?: { reason?: string }) {
    this.reason = options?.reason || "PSKT adapter not configured or unavailable";
  }

  async probe(): Promise<PsktRuntimeCapabilities> {
    return {
      providerId: this.id,
      providerKind: this.kind,
      providerVersion: "0.0.0",
      formats: [],
      operations: {
        export: false,
        import: false,
        inspect: false,
        sign: false,
        combine: false,
        finalize: false,
        extract: false
      },
      limitations: [this.reason]
    };
  }

  async exportPlan(plan: any): Promise<PortableSigningPayload> {
    throw new PsktOperationUnsupportedError("Export is unsupported by the unavailable adapter", {
      adapterId: this.id,
      operation: "export"
    });
  }

  async importPayload(payload: PortableSigningPayload): Promise<PsktInspection> {
    throw new PsktOperationUnsupportedError("Import is unsupported by the unavailable adapter", {
      adapterId: this.id,
      operation: "import",
      payloadHash: payload.payloadHash
    });
  }

  async sign(payload: PortableSigningPayload, request: PsktSignRequest): Promise<PortableSigningPayload> {
    throw new PsktOperationUnsupportedError("Sign is unsupported by the unavailable adapter", {
      adapterId: this.id,
      operation: "sign",
      payloadHash: payload.payloadHash
    });
  }

  async combine(payloads: readonly PortableSigningPayload[]): Promise<PortableSigningPayload> {
    throw new PsktOperationUnsupportedError("Combine is unsupported by the unavailable adapter", {
      adapterId: this.id,
      operation: "combine"
    });
  }

  async finalize(payload: PortableSigningPayload): Promise<PortableSigningPayload> {
    throw new PsktOperationUnsupportedError("Finalize is unsupported by the unavailable adapter", {
      adapterId: this.id,
      operation: "finalize",
      payloadHash: payload.payloadHash
    });
  }

  async extract(payload: PortableSigningPayload): Promise<any> {
    throw new PsktOperationUnsupportedError("Extract is unsupported by the unavailable adapter", {
      adapterId: this.id,
      operation: "extract",
      payloadHash: payload.payloadHash
    });
  }
}
