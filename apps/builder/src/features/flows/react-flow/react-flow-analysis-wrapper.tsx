"use client"

import type { FlowNode } from "@chatbotx.io/flow-config"
import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import { analyticsNodeTypes, edgeTypes } from "./node-types-config"
import FocusButton from "./panel-buttons/focus-button"
import ZoomInButton from "./panel-buttons/zoom-in-button"
import ZoomOutButton from "./panel-buttons/zoom-out-button"
import "./react-flow-wrapper.css"

type ReactFlowAnalyticsWrapperProps = {
  flowVersion: FlowVersionResource
}

export function ReactFlowAnalyticsWrapper({
  flowVersion,
}: ReactFlowAnalyticsWrapperProps) {
  const [nodes] = useNodesState(flowVersion.nodes as unknown as FlowNode[])
  const [edges] = useEdgesState(
    (flowVersion.edges as unknown as Edge[]).map((edge) => ({
      ...edge,
      type: "buttonedge",
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
    })),
  )

  return (
    <ReactFlow
      defaultEdgeOptions={{
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        style: {
          strokeWidth: 2,
        },
      }}
      edges={edges}
      edgeTypes={edgeTypes}
      elementsSelectable={false}
      nodes={nodes}
      nodesConnectable={false}
      nodesDraggable={false}
      nodeTypes={analyticsNodeTypes}
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Panel className="w-[254px]" position="bottom-center">
        <Controls
          className="overflow-hidden rounded-md shadow-none!"
          orientation="horizontal"
          showFitView={false}
          showInteractive={false}
          showZoom={false}
        >
          <FocusButton />
          <ZoomInButton />
          <ZoomOutButton />
        </Controls>
      </Panel>
    </ReactFlow>
  )
}
