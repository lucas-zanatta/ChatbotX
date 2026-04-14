"use client"

import type { OrganizationSettings } from "@chatbotx.io/database/partials"
import { ReactFlowProvider } from "@xyflow/react"
import type { FlowVersionResource } from "../flow-versions/schema/resource"
import type { OrganizationResource } from "../organization/schema/resource"
import { FlowAnalyticsFrame } from "./react-flow/flow-analytics-frame"
import { StepStoreProvider } from "./react-flow/stores/step-store-provider"
import type { FlowResource } from "./schemas/resource"

type FlowAnalyticsProps = {
  flow: FlowResource
  flowVersion: FlowVersionResource
  organization: OrganizationResource
}

export function FlowAnalytics({
  flow,
  flowVersion,
  organization,
}: FlowAnalyticsProps) {
  return (
    <ReactFlowProvider>
      <StepStoreProvider
        initialState={{
          organizationSetings:
            organization.settings as unknown as OrganizationSettings,
          activeFlowId: flow.id,
        }}
      >
        <FlowAnalyticsFrame flow={flow} flowVersion={flowVersion} />
      </StepStoreProvider>
    </ReactFlowProvider>
  )
}
