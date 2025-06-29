import {
  IntegrationJobAction,
  QueueName,
  connection,
  defaultWorkerOptions,
  type IntegrationJobData,
} from "@ahachat.ai/worker-config"
import { type Job, Worker } from "bullmq"
import { logger } from "../lib/log"
import { triggerAutomatedResponse } from "./handlers/automated-response"
import { receiveMessage } from "./handlers/received-message"
import type { OutgoingMessageEntity } from "@ahachat.ai/sdk"
import { sendFlowNode } from "./handlers/send-flow-node"
import { sendFlowPostback } from "./handlers/send-flow-postback"
import {
  sendBroadcast,
  sendMultipleBroadcasts,
} from "./handlers/broadcast-handler"

const worker = new Worker(
  QueueName.INTEGRATION,
  async (job: Job<IntegrationJobData>) => {
    switch (job.data.type) {
      case IntegrationJobAction.RECEIVE_MESSAGE: {
        const { message } = await receiveMessage(job.data.data)

        if (message.content) {
          await triggerAutomatedResponse({
            message: message as OutgoingMessageEntity,
          })
        }
        return
      }
      case IntegrationJobAction.SEND_FLOW: {
        await sendFlowNode(job.data)
        return
      }
      case IntegrationJobAction.SEND_FLOW_POSTBACK: {
        await sendFlowPostback(job.data.data)
        return
      }
      case IntegrationJobAction.SEEK_AVAILABLE_BROADCASTS: {
        await sendMultipleBroadcasts()
        return
      }
      case IntegrationJobAction.SEND_BROADCAST: {
        await sendBroadcast(job.data.data.broadcastId)
        return
      }
      default:
        console.log("Unhandled job:", job)
        return
    }
  },
  {
    connection,
    ...defaultWorkerOptions,
  },
)

worker.on("failed", (job, err) => {
  if (job) {
    logger.error(`${job.id} has failed`, err)
  }
})
