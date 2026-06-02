import { useState, useCallback } from 'react';
import { useHardKAS } from '../provider.js';
import type { HardKASResponse } from '@hardkas/client';

export function useMutation<TVariables, TData>(
  mutationFn: (client: ReturnType<typeof useHardKAS>, variables: TVariables) => Promise<HardKASResponse<TData>>
) {
  const client = useHardKAS();
  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = useCallback(async (variables: TVariables) => {
    setLoading(true);
    setError(null);
    try {
      const response = await mutationFn(client, variables);
      if (response.ok) {
        setData(response.data);
      } else {
        setError(response);
      }
      return response;
    } catch (err) {
      setError(err);
      return { ok: false, code: 'UNEXPECTED_ERROR', message: String(err) } as any;
    } finally {
      setLoading(false);
    }
  }, [client, mutationFn]);

  return { data, error, loading, execute };
}
