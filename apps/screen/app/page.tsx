"use client";

import { Leaderboard } from "@/components/Leaderboard";
import { LiveGraph } from "@/components/LiveGraph";
import { useRelayStream } from "@/lib/useRelayStream";

export default function ScreenPage() {
  const { nodes, edges, leaderboard, connected } = useRelayStream();

  return (
    <main>
      <header>
        <h1>BuildNowBetter — Grafo de Reputación en Vivo</h1>
        <span className={connected ? "status live" : "status offline"}>
          {connected ? "● en vivo" : "● esperando relay…"}
        </span>
      </header>
      <div className="layout">
        <div className="graph-panel">
          <LiveGraph nodes={nodes} edges={edges} />
        </div>
        <Leaderboard entries={leaderboard} />
      </div>
    </main>
  );
}
