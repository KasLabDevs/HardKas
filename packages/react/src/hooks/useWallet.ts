import { useQuery } from './useQuery.js';

export function useWallet(address: string | undefined) {
  return useQuery(
    (client) => client.getWallet(address!),
    [address],
    { enabled: !!address }
  );
}
