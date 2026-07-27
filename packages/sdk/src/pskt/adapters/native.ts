import {
  PsktRuntimeAdapter,
  PsktAdapterTrustProfile,
  PsktRuntimeCapabilities,
  PsktOperationUnsupportedError,
  PortableSigningPayload,
  PsktSignRequest,
  PsktInspection
} from "@hardkas/core";

interface NativeExtractedTransaction {
  readonly version: number;
  readonly mass: string;
  readonly lockTime: string;
  readonly inputs: readonly {
    readonly previousOutpoint: {
      readonly transactionId: string;
      readonly index: number;
    };
    readonly signatureScript: string;
    readonly sequence: string;
    readonly sigOpCount: number;
  }[];
  readonly outputs: readonly {
    readonly value: string;
    readonly scriptPublicKey: {
      readonly version: number;
      readonly script: string;
    };
  }[];
  readonly payload: string;
  readonly subnetworkId: string;
}

function validateNativeTransaction(tx: any): boolean {
  if (typeof tx !== 'object' || tx === null) return false;
  if (typeof tx.version !== 'number') return false;
  if (typeof tx.mass !== 'string') return false;
  if (typeof tx.lock_time !== 'string') return false;
  if (!Array.isArray(tx.inputs) || !Array.isArray(tx.outputs)) return false;
  if (typeof tx.payload !== 'string') return false;
  if (typeof tx.subnetwork_id !== 'string') return false;
  
  for (const input of tx.inputs) {
    if (typeof input.previous_outpoint?.transaction_id !== 'string') return false;
    if (typeof input.previous_outpoint?.index !== 'number') return false;
    if (typeof input.signature_script !== 'string') return false;
    if (typeof input.sequence !== 'string') return false;
    if (typeof input.sig_op_count !== 'number') return false;
  }
  
  for (const output of tx.outputs) {
    if (typeof output.value !== 'string') return false;
    if (typeof output.script_public_key?.version !== 'number') return false;
    if (typeof output.script_public_key?.script !== 'string') return false;
  }
  
  return true;
}

export class NativePsktAdapter implements PsktRuntimeAdapter {
  readonly id: string;
  readonly kind = "native-bridge";
  
  readonly trustProfile: PsktAdapterTrustProfile = {
    processBoundary: "same-process",
    privateKeysLeaveProcess: false,
    payloadLeavesProcess: false,
    verifiesUnsignedTxIdentity: true,
    transportEncrypted: true,
    adapterAuthenticated: true
  };

  private addon: any = null;
  private loadError: any = null;

  constructor(id: string = "rust-pskt-native") {
    this.id = id;
  }

  private async loadAddon() {
    if (this.addon || this.loadError) return;
    try {
      // @ts-ignore
      this.addon = await import("@hardkas/pskt-native");
    } catch (e: any) {
      this.loadError = e;
    }
  }

  async probe(): Promise<PsktRuntimeCapabilities> {
    await this.loadAddon();

    if (!this.addon) {
      return {
        providerId: this.id,
        providerKind: this.kind,
        providerVersion: "unavailable",
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
        limitations: ["NATIVE_ADDON_NOT_INSTALLED", this.loadError?.message || "Unknown load error"]
      };
    }

    try {
      const probeStr = this.addon.psktProbe();
      const probeResult = JSON.parse(probeStr);
      
      return {
        providerId: this.id,
        providerKind: this.kind,
        providerVersion: probeResult.bridge_version,
        providerHash: probeResult.rusty_kaspa_commit,
        formats: ["pskt-binary-base64"],
        operations: {
          export: false,
          import: false,
          inspect: probeResult.operations.inspect,
          sign: probeResult.operations.sign,
          combine: probeResult.operations.combine,
          finalize: probeResult.operations.finalize,
          extract: probeResult.operations.extract
        }
      };
    } catch (e: any) {
      return {
        providerId: this.id,
        providerKind: this.kind,
        providerVersion: "error",
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
        limitations: ["NATIVE_ADDON_LOAD_FAILED", e.message]
      };
    }
  }

  async exportPlan(plan: any): Promise<PortableSigningPayload> {
    throw new PsktOperationUnsupportedError("Native runtime does not support PSKT export yet", {
      adapterId: this.id,
      operation: "export"
    });
  }

  async importPayload(payload: PortableSigningPayload): Promise<PsktInspection> {
    const caps = await this.probe();
    if (!caps.operations.inspect) {
      throw new PsktOperationUnsupportedError("Native runtime does not support PSKT import", {
        adapterId: this.id,
        operation: "import",
        payloadHash: payload.payloadHash
      });
    }

    try {
      const resultStr = this.addon.psktInspect(payload.data);
      const result = JSON.parse(resultStr);
      
      return {
        unsignedTransactionId: result.unsignedTransactionIdentity,
        // fee and mass are not extracted by Rust inspect yet
      };
    } catch (e: any) {
      throw new Error(`Native PSKT inspect failed: ${e.message}`);
    }
  }

