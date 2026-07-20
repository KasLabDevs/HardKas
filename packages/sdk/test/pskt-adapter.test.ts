import { describe, it, expect, beforeEach } from "vitest";
import { 
  PsktAdapterAlreadyRegisteredError,
  PsktRuntimeBindingNotFoundError,
  PsktAdapterMismatchError,
  PsktOperationUnsupportedError,
  PsktCapabilitiesChangedError,
  PortableSigningPayload,
  PsktRuntimeAdapter,
  PsktAdapterTrustProfile,
  PsktRuntimeCapabilities,
  PsktSignRequest,
  PsktInspection,
  PortableSigningSession
} from "@hardkas/core";
import { DefaultPsktAdapterRegistry } from "../src/pskt/registry.js";
import { UnavailablePsktAdapter } from "../src/pskt/adapters/unavailable.js";
import { WasmPsktAdapter } from "../src/pskt/adapters/wasm.js";
import { adapterRegistry, computeCapabilitiesHash, createSessionRevision } from "../src/pskt.js";
import { TxPlanArtifact } from "@hardkas/artifacts";

class MockPsktAdapter implements PsktRuntimeAdapter {
  constructor(public readonly id: string, public formats: string[] = ["pskt-binary-base64"]) {}
  
  readonly kind = "custom";
  readonly trustProfile: PsktAdapterTrustProfile = {
    processBoundary: "same-process",
    privateKeysLeaveProcess: false,
    payloadLeavesProcess: false,
    verifiesUnsignedTxIdentity: true,
    transportEncrypted: true,
    adapterAuthenticated: true
  };

  async probe(): Promise<PsktRuntimeCapabilities> {
    return {
      providerId: this.id,
      providerKind: this.kind,
      providerVersion: "1.0.0",
      formats: this.formats as any,
      operations: {
        export: true,
        import: true,
        inspect: true,
        sign: true,
        combine: true,
        finalize: true,
        extract: true
      }
    };
  }

  async exportPlan(plan: any): Promise<PortableSigningPayload> {
    return {
      format: "pskt-binary-base64",
      encoding: "base64",
      data: "mock-base64",
      byteLength: 11,
      payloadHash: "mock-hash"
    };
  }

  async importPayload(payload: PortableSigningPayload): Promise<PsktInspection> {
    if (payload.format === "pskb-bundle-json") throw new Error("Format rejected by adapter logic");
    return { unsignedTransactionId: "mock-tx-id" };
  }

  async sign(payload: PortableSigningPayload, request: PsktSignRequest): Promise<PortableSigningPayload> {
    return { ...payload, data: "signed-mock-base64" };
  }

  async combine(payloads: readonly PortableSigningPayload[]): Promise<PortableSigningPayload> {
    return { ...payloads[0], data: "combined-mock-base64" };
  }

  async finalize(payload: PortableSigningPayload): Promise<PortableSigningPayload> {
    return { ...payload, data: "finalized-mock-base64" };
  }

  async extract(payload: PortableSigningPayload): Promise<any> {
    return { isKaspaTx: true };
  }
}

describe("PSKT Runtime Adapter Boundary", () => {
  let registry: DefaultPsktAdapterRegistry;

  beforeEach(() => {
    registry = new DefaultPsktAdapterRegistry();
  });

  describe("Registry operations", () => {
    it("should allow registering adapters", () => {
      const adapter = new WasmPsktAdapter();
      registry.register(adapter);
      expect(registry.has("kaspa-wasm-local")).toBe(true);
      expect(registry.get("kaspa-wasm-local")).toBe(adapter);
    });

    it("should throw PSKT_ADAPTER_ALREADY_REGISTERED when registering duplicate IDs", () => {
      registry.register(new WasmPsktAdapter());
      expect(() => registry.register(new WasmPsktAdapter())).toThrow(PsktAdapterAlreadyRegisteredError);
    });

    it("should set and get default adapter", () => {
      registry.register(new WasmPsktAdapter("adapter-1"));
      registry.register(new WasmPsktAdapter("adapter-2"));
      
      registry.setDefault("adapter-1");
      expect(registry.getDefault().id).toBe("adapter-1");
      
      registry.setDefault("adapter-2");
      expect(registry.getDefault().id).toBe("adapter-2");
    });

    it("should throw PSKT_RUNTIME_BINDING_NOT_FOUND if default is not set or adapter doesn't exist", () => {
      expect(() => registry.getDefault()).toThrow(PsktRuntimeBindingNotFoundError);
      expect(() => registry.setDefault("non-existent")).toThrow(PsktRuntimeBindingNotFoundError);
      expect(() => registry.get("non-existent")).toThrow(PsktRuntimeBindingNotFoundError);
    });

    it("changing default should not affect existing sessions (semantic check)", () => {
      registry.register(new MockPsktAdapter("a1"));
      registry.register(new MockPsktAdapter("a2"));
      registry.setDefault("a1");
      
      const currentDefault = registry.getDefault();
      expect(currentDefault.id).toBe("a1");

      registry.setDefault("a2");
      expect(currentDefault.id).toBe("a1"); // the retrieved reference is still a1
    });

    it("unregistering an adapter should make it unavailable and throw explicitly", () => {
      registry.register(new MockPsktAdapter("a1"));
      registry.setDefault("a1");
      registry.unregister("a1");
      
      expect(() => registry.get("a1")).toThrow(PsktRuntimeBindingNotFoundError);
      expect(() => registry.getDefault()).toThrow(PsktRuntimeBindingNotFoundError);
    });
  });

  describe("Capabilities and Session binding", () => {
    it("should correctly compute capabilities hash and detect changes", async () => {
      const adapter = new MockPsktAdapter("mock-1");
      const caps = await adapter.probe();
      const hash = computeCapabilitiesHash(caps);
      
      // mutate capabilities conceptually by returning different from probe
      adapter.formats = ["pskt-binary-base64", "pskb-bundle-json"];
      const newCaps = await adapter.probe();
      const newHash = computeCapabilitiesHash(newCaps);
      
      expect(hash).not.toBe(newHash);
    });
  });

  describe("Unavailable adapter", () => {
    it("should throw PSKT_OPERATION_UNSUPPORTED for all operations", async () => {
      const unavailable = new UnavailablePsktAdapter();
      const payload: PortableSigningPayload = {
        format: "pskt-binary-base64",
        encoding: "base64",
        data: "",
        byteLength: 0,
        payloadHash: ""
      };

      await expect(unavailable.exportPlan({} as any)).rejects.toThrow(PsktOperationUnsupportedError);
      await expect(unavailable.importPayload(payload)).rejects.toThrow(PsktOperationUnsupportedError);
      await expect(unavailable.sign(payload, { participantId: "p1" })).rejects.toThrow(PsktOperationUnsupportedError);
      await expect(unavailable.combine([payload])).rejects.toThrow(PsktOperationUnsupportedError);
      await expect(unavailable.finalize(payload)).rejects.toThrow(PsktOperationUnsupportedError);
      await expect(unavailable.extract(payload)).rejects.toThrow(PsktOperationUnsupportedError);
    });
  });
});
