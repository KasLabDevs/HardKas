import { useState, useEffect, useCallback } from "react";
import { useHardKAS } from "../provider.js";
import type { HardKASResponse } from "@hardkas/client";

export interface UseQueryOptions {
  enabled?: boolean;
}

export function useQuery<T>(
  queryFn: (client: ReturnType<typeof useHardKAS>) => Promise<HardKASResponse<T>>,
  deps: any[] = [],
  options: UseQueryOptions = { enabled: true }
) {
  const client = useHardKAS();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await queryFn(client);
      if (response.ok) {
        setData(response.data);
      } else {
        setError(response);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [client, ...deps]);

  useEffect(() => {
    if (options.enabled) {
      refetch();
    }
  }, [refetch, options.enabled]);

  return { data, error, loading, refetch };
}
