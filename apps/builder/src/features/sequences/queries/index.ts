import { type Prisma, prisma } from "@aha.chat/database"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  GetSequencesSchema,
  SequenceResource,
} from "../schemas/get-sequences-schema"

export async function listSequences(
  input: GetSequencesSchema,
): Promise<{ data: SequenceResource[]; pageCount: number }> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where: Prisma.SequenceWhereInput = {
    chatbotId: input.chatbotId,
  }

  if (input.folderId !== undefined) {
    if (input.folderId === null) {
      where.sequencesOnFolders = {
        none: {},
      }
    } else {
      where.sequencesOnFolders = {
        some: {
          folderId: input.folderId,
        },
      }
    }
  }

  if (input.name) {
    where.name = {
      contains: input.name,
      mode: "insensitive",
    }
  }

  const [data, total] = await prisma.$transaction([
    prisma.sequence.findMany({
      skip: (input.page - 1) * input.perPage,
      take: input.perPage,
      where,
      include: {
        _count: {
          select: {
            steps: true,
            contactsOnSequences: true,
          },
        },
        sequencesOnFolders: {
          select: {
            folderId: true,
            folder: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
    prisma.sequence.count({ where }),
  ])

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export async function getSequence(chatbotId: string, sequenceId: string) {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  return await prisma.sequence.findFirstOrThrow({
    where: {
      id: sequenceId,
      chatbotId,
    },
    include: {
      steps: {
        include: {
          flow: true,
        },
        orderBy: {
          order: "asc",
        },
      },
    },
  })
}
