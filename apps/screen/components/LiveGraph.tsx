"use client";

import type { GraphEdge, GraphNode } from "@buildnowbetter/shared";
import dynamic from "next/dynamic";
import { useMemo } from "react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const MIN_NODE_RADIUS = 6;
const WEIGHT_TO_RADIUS = 2;

export function LiveGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
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
    <ForceGraph2D
      graphData={graphData}
      nodeLabel="name"
      nodeAutoColorBy="id"
      linkColor={() => "rgba(94, 234, 212, 0.5)"}
      linkWidth={1.5}
      backgroundColor="#05070a"
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
  );
}
