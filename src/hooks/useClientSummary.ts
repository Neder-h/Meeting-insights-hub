import { useQuery } from '@tanstack/react-query';
import { getClientSummary } from '@/lib/api';

export function useClientSummary(params: {
  page: number;
  limit: number;
  search?: string;
  status?: 'all' | 'prospect' | 'active' | 'inactive' | 'churned';
}) {
  return useQuery({
    queryKey: ['clients', 'summary', params],
    queryFn: () => getClientSummary(params),
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    placeholderData: (prev) => prev,
  });
}
