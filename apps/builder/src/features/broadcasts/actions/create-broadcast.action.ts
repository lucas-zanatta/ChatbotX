"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFlowIdIsExists } from "@/features/flows/queries"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  BroadcastSchedulesType,
  BroadcastStatus,
  prisma,
  type Prisma,
} from "@ahachat.ai/database"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@ahachat.ai/worker-config"
import { revalidateTag } from "next/cache"
import {
  type CreateBroadcastRequest,
  createBroadcastRequest,
} from "../schemas/create-broadcast-schema"
export const createBroadcastAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(createBroadcastRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateBroadcastRequest
    }) => {
      const flow = await ensureFlowIdIsExists(chatbotId, parsedInput.flowId)

      const data: Prisma.BroadcastUncheckedCreateInput = {
        ...parsedInput,
        name: flow.name,
        chatbotId,
        status: BroadcastStatus.SCHEDULED,
        schedulesAt: new Date(parsedInput.schedulesAt ?? new Date()),
      }
      if (
        data.schedulesType === BroadcastSchedulesType.NOW ||
        data.schedulesAt <= new Date()
      ) {
        data.status = BroadcastStatus.SENT
      }
      const contacts = await prisma.contact.findMany({
        select: {
          id: true,
        },
        where: {
          chatbotId,
        },
      })

      const broadcast = await prisma.$transaction(async (tx) => {
        return await tx.broadcast.create({
          data: {
            ...data,
            contactsOnBroadcasts: {
              create: contacts.map((contact) => ({
                contactId: contact.id,
              })),
            },
          },
        })
      })

      // Send broadcast immediately if necessary
      if (broadcast.status === BroadcastStatus.SENT) {
        await integrationQueue.add(IntegrationJobAction.SEND_BROADCAST, {
          type: IntegrationJobAction.SEND_BROADCAST,
          data: {
            broadcastId: broadcast.id,
          },
        })
      }

      revalidateTag(`chatbots:${chatbotId}#broadcasts`)
    },
  )
