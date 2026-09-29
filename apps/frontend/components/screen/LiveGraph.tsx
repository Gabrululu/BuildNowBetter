"use client";

import type { GraphEdge, GraphNode } from "@buildnowbetter/shared";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const MIN_NODE_RADIUS = 6;
const WEIGHT_TO_RADIUS = 2;

export function LiveGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  // react-force-graph-2d defaults to window.innerWidth/innerHeight when width/height aren't
  // passed explicitly — it doesn't track its own container. In the /screen grid (graph-panel +
  // sidebar) that overflows the panel and pushes the sidebar off-screen, so we measure the
  // wrapper ourselves and hand it down.
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(
    () => ({
      nodes: nodes.map((node) => ({
        id: node.identityId,
        name: node.displayName,
        val: MIN_NODE_RADIUS + node.weight * WEIGHT_TO_RADIUS,
      })),
      links: edges.map((edge) => ({ source: edge.fromId, target: edge.toId })),
    }),
    [nodes, edges],
  );

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      {size.width > 0 && size.height > 0 && (
        <ForceGraph2D
          width={size.width}
          height={size.height}
          graphData={graphData}
          nodeLabel="name"
          nodeAutoColorBy="id"
          linkColor={() => "rgba(94, 234, 212, 0.5)"}
          linkWidth={1.5}
          backgroundColor="#050505"
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const fontSize = 16 / globalScale;
            ctx.font = `600 ${fontSize}px system-ui`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = "#f4f6fb";
            ctx.fillText(node.name, node.x, node.y + 10);
          }}
        />
      )}
    </div>
  );
}
