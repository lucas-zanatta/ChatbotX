import { z } from "zod"

export const createSequenceFolderRequest = z.object({
  name: z.string().min(1, "Folder name is required"),
  parentId: z.string().nullable().optional(),
})

export type CreateSequenceFolderRequest = z.infer<
  typeof createSequenceFolderRequest
>

export const renameSequenceFolderRequest = z.object({
  folderId: z.string(),
  name: z.string().min(1, "Folder name is required"),
})

export type RenameSequenceFolderRequest = z.infer<
  typeof renameSequenceFolderRequest
>

export const deleteSequenceFolderRequest = z.object({
  folderId: z.string(),
})

export type DeleteSequenceFolderRequest = z.infer<
  typeof deleteSequenceFolderRequest
>

export const moveSequenceToFolderRequest = z.object({
  sequenceId: z.string(),
  folderId: z.string().nullable(),
})

export type MoveSequenceToFolderRequest = z.infer<
  typeof moveSequenceToFolderRequest
>