  async sign(payload: PortableSigningPayload, request: PsktSignRequest): Promise<PortableSigningPayload> {
    const caps = await this.probe();
    if (!caps.operations.sign) {
      throw new PsktOperationUnsupportedError("Native runtime does not support PSKT sign", {
        adapterId: this.id,
        operation: "sign",
        payloadHash: payload.payloadHash
      });
    }

    if (!request.inputIndexes || request.inputIndexes.length === 0) {
      throw new Error("PSKT_SIGNING_INPUTS_REQUIRED: inputIndexes cannot be empty");
    }

    if (!request.keyMaterial) {
      throw new Error("PSKT_SIGNING_KEY_REQUIRED: keyMaterial is required for native signing");
    }

    const keyBuf = Buffer.from(request.keyMaterial);
    try {
      const requestJson = JSON.stringify({ inputIndexes: request.inputIndexes });
      const resultStr = this.addon.psktSign(
        payload.data, 
        [keyBuf],
        requestJson
      );
      const result = JSON.parse(resultStr);

      if (result.error) {
         // handle structured error if we return it directly, but pskt_sign throws napi Error for Rust Err
      }

      return {
        format: "pskt-binary-base64",
        encoding: "base64",
        data: result.payloadBase64,
        payloadHash: result.outputPayloadHash,
        byteLength: Buffer.from(result.payloadBase64, "base64").length
      };
    } catch (e: any) {
      // The Rust side returns a JSON string inside the Error message if it's a structured error
      try {
        const parsedErr = JSON.parse(e.message);
        throw new Error(`${parsedErr.code}: ${parsedErr.message}`);
      } catch {
        throw new Error(`Native PSKT sign failed: ${e.message}`);
      }
    } finally {
      if (request.keyMaterial) {
        request.keyMaterial.fill(0);
      }
      keyBuf.fill(0);
    }
  }

  async combine(payloads: readonly PortableSigningPayload[]): Promise<PortableSigningPayload> {
    const caps = await this.probe();
    if (!caps.operations.combine) {
      throw new PsktOperationUnsupportedError("Native runtime does not support PSKT combine", {
        adapterId: this.id,
        operation: "combine"
      });
    }

    try {
      const payloadsBase64Json = JSON.stringify(payloads.map(p => p.data));
      const resultStr = this.addon.psktCombine(payloadsBase64Json);
      const result = JSON.parse(resultStr);

      return {
        format: "pskt-binary-base64",
        encoding: "base64",
        data: result.payloadBase64,
        payloadHash: result.outputPayloadHash,
        byteLength: Buffer.from(result.payloadBase64, "base64").length
      };
    } catch (e: any) {
      throw new Error(`Native PSKT combine failed: ${e.message}`);
    }
  }

  async finalize(payload: PortableSigningPayload): Promise<PortableSigningPayload> {
    const caps = await this.probe();
    if (!caps.operations.finalize) {
      throw new PsktOperationUnsupportedError("Native runtime does not support PSKT finalize", {
        adapterId: this.id,
        operation: "finalize",
        payloadHash: payload.payloadHash
      });
    }

    try {
      const resultStr = this.addon.psktFinalize(payload.data);
      const result = JSON.parse(resultStr);

      return {
        format: "pskt-binary-base64",
        encoding: "base64",
        data: result.payloadBase64,
        payloadHash: result.outputPayloadHash,
        byteLength: Buffer.from(result.payloadBase64, "base64").length
      };
    } catch (e: any) {
      throw new Error(`Native PSKT finalize failed: ${e.message}`);
    }
  }

  async extract(payload: PortableSigningPayload, networkId: string): Promise<any> {
    const caps = await this.probe();
    if (!caps.operations.extract) {
      throw new PsktOperationUnsupportedError("Native runtime does not support PSKT extract", {
        adapterId: this.id,
        operation: "extract",
        payloadHash: payload.payloadHash
      });
    }

    try {
      const resultStr = this.addon.psktExtract(payload.data, networkId);
      const result = JSON.parse(resultStr);

      const parsedTx = JSON.parse(result.transactionJson);
      
      if (!validateNativeTransaction(parsedTx)) {
        throw new Error("Native PSKT extract failed: returned transaction does not match NativeExtractedTransaction schema");
      }

      const mappedTx: NativeExtractedTransaction = {
        version: parsedTx.version,
        mass: parsedTx.mass,
        lockTime: parsedTx.lock_time,
        inputs: parsedTx.inputs.map((i: any) => ({
          previousOutpoint: {
            transactionId: i.previous_outpoint.transaction_id,
            index: i.previous_outpoint.index
          },
          signatureScript: i.signature_script,
          sequence: i.sequence,
          sigOpCount: i.sig_op_count
        })),
        outputs: parsedTx.outputs.map((o: any) => ({
          value: o.value,
          scriptPublicKey: {
            version: o.script_public_key.version,
            script: o.script_public_key.script
          }
        })),
        payload: parsedTx.payload,
        subnetworkId: parsedTx.subnetwork_id
      };

      return {
        transaction: mappedTx,
        transactionId: result.transactionId,
        transactionVersion: result.transactionVersion,
        networkId: result.networkId,
        sourcePayloadHash: result.sourcePayloadHash
      };
    } catch (e: any) {
      throw new Error(`Native PSKT extract failed: ${e.message}`);
    }
  }
}
