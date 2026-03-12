import { and, db, eq, inArray } from "@aha.chat/database/client"
import {
  contactCustomFieldModel,
  contactModel,
  contactNoteModel,
  contactsToTagsModel,
  conversationModel,
  fieldModel,
  tagModel,
} from "@aha.chat/database/schema"
import {
  emitCustomFieldChanged,
  emitTagApplied,
  emitTagRemoved,
} from "@aha.chat/events"
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
} from "@aha.chat/flow-config"
import { createId } from "@paralleldrive/cuid2"
import type { FlowStepProps } from "./step-handler"

export async function setContactCustomField({
  conversation,
  step,
}: FlowStepProps<SetCustomFieldStepSchema>) {
  const [existing] = await db
    .select({ value: contactCustomFieldModel.value })
    .from(contactCustomFieldModel)
    .where(
      and(
        eq(contactCustomFieldModel.contactId, conversation.contactId),
        eq(contactCustomFieldModel.customFieldId, step.inputCfId),
      ),
    )
    .limit(1)

  await db
    .insert(contactCustomFieldModel)
    .values({
      id: createId(),
      contactId: conversation.contactId,
      customFieldId: step.inputCfId,
      value: step.value,
    })
    .onConflictDoUpdate({
      target: [
        contactCustomFieldModel.contactId,
        contactCustomFieldModel.customFieldId,
      ],
      set: { value: step.value },
    })

  const [customField] = await db
    .select({ name: fieldModel.name })
    .from(fieldModel)
    .where(eq(fieldModel.id, step.inputCfId))
    .limit(1)

  try {
    await emitCustomFieldChanged(
      conversation.chatbotId,
      conversation.contactId,
      step.inputCfId,
      customField?.name || step.inputCfId,
      existing?.value || null,
      step.value,
    )
  } catch (error) {
    console.error("Failed to emit customFieldChanged event:", error)
  }
}

export async function clearContactCustomField({
  conversation,
  step,
}: FlowStepProps<ClearCustomFieldStepSchema>) {
  await db
    .delete(contactCustomFieldModel)
    .where(
      and(
        eq(contactCustomFieldModel.contactId, conversation.contactId),
        eq(contactCustomFieldModel.customFieldId, step.inputCfId),
      ),
    )
}

export async function addContactNotes({
  conversation,
  step,
}: FlowStepProps<AddNotesStepSchema>) {
  await db.insert(contactNoteModel).values({
    id: createId(),
    contactId: conversation.contactId,
    content: step.content,
  })
}

export async function blockContact({
  conversation,
}: FlowStepProps<BlockContactStepSchema>) {
  await db
    .update(contactModel)
    .set({ blockedAt: new Date() })
    .where(eq(contactModel.id, conversation.contactId))
}

export async function markEmailVerified({
  conversation,
}: FlowStepProps<MarkEmailVerifiedStepSchema>) {
  await db
    .update(contactModel)
    .set({ emailVerified: true })
    .where(eq(contactModel.id, conversation.contactId))
}

export async function optInEmail({
  conversation,
}: FlowStepProps<OptInEmailStepSchema>) {
  await db
    .update(contactModel)
    .set({ emailOptIn: true })
    .where(eq(contactModel.id, conversation.contactId))
}

export async function optOutEmail({
  conversation,
}: FlowStepProps<OptOutEmailStepSchema>) {
  await db
    .update(contactModel)
    .set({ emailOptIn: false })
    .where(eq(contactModel.id, conversation.contactId))
}

export async function addContactTag({
  conversation,
  step,
}: FlowStepProps<AddContactTagStepSchema>) {
  const tags = await db.transaction(async (tx) => {
    const tags = await tx
      .select()
      .from(tagModel)
      .where(
        and(
          eq(tagModel.chatbotId, conversation.chatbotId),
          inArray(tagModel.name, step.tags),
        ),
      )

    if (tags.length > 0) {
      await tx
        .insert(contactsToTagsModel)
        .values(
          tags.map((tag) => ({
            contactId: conversation.contactId,
            tagId: tag.id,
          })),
        )
        .onConflictDoNothing()
    }

    return tags
  })

  for (const tag of tags) {
    try {
      await emitTagApplied(
        conversation.chatbotId,
        conversation.contactId,
        tag.id,
      )
    } catch (error) {
      console.error("Failed to emit tagApplied event:", error)
    }
  }
}

export async function removeContactTag({
  conversation,
  step,
}: FlowStepProps<AddContactTagStepSchema>) {
  const tags = await db
    .select({ id: tagModel.id })
    .from(tagModel)
    .where(
      and(
        eq(tagModel.chatbotId, conversation.chatbotId),
        inArray(tagModel.name, step.tags),
      ),
    )

  if (tags.length === 0) {
    return
  }

  await db.delete(contactsToTagsModel).where(
    and(
      eq(contactsToTagsModel.contactId, conversation.contactId),
      inArray(
        contactsToTagsModel.tagId,
        tags.map((t) => t.id),
      ),
    ),
  )

  for (const tag of tags) {
    try {
      await emitTagRemoved(
        conversation.chatbotId,
        conversation.contactId,
        tag.id,
      )
    } catch (error) {
      console.error("Failed to emit tagRemoved event:", error)
    }
  }
}

export async function deleteContact({
  conversation,
}: FlowStepProps<DeleteContactStepSchema>) {
  await db.transaction(async (tx) => {
    await tx
      .delete(conversationModel)
      .where(eq(conversationModel.id, conversation.id))
    await tx
      .delete(contactModel)
      .where(eq(contactModel.id, conversation.contactId))
  })
}
