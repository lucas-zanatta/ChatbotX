import { prisma } from "@aha.chat/database"

export async function updateFolderSequenceCounts(folderId: string) {
  const folder = await prisma.sequenceFolder.findUnique({
    where: { id: folderId },
    select: { id: true, parentId: true, chatbotId: true },
  })

  if (!folder) {
    return
  }

  const allFolders = await prisma.sequenceFolder.findMany({
    where: { chatbotId: folder.chatbotId },
    select: {
      id: true,
      parentId: true,
      _count: {
        select: {
          sequencesOnFolders: true,
        },
      },
    },
  })

  const folderMap = new Map(allFolders.map((f) => [f.id, f]))
  const countCache = new Map<string, number>()

  const calculateTotalSequences = (targetFolderId: string): number => {
    if (countCache.has(targetFolderId)) {
      return countCache.get(targetFolderId)!
    }

    const targetFolder = folderMap.get(targetFolderId)
    if (!targetFolder) {
      return 0
    }

    let total = targetFolder._count.sequencesOnFolders

    const children = allFolders.filter((f) => f.parentId === targetFolderId)
    for (const child of children) {
      total += calculateTotalSequences(child.id)
    }

    countCache.set(targetFolderId, total)
    return total
  }

  const foldersToUpdate: string[] = []
  let currentId: string | null = folderId

  while (currentId) {
    foldersToUpdate.push(currentId)
    const current = folderMap.get(currentId)
    currentId = current?.parentId || null
  }

  await prisma.$transaction(
    foldersToUpdate.map((id) =>
      prisma.sequenceFolder.update({
        where: { id },
        data: { totalSequencesCount: calculateTotalSequences(id) },
      }),
    ),
  )
}

export async function recalculateAllFolderCounts(chatbotId: string) {
  const allFolders = await prisma.sequenceFolder.findMany({
    where: { chatbotId },
    select: {
      id: true,
      parentId: true,
      _count: {
        select: {
          sequencesOnFolders: true,
        },
      },
    },
  })

  const countCache = new Map<string, number>()

  const calculateTotalSequences = (folderId: string): number => {
    if (countCache.has(folderId)) {
      return countCache.get(folderId)!
    }

    const folder = allFolders.find((f) => f.id === folderId)
    if (!folder) {
      return 0
    }

    let total = folder._count.sequencesOnFolders
    const children = allFolders.filter((f) => f.parentId === folderId)
    for (const child of children) {
      total += calculateTotalSequences(child.id)
    }

    countCache.set(folderId, total)
    return total
  }

  await prisma.$transaction(
    allFolders.map((folder) =>
      prisma.sequenceFolder.update({
        where: { id: folder.id },
        data: { totalSequencesCount: calculateTotalSequences(folder.id) },
      }),
    ),
  )
}
