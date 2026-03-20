import type { FlowNode, FlowWithVersions } from "../schemas/flow-node"

export function hasStartNode(nodes: FlowNode[], stepType: string): boolean {
  if (!Array.isArray(nodes)) {
    return false
  }

  return nodes
    .filter((node) => node?.data?.isStartNode === true)
    .some((node) =>
      node?.data?.details?.steps?.some((step) => step?.stepType === stepType),
    )
}

export function filterFlowsByStartStepType<T extends FlowWithVersions>(
  flows: T[],
  stepType: string,
): T[] {
  return flows.filter((flow) =>
    flow.flowVersions.some((version) => hasStartNode(version.nodes, stepType)),
  )
}
