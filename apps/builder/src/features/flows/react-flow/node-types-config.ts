"use client"

import { NodeType } from "@chatbotx.io/flow-config"
import ButtonEdge from "./edges/button-edge"
import { NodeAnalyticsViewer } from "./nodes/analytics-viewer"
import { NodeViewer } from "./nodes/viewer"

export const nodeTypes = {
  [NodeType.sendMessage]: NodeViewer,
  [NodeType.sendMail]: NodeViewer,
  [NodeType.landingPage]: NodeViewer,
  [NodeType.performAction]: NodeViewer,
  [NodeType.addNotes]: NodeViewer,
  [NodeType.wait]: NodeViewer,
  [NodeType.startFlow]: NodeViewer,
}

export const analyticsNodeTypes = {
  [NodeType.sendMessage]: NodeAnalyticsViewer,
  [NodeType.sendMail]: NodeAnalyticsViewer,
  [NodeType.landingPage]: NodeAnalyticsViewer,
  [NodeType.performAction]: NodeAnalyticsViewer,
  [NodeType.addNotes]: NodeAnalyticsViewer,
  [NodeType.wait]: NodeAnalyticsViewer,
  [NodeType.startFlow]: NodeAnalyticsViewer,
}

export const edgeTypes = {
  buttonedge: ButtonEdge,
}
