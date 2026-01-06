import { prisma } from "@aha.chat/database"

/**
 * Calculate nextRunAt for a sequence based on its first step delay
 * @param sequenceId - The sequence ID
 * @param enrolledAt - The enrollment timestamp (defaults to now)
 * @returns The calculated nextRunAt date
 */
export async function calculateNextRunAt(
  sequenceId: string,
  enrolledAt: Date = new Date(),
): Promise<Date> {
  const firstStep = await prisma.sequenceStep.findFirst({
    where: {
      sequenceId,
      order: 0,
      isActive: true,
    },
    select: {
      delayDays: true,
      delayMinutes: true,
    },
  })

  if (!firstStep) {
    return enrolledAt
  }

  const delayMs =
    firstStep.delayDays * 24 * 60 * 60 * 1000 +
    firstStep.delayMinutes * 60 * 1000

  return delayMs > 0 ? new Date(enrolledAt.getTime() + delayMs) : enrolledAt
}
