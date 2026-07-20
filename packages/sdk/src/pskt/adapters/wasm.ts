import {
  PsktRuntimeAdapter,
  PsktAdapterTrustProfile,
  PsktRuntimeCapabilities,
  PsktOperationUnsupportedError,
  PortableSigningPayload,
  PsktSignRequest,
  PsktInspection
} from "@hardkas/core";

export class WasmPsktAdapter implements PsktRuntimeAdapter {
  readonly id: string;
  readonly kind = "wasm";
  
  readonly trustProfile: PsktAdapterTrustProfile = {
    processBoundary: "same-process",
    privateKeysLeaveProcess: false,
    payloadLeavesProcess: false,
    verifiesUnsignedTxIdentity: true,
    transportEncrypted: true,
    adapterAuthenticated: true
  };

  constructor(id: string = "kaspa-wasm-local") {
    this.id = id;
  }

  async probe(): Promise<PsktRuntimeCapabilities> {
    let hasPskt = false;
    try {
      const kaspaWasm = await import("kaspa-wasm");
      hasPskt = "PSKT" in kaspaWasm;
    } catch (e) {
      // Wasm runtime not available or failed to load
    }

    return {
      providerId: this.id,
      providerKind: this.kind,
      providerVersion: "resolved-at-runtime",
      formats: ["pskt-binary-base64"],
      operations: {
        export: hasPskt, // mapped directly if available
        import: hasPskt,
        inspect: hasPskt,
        sign: hasPskt,
        combine: hasPskt,
        finalize: hasPskt,
        extract: hasPskt
      }
    };
  }

  async exportPlan(plan: any): Promise<PortableSigningPayload> {
    const caps = await this.probe();
    if (!caps.operations.export) {
      throw new PsktOperationUnsupportedError("WASM runtime does not support PSKT export", {
        adapterId: this.id,
        operation: "export"
      });
    }
    // TODO: implement real export mapping
    throw new Error("WasmPsktAdapter.exportPlan not yet implemented");
  }

  async importPayload(payload: PortableSigningPayload): Promise<PsktInspection> {
    const caps = await this.probe();
    if (!caps.operations.import) {
      throw new PsktOperationUnsupportedError("WASM runtime does not support PSKT import", {
        adapterId: this.id,
        operation: "import",
        payloadHash: payload.payloadHash
      });
    }
    // TODO: implement real import mapping
    throw new Error("WasmPsktAdapter.importPayload not yet implemented");
  }

  async sign(payload: PortableSigningPayload, request: PsktSignRequest): Promise<PortableSigningPayload> {
    const caps = await this.probe();
    if (!caps.operations.sign) {
      throw new PsktOperationUnsupportedError("WASM runtime does not support PSKT sign", {
        adapterId: this.id,
        operation: "sign",
        payloadHash: payload.payloadHash
      });
    }
    // TODO: implement real sign mapping
    throw new Error("WasmPsktAdapter.sign not yet implemented");
  }

  async combine(payloads: readonly PortableSigningPayload[]): Promise<PortableSigningPayload> {
    const caps = await this.probe();
    if (!caps.operations.combine) {
      throw new PsktOperationUnsupportedError("WASM runtime does not support PSKT combine", {
        adapterId: this.id,
        operation: "combine"
      });
    }
    // TODO: implement real combine mapping
    throw new Error("WasmPsktAdapter.combine not yet implemented");
  }

  async finalize(payload: PortableSigningPayload): Promise<PortableSigningPayload> {
    const caps = await this.probe();
    if (!caps.operations.finalize) {
      throw new PsktOperationUnsupportedError("WASM runtime does not support PSKT finalize", {
        adapterId: this.id,
        operation: "finalize",
        payloadHash: payload.payloadHash
      });
    }
    // TODO: implement real finalize mapping
    throw new Error("WasmPsktAdapter.finalize not yet implemented");
  }

  async extract(payload: PortableSigningPayload): Promise<any> {
    const caps = await this.probe();
    if (!caps.operations.extract) {
      throw new PsktOperationUnsupportedError("WASM runtime does not support PSKT extract", {
        adapterId: this.id,
        operation: "extract",
        payloadHash: payload.payloadHash
      });
    }
    // TODO: implement real extract mapping
    throw new Error("WasmPsktAdapter.extract not yet implemented");
  }
}
