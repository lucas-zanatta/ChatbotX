import { z } from "zod"

export const createSequenceFolderRequest = z.object({
  name: z.string().min(1, "validation.required"),
  parentId: z.cuid2().nullable().optional(),
})

export type CreateSequenceFolderRequest = z.infer<
  typeof createSequenceFolderRequest
>

export const renameSequenceFolderRequest = z.object({
  folderId: z.cuid2(),
  name: z.string().min(1, "validation.required"),
})

export type RenameSequenceFolderRequest = z.infer<
  typeof renameSequenceFolderRequest
>

export const deleteSequenceFolderRequest = z.object({
  folderId: z.cuid2(),
})

export type DeleteSequenceFolderRequest = z.infer<
  typeof deleteSequenceFolderRequest
>
