import { Hardkas, pskt } from "@hardkas/sdk";
import fs from "node:fs/promises";
import path from "node:path";

export interface PsktSignerProvider {
  readonly id: string;

  sign(request: {
    readonly payload: any;
    readonly inputIndexes: readonly number[];
    readonly expectedUnsignedTransactionIdentity: string;
  }): Promise<any>;
}

export class HardwareSimulatorSigner implements PsktSignerProvider {
  constructor(
    public readonly id: string,
    private readonly privateKeyHex: string
  ) {}

  async sign(request: {
    readonly payload: any;
    readonly inputIndexes: readonly number[];
    readonly expectedUnsignedTransactionIdentity: string;
  }): Promise<any> {
    console.log(`[HardwareSimulatorSigner:${this.id}] Authorizing inputs [${request.inputIndexes.join(", ")}]...`);
    
    // In a real hardware wallet, the private key NEVER leaves the device.
    // The device computes the transaction hash internally, asks the user for confirmation, and returns the signature.
    // Here, to mock this, we will use the native bridge temporarily just to compute the signature,
    // but the private key stays confined in this simulator instance.
    
    const requestOptions = {
      participantId: this.id,
      keyMaterialRef: `memory://${this.privateKeyHex}`, // Mock keystore resolution mapping
      inputIndexes: request.inputIndexes
    };

    // We instantiate the Native adapter manually just for signing
    // and pass the payload to it, bypassing the global SDK context if needed,
    // or using a specific utility. We'll use the adapter explicitly.
    const NativeAdapter = (await import("@hardkas/sdk")).pskt.adapterRegistry.get("rust-pskt-native");
    if (!NativeAdapter) throw new Error("rust-pskt-native adapter not found");

    // Overload resolveKeyMaterial just for this simulation to return our private key as Uint8Array
    const originalResolve = (NativeAdapter as any).resolveKeyMaterial;
    (NativeAdapter as any).resolveKeyMaterial = async (ref: string) => {
      if (ref === requestOptions.keyMaterialRef) {
        return Buffer.from(this.privateKeyHex, "hex");
      }
      if (originalResolve) return originalResolve(ref);
      throw new Error(`Unresolved key material ref: ${ref}`);
    };

    try {
      // Simulate hardware signing
      const signedSession = await NativeAdapter.sign(request.payload, {
        participantId: requestOptions.participantId,
        keyMaterialRef: requestOptions.keyMaterialRef,
        inputIndexes: requestOptions.inputIndexes,
        keyMaterial: new Uint8Array(Buffer.from(this.privateKeyHex, "hex"))
      });

      // Verify the unsigned transaction identity hasn't changed (integrity check)
      const inspection = await NativeAdapter.importPayload(signedSession);
      if (inspection.unsignedTransactionId !== request.expectedUnsignedTransactionIdentity) {
         throw new Error(`Hardware simulator rejected signing: identity changed. Expected ${request.expectedUnsignedTransactionIdentity}, got ${inspection.unsignedTransactionId}`);
      }

      console.log(`[HardwareSimulatorSigner:${this.id}] Signatures applied successfully.`);
      return signedSession;
    } finally {
      // Restore original resolver
      if (originalResolve) {
        (NativeAdapter as any).resolveKeyMaterial = originalResolve;
      }
    }
  }
}
