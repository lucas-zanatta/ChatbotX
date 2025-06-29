import { BroadcastStatus, prisma } from "@ahachat.ai/database"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@ahachat.ai/worker-config"

export async function sendMultipleBroadcasts() {
  const broadcasts = await prisma.broadcast.findMany({
    where: {
      status: BroadcastStatus.SCHEDULED,
      schedulesAt: {
        lte: new Date(),
      },
    },
    include: {
      contactsOnBroadcasts: {
        include: {
          contact: {
            include: {
              conversation: true,
            },
          },
        },
      },
    },
  })
  if (broadcasts.length === 0) return

  for (const b of broadcasts) {
    await performBroadcast(b)
  }
}

export async function sendBroadcast(broadcastId: string) {
  const broadcast = await prisma.broadcast.findFirst({
    where: {
      id: broadcastId,
    },
    include: {
      contactsOnBroadcasts: {
        include: {
          contact: {
            include: {
              conversation: true,
            },
          },
        },
      },
    },
  })
  if (!broadcast) return

  await performBroadcast(broadcast)
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export async function performBroadcast(broadcast: any) {
  await integrationQueue.addBulk(
    broadcast.contactsOnBroadcasts.map((cb) => {
      return {
        name: IntegrationJobAction.SEND_FLOW,
        data: {
          type: IntegrationJobAction.SEND_FLOW,
          data: {
            conversationId: cb.contact.conversation?.id ?? "",
            flowId: broadcast.flowId,
          },
        },
      }
    }),
  )
}
