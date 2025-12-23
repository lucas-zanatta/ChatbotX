import { prisma } from "@aha.chat/database"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export async function listSequenceFolders(
  chatbotId: string,
  parentId?: string | null,
) {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  const folders = await prisma.sequenceFolder.findMany({
    where: {
      chatbotId,
      parentId: parentId === undefined ? null : parentId,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      chatbotId: true,
      parentId: true,
      depth: true,
      position: true,
      totalSequencesCount: true,
      _count: {
        select: {
          children: true,
          sequencesOnFolders: true,
        },
      },
    },
    orderBy: {
      position: "asc",
    },
  })

  return folders.map((folder) => ({
    ...folder,
    _count: {
      ...folder._count,
      totalSequences: folder.totalSequencesCount,
    },
  }))
}

export async function listAllSequenceFolders(chatbotId: string) {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  const folders = await prisma.sequenceFolder.findMany({
    where: {
      chatbotId,
    },
    select: {
      id: true,
      name: true,
      parentId: true,
      depth: true,
    },
    orderBy: {
      position: "asc",
    },
  })

  return folders
}

export async function getSequenceFolder(folderId: string) {
  const folder = await prisma.sequenceFolder.findUnique({
    where: {
      id: folderId,
    },
    select: {
      id: true,
      name: true,
      chatbotId: true,
      parentId: true,
      depth: true,
      position: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          children: true,
          sequencesOnFolders: true,
        },
      },
    },
  })

  return folder
}

export async function getFolderBreadcrumbs(folderId: string) {
  const breadcrumbs: Array<{ id: string; name: string }> = []
  let currentId: string | null = folderId

  while (currentId) {
    const folder: { id: string; name: string; parentId: string | null } | null =
      await prisma.sequenceFolder.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      })

    if (!folder) {
      break
    }

    breadcrumbs.unshift({ id: folder.id, name: folder.name })
    currentId = folder.parentId
  }

  return breadcrumbs
}
