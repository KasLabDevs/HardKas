import { 
  PsktRuntimeAdapter,
  PsktRuntimeBindingNotFoundError,
  PsktAdapterAlreadyRegisteredError
} from "@hardkas/core";

export interface PsktAdapterRegistry {
  register(adapter: PsktRuntimeAdapter): void;
  unregister(adapterId: string): void;
  get(adapterId: string): PsktRuntimeAdapter;
  has(adapterId: string): boolean;
  list(): readonly PsktRuntimeAdapter[];
  setDefault(adapterId: string): void;
  getDefault(): PsktRuntimeAdapter;
}

export class DefaultPsktAdapterRegistry implements PsktAdapterRegistry {
  private readonly adapters = new Map<string, PsktRuntimeAdapter>();
  private defaultAdapterId: string | undefined = undefined;

  register(adapter: PsktRuntimeAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new PsktAdapterAlreadyRegisteredError(
        `Adapter with ID '${adapter.id}' is already registered.`,
        { adapterId: adapter.id }
      );
    }
    this.adapters.set(adapter.id, adapter);
  }

  unregister(adapterId: string): void {
    this.adapters.delete(adapterId);
    if (this.defaultAdapterId === adapterId) {
      this.defaultAdapterId = undefined;
    }
  }

  get(adapterId: string): PsktRuntimeAdapter {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new PsktRuntimeBindingNotFoundError(
        `Runtime binding not found for adapter ID: '${adapterId}'`,
        { adapterId }
      );
    }
    return adapter;
  }

  has(adapterId: string): boolean {
    return this.adapters.has(adapterId);
  }

  list(): readonly PsktRuntimeAdapter[] {
    return Array.from(this.adapters.values());
  }

  setDefault(adapterId: string): void {
    if (!this.has(adapterId)) {
      throw new PsktRuntimeBindingNotFoundError(
        `Cannot set default to unregistered adapter ID: '${adapterId}'`,
        { adapterId }
      );
    }
    this.defaultAdapterId = adapterId;
  }

  getDefault(): PsktRuntimeAdapter {
    if (!this.defaultAdapterId) {
      throw new PsktRuntimeBindingNotFoundError(
        "No default PSKT runtime adapter is configured.",
        { adapterId: "default" }
      );
    }
    return this.get(this.defaultAdapterId);
  }
}
