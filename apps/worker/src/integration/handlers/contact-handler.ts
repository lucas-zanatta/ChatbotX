import { prisma } from "@ahachat.ai/database"
import type {
  AddContactTagStepSchema,
  AddNotesStepSchema,
  BlockContactStepSchema,
  ClearCustomFieldStepSchema,
  DeleteContactStepSchema,
  MarkEmailVerifiedStepSchema,
  OptInEmailStepSchema,
  OptOutEmailStepSchema,
  SetCustomFieldStepSchema,
} from "@ahachat.ai/flow-config"
import { createId } from "@paralleldrive/cuid2"
import type { FlowStepProps } from "./step-handler"

export async function setContactCustomField({
  conversation,
  step,
}: FlowStepProps<SetCustomFieldStepSchema>) {
  const conversations = Array.isArray(conversation)
    ? conversation
    : [conversation]
  const now = new Date()

  await prisma.$executeRaw`
    INSERT INTO "ContactCustomField" (id, "contactId", "customFieldId", "value", "createdAt", "updatedAt")
    SELECT * FROM UNNEST(
      ${conversations.map(() => createId())}::TEXT[],
      ${conversations.map((c) => c.contactId)}::TEXT[],
      ${conversations.map(() => step.customFieldId)}::TEXT[],
      ${conversations.map(() => step.value)}::TEXT[],
      ${conversations.map(() => now)}::TEXT[],
      ${conversations.map(() => now)}::TEXT[],
    )
    ON CONFLICT ("contactId", "customFieldId") DO UPDATE
    SET value = EXCLUDED.value,
      "updatedAt" = EXCLUDED."updatedAt"
  `
}

export async function clearContactCustomField({
  conversation,
  step,
}: FlowStepProps<ClearCustomFieldStepSchema>) {
  const conversations = Array.isArray(conversation)
    ? conversation
    : [conversation]

  await prisma.contactCustomField.deleteMany({
    where: {
      contactId: {
        in: conversations.map((c) => c.id),
      },
      customFieldId: step.customFieldId,
    },
  })
}

export async function addContactNotes({
  conversation,
  step,
}: FlowStepProps<AddNotesStepSchema>) {
  const conversations = Array.isArray(conversation)
    ? conversation
    : [conversation]

  await prisma.contactNote.createMany({
    data: conversations.map((c) => {
      return {
        contactId: c.contactId,
        content: step.content,
      }
    }),
  })
}

export async function blockContact({
  conversation,
}: FlowStepProps<BlockContactStepSchema>) {
  const conversations = Array.isArray(conversation)
    ? conversation
    : [conversation]
  await prisma.contact.updateMany({
    where: {
      id: {
        in: conversations.map((c) => c.contactId),
      },
    },
    data: { blockedAt: new Date() },
  })
}

export async function markEmailVerified({
  conversation,
}: FlowStepProps<MarkEmailVerifiedStepSchema>) {
  const conversations = Array.isArray(conversation)
    ? conversation
    : [conversation]

  await prisma.contact.updateMany({
    where: {
      id: {
        in: conversations.map((c) => c.contactId),
      },
    },
    data: { emailVerified: true },
  })
}

export async function optInEmail({
  conversation,
}: FlowStepProps<OptInEmailStepSchema>) {
  const conversations = Array.isArray(conversation)
    ? conversation
    : [conversation]

  await prisma.contact.updateMany({
    where: {
      id: {
        in: conversations.map((c) => c.contactId),
      },
    },
    data: { emailOptIn: true },
  })
}

export async function optOutEmail({
  conversation,
}: FlowStepProps<OptOutEmailStepSchema>) {
  const conversations = Array.isArray(conversation)
    ? conversation
    : [conversation]

  await prisma.contact.updateMany({
    where: {
      id: {
        in: conversations.map((c) => c.contactId),
      },
    },
    data: { emailOptIn: false },
  })
}

export async function addContactTag({
  conversation,
  step,
}: FlowStepProps<AddContactTagStepSchema>) {
  const conversations = Array.isArray(conversation)
    ? conversation
    : [conversation]

  await prisma.$transaction(async (tx) => {
    const tags = await tx.tag.createManyAndReturn({
      data: step.tags.map((t) => ({
        name: t,
        chatbotId: conversations[0].chatbotId,
      })),
      skipDuplicates: true,
    })

    for (const cvst of conversations) {
      await tx.contact.update({
        data: {
          tags: {
            connect: tags.map((t) => ({ id: t.id })),
          },
        },
        where: {
          id: cvst.contactId,
        },
      })
    }
  })
}

export async function removeContactTag({
  conversation,
  step,
}: FlowStepProps<AddContactTagStepSchema>) {
  const conversations = Array.isArray(conversation)
    ? conversation
    : [conversation]

  const tags = await prisma.tag.findMany({
    where: {
      chatbotId: conversations[0].chatbotId,
      name: {
        in: step.tags,
      },
    },
    select: {
      id: true,
    },
  })
  if (tags.length === 0) return

  for (const cvst of conversations) {
    await prisma.contact.update({
      data: {
        tags: {
          disconnect: tags.map((t) => ({
            id: t.id,
          })),
        },
      },
      where: {
        id: cvst.contactId,
      },
    })
  }
}

export async function deleteContact({
  conversation,
}: FlowStepProps<DeleteContactStepSchema>) {
  const conversations = Array.isArray(conversation)
    ? conversation
    : [conversation]

  await prisma.$transaction(async (tx) => {
    await tx.conversation.deleteMany({
      where: {
        id: {
          in: conversations.map((c) => c.id),
        },
      },
    })

    await tx.contact.deleteMany({
      where: {
        id: {
          in: conversations.map((c) => c.contactId),
        },
      },
    })
  })
}
