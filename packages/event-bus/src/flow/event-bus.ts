import { getRedisConnection } from "@aha.chat/worker-config"
import { BaseEventBus } from "../event-bus"
import { type FlowEventMap, type FlowEventListener, FlowEventType } from "./types"
import { flowEventSchemas } from "./schemas"

const MAX_MESSAGE_EVENTS = 100_000

export const flowEventBus = new BaseEventBus<
  FlowEventMap,
  FlowEventListener
>(getRedisConnection(), {
  streamKey: "flow:events",
  consumerGroup: "flow-events-group",
  maxLen: MAX_MESSAGE_EVENTS,
  schemas: flowEventSchemas,
})

export const FlowEventBusByType = {
  ...Object.fromEntries(
    Object.values(FlowEventType).map((type) => [type, flowEventBus]),
  ),
}
