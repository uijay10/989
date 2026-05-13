import { useQuery } from "@tanstack/react-query";
import { getApiBase } from "@/lib/api-base";

export function useMemberCount(): number {
  const { data } = useQuery({
    queryKey: ["_pt"],
    queryFn: async () => {
      const r = await fetch(`${getApiBase()}/stats`);
      const j = (await r.json()) as { n?: number };
      return typeof j.n === "number" ? j.n : 0;
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  return data ?? 0;
}
