"use client";

import { Leaderboard } from "@/components/Leaderboard";
import { LiveGraph } from "@/components/LiveGraph";
import { ProjectsPanel } from "@/components/ProjectsPanel";
import { useRelayStream } from "@/lib/useRelayStream";

export default function ScreenPage() {
  const { nodes, edges, leaderboard, projects, connected } = useRelayStream();

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
        <div className="sidebar">
          <Leaderboard entries={leaderboard} />
          <ProjectsPanel projects={projects} nodes={nodes} />
        </div>
      </div>
    </main>
  );
}
