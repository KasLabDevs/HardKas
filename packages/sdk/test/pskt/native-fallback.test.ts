import { describe, it, expect, vi } from 'vitest';
import { registerNativeAdapter, capabilities } from '../../src/pskt.js';
import { DefaultPsktAdapterRegistry } from '../../src/pskt/registry.js';
import { NativePsktAdapter } from '../../src/pskt/adapters/native.js';
import * as adapterNativeModule from '../../src/pskt/adapters/native.js';

describe('Native Adapter Fallback', () => {
  it('should not throw and should not register if native module is missing', async () => {
    // Mock the import of the native adapter to throw (simulating missing native module)
    // Actually we can just mock NativePsktAdapter probe to throw or return limitation
    vi.spyOn(adapterNativeModule, 'NativePsktAdapter').mockImplementation(() => {
      return {
        id: 'native',
        probe: async () => {
          throw new Error('Cannot find module');
        }
      } as any;
    });

    const success = await registerNativeAdapter();
    expect(success).toBe(false);

    // Let's also check when it returns limitations
    vi.spyOn(adapterNativeModule, 'NativePsktAdapter').mockImplementation(() => {
      return {
        id: 'native',
        probe: async () => ({
          bridgeVersion: 'unknown',
          limitations: ['NATIVE_MODULE_NOT_FOUND']
        })
      } as any;
    });

    const success2 = await registerNativeAdapter();
    expect(success2).toBe(false);
  });
});
