import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { HardKASProvider, useWallet } from '../src/index.js';

describe('HardKAS React Hooks', () => {
  it('should throw an error if used outside of HardKASProvider', () => {
    expect(() => {
      renderHook(() => useWallet('alice'));
    }).toThrow('useHardKAS must be used within a HardKASProvider');
  });

  it('should fetch wallet data when used inside HardKASProvider', async () => {
    // Mock fetch for the client
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: { name: 'alice', address: 'kaspa:alice123' } }),
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <HardKASProvider baseUrl="http://127.0.0.1:7420">
        {children}
      </HardKASProvider>
    );

    const { result } = renderHook(() => useWallet('alice'), { wrapper });

    // Initially loading
    expect(result.current.loading).toBe(true);

    // Wait for the fetch to resolve
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual({ name: 'alice', address: 'kaspa:alice123' });
    expect(result.current.error).toBeNull();
  });
});
