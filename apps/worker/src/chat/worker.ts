import { SdkException } from "@aha.chat/sdk"
import {
  ChatJobAction,
  type ChatJobData,
  defaultWorkerOptions,
  getRedisConnection,
  queueName,
} from "@aha.chat/worker-config"
import { type Job, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { sendFlowStep } from "./handlers/send-flow-step"
import { sendMessageToExternal } from "./handlers/send-message"

async function startChatWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Analytics bootstrapped successfully")
  } catch (err) {
    logger.error("Failed to bootstrap analytics", err)
    process.exit(1)
  }

  const worker = new Worker(
    queueName.chat,
    async (job: Job<ChatJobData>) => {
      switch (job.data.type) {
        case ChatJobAction.sendExternalMessage:
          await sendMessageToExternal(job.data)
          return
        case ChatJobAction.sendFlowMessage:
          await sendFlowStep(job.data.data)
          return
        default:
          throw new SdkException("ChatJobAction action is not defined")
      }
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
    },
  )

  worker.on("failed", (job, err) => {
    if (job) {
      logger.error(`${job.id} has failed`, err)
    }
  })
}

startChatWorker().catch((err) => {
  logger.error("Failed to start chat worker", err)
  process.exit(1)
})
