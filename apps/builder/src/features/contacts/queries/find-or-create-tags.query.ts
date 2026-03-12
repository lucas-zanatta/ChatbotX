"use server"

import { type DrizzleTransaction, db } from "@aha.chat/database/client"
import { tagModel } from "@aha.chat/database/schema"
import type { TagModel } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import { and, eq, inArray } from "drizzle-orm"

export type Tag = TagModel

export async function findOrCreateTags(
  tx: DrizzleTransaction | null,
  chatbotId: string,
  tagNames: string[],
): Promise<{
  existingTags: Tag[]
  newlyCreatedTags: Tag[]
  allTags: Tag[]
}> {
  const client = tx || db

  const existingTags = await client
    .select()
    .from(tagModel)
    .where(
      and(eq(tagModel.chatbotId, chatbotId), inArray(tagModel.name, tagNames)),
    )

  const existingTagNames = new Set(existingTags.map((t) => t.name))
  const missingTagNames = tagNames.filter((name) => !existingTagNames.has(name))

  let newlyCreatedTags: Tag[] = []

  if (missingTagNames.length > 0) {
    newlyCreatedTags = await client
      .insert(tagModel)
      .values(
        missingTagNames.map((name) => ({
          id: createId(),
          name,
          chatbotId,
        })),
      )
      .onConflictDoNothing()
      .returning()
  }

  const allTags = [...existingTags, ...newlyCreatedTags]

  return {
    existingTags,
    newlyCreatedTags,
    allTags,
  }
}
