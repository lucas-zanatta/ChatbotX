import { decode, encode } from "@chatbotx.io/utils/id"
import { z } from "zod"

const configs = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("flow"),
      flowId: z.string(),
      nodeId: z.string().optional(),
    })
    .transform(({ flowId, nodeId }) => ({
      type: "flow",
      f: flowId,
      n: nodeId,
    })),
  z
    .object({
      type: z.literal("draft"),
      flowId: z.string(),
    })
    .transform(({ flowId }) => ({
      type: "draft",
      f: flowId,
    })),
  z
    .object({
      type: z.literal("refLink"),
      refLinkId: z.string(),
    })
    .transform(({ refLinkId }) => ({
      type: "refLink",
      r: refLinkId,
    })),
])
export type RefConfig = z.infer<typeof configs>

export function encodeRef(params: RefConfig): string {
  switch (params.type) {
    case "flow": {
      let { f, n } = params as { type: "flow"; f: string; n?: string }
      f = encode(f)
      if (n) {
        n = encode(n)
      }
      return `f:${f}${n ? `|n:${n}` : ""}`
    }
    case "draft": {
      const { f } = params as { type: "draft"; f: string }
      return `d:${encode(f)}`
    }
    case "refLink": {
      const { r } = params as { type: "refLink"; r: string }
      return `r:${r}`
    }
    default:
      return ""
  }
}

export function decodeRef(ref: string): RefConfig | undefined {
  if (ref.startsWith("f:")) {
    const pipeIndex = ref.indexOf("|")
    const flowId = pipeIndex === -1 ? ref.slice(2) : ref.slice(2, pipeIndex)
    const nodeId = pipeIndex === -1 ? undefined : ref.slice(pipeIndex + 3)
    return {
      type: "flow",
      f: decode(flowId),
      n: nodeId ? decode(nodeId) : undefined,
    }
  }
  if (ref.startsWith("d:")) {
    return { type: "draft", f: decode(ref.slice(2)) }
  }
  if (ref.startsWith("r:")) {
    return { type: "refLink", r: ref.slice(2) }
  }
}
