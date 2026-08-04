"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchSnapshot } from "@/lib/relayClient";

/** Polls the relay's aggregated state — same source the big screen consumes over SSE. */
export function useRelaySnapshot() {
  return useQuery({
    queryKey: ["relay-snapshot"],
    queryFn: fetchSnapshot,
    refetchInterval: 5_000,
  });
}
