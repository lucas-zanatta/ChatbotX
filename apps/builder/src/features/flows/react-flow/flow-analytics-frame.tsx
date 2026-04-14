"use client"

import "@xyflow/react/dist/style.css"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import type { FlowResource } from "../schemas/resource"
import { FlowAnalyticsHeader } from "./flow-analytics-header"
import { ReactFlowAnalyticsWrapper } from "./react-flow-analysis-wrapper"

type FlowAnalyticsFrameProps = {
  flow: FlowResource
  flowVersion: FlowVersionResource
}

export function FlowAnalyticsFrame({
  flow,
  flowVersion,
}: FlowAnalyticsFrameProps) {
  return (
    <>
      <FlowAnalyticsHeader flow={flow} />
      <ReactFlowAnalyticsWrapper flowVersion={flowVersion} />
    </>
  )
}
