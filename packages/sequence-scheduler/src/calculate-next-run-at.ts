import { prisma } from "@aha.chat/database"

type PrismaClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>

export interface SequenceStepDelay {
  delayDays: number
  delayMinutes: number
  delayUnit: string | null
  specificDateTime: Date | null
}

export function calculateNextRunAtFromStep(
  step: SequenceStepDelay,
  baseTime: Date = new Date(),
): Date {
  if (step.delayUnit === "specificTime" && step.specificDateTime) {
    return new Date(step.specificDateTime)
  }

  const delayMs =
    step.delayDays * 24 * 60 * 60 * 1000 + step.delayMinutes * 60 * 1000

  return delayMs > 0 ? new Date(baseTime.getTime() + delayMs) : baseTime
}

export async function calculateNextRunAt(
  sequenceId: string,
  enrolledAt: Date = new Date(),
  tx?: PrismaClient,
): Promise<{ nextRunAt: Date; nextStepId: string | null }> {
  const client = tx ?? prisma

  const firstStep = await client.sequenceStep.findFirst({
    where: {
      sequenceId,
      order: 0,
      isActive: true,
    },
    select: {
      id: true,
      delayDays: true,
      delayMinutes: true,
      delayUnit: true,
      specificDateTime: true,
    },
  })

  if (!firstStep) {
    return { nextRunAt: enrolledAt, nextStepId: null }
  }

  const nextRunAt = calculateNextRunAtFromStep(firstStep, enrolledAt)

  return {
    nextRunAt,
    nextStepId: firstStep.id,
  }
}
