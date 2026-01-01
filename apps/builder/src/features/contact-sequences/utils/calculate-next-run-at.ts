import { prisma } from "@aha.chat/database"

type PrismaClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>

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

  if (firstStep.delayUnit === "specificTime" && firstStep.specificDateTime) {
    return { nextRunAt: firstStep.specificDateTime, nextStepId: firstStep.id }
  }

  const delayMs =
    firstStep.delayDays * 24 * 60 * 60 * 1000 +
    firstStep.delayMinutes * 60 * 1000

  return {
    nextRunAt:
      delayMs > 0 ? new Date(enrolledAt.getTime() + delayMs) : enrolledAt,
    nextStepId: firstStep.id,
  }
}

export async function calculateNextRunAtBulk(
  sequenceIds: string[],
  enrolledAt: Date = new Date(),
  tx?: PrismaClient,
): Promise<Map<string, { nextRunAt: Date; nextStepId: string | null }>> {
  const client = tx ?? prisma

  const firstSteps = await client.sequenceStep.findMany({
    where: {
      sequenceId: { in: sequenceIds },
      order: 0,
      isActive: true,
    },
    select: {
      id: true,
      sequenceId: true,
      delayDays: true,
      delayMinutes: true,
      delayUnit: true,
      specificDateTime: true,
    },
  })

  const stepMap = new Map(firstSteps.map((step) => [step.sequenceId, step]))

  const resultMap = new Map<
    string,
    { nextRunAt: Date; nextStepId: string | null }
  >()
  for (const sequenceId of sequenceIds) {
    const step = stepMap.get(sequenceId)
    if (!step) {
      resultMap.set(sequenceId, { nextRunAt: enrolledAt, nextStepId: null })
      continue
    }

    if (step.delayUnit === "specificTime" && step.specificDateTime) {
      resultMap.set(sequenceId, {
        nextRunAt: step.specificDateTime,
        nextStepId: step.id,
      })
      continue
    }

    const delayMs =
      step.delayDays * 24 * 60 * 60 * 1000 + step.delayMinutes * 60 * 1000
    resultMap.set(sequenceId, {
      nextRunAt:
        delayMs > 0 ? new Date(enrolledAt.getTime() + delayMs) : enrolledAt,
      nextStepId: step.id,
    })
  }

  return resultMap
}

function calculateDelayInMs(delayDays: number, delayMinutes: number): number {
  return delayDays * 24 * 60 * 60 * 1000 + delayMinutes * 60 * 1000
}

async function getActiveStepsForSequence(
  sequenceId: string,
  client: PrismaClient,
) {
  return await client.sequenceStep.findMany({
    where: {
      sequenceId,
      isActive: true,
    },
    orderBy: { order: "asc" },
    select: {
      id: true,
      order: true,
      delayDays: true,
      delayMinutes: true,
      delayUnit: true,
      specificDateTime: true,
    },
  })
}

async function getActiveStepsCumulativeDelay(
  sequenceId: string,
  upToOrder: number,
  client: PrismaClient,
): Promise<number | Date> {
  const steps = await getActiveStepsForSequence(sequenceId, client)

  if (steps.length === 0) {
    return -1
  }

  const stepsUpToTarget = steps.filter((s) => s.order <= upToOrder)

  if (stepsUpToTarget.length === 0) {
    return -1
  }

  const targetStep = stepsUpToTarget.at(-1)

  if (
    targetStep &&
    targetStep.delayUnit === "specificTime" &&
    targetStep.specificDateTime
  ) {
    return targetStep.specificDateTime
  }

  let totalDelayMs = 0
  for (const step of stepsUpToTarget) {
    totalDelayMs += calculateDelayInMs(step.delayDays, step.delayMinutes)
  }

  return totalDelayMs
}

async function getNextActiveStep(
  sequenceId: string,
  fromOrder: number,
  client: PrismaClient,
): Promise<{ id: string; order: number } | null> {
  const nextStep = await client.sequenceStep.findFirst({
    where: {
      sequenceId,
      order: { gte: fromOrder },
      isActive: true,
    },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  })
  return nextStep
}

type UpdateContactsNextRunAtParams = {
  sequenceId: string
  chatbotId: string
  currentStepOrder: number
  delayMsOrDate: number | Date
  nextStepId: string | null
  client: PrismaClient
}

async function updateContactsNextRunAt(
  params: UpdateContactsNextRunAtParams,
): Promise<void> {
  const {
    sequenceId,
    chatbotId,
    currentStepOrder,
    delayMsOrDate,
    nextStepId,
    client,
  } = params

  if (delayMsOrDate === -1) {
    await client.$executeRaw`
      UPDATE "ContactsOnSequence"
      SET "nextRunAt" = NULL,
          "nextStepId" = ${nextStepId},
          "updatedAt" = NOW()
      WHERE "sequenceId" = ${sequenceId}
        AND "chatbotId" = ${chatbotId}
        AND "currentStep" = ${currentStepOrder}
        AND "status" = 'active'
        AND "completedAt" IS NULL
    `
  } else if (delayMsOrDate instanceof Date) {
    await client.$executeRaw`
      UPDATE "ContactsOnSequence"
      SET "nextRunAt" = ${delayMsOrDate},
          "nextStepId" = ${nextStepId},
          "updatedAt" = NOW()
      WHERE "sequenceId" = ${sequenceId}
        AND "chatbotId" = ${chatbotId}
        AND "currentStep" = ${currentStepOrder}
        AND "status" = 'active'
        AND "completedAt" IS NULL
    `
  } else {
    await client.$executeRaw`
      UPDATE "ContactsOnSequence"
      SET "nextRunAt" = NOW() + INTERVAL '${delayMsOrDate} milliseconds',
          "nextStepId" = ${nextStepId},
          "updatedAt" = NOW()
      WHERE "sequenceId" = ${sequenceId}
        AND "chatbotId" = ${chatbotId}
        AND "currentStep" = ${currentStepOrder}
        AND "status" = 'active'
        AND "completedAt" IS NULL
    `
  }
}

async function recalculateNextRunAtForStep(
  sequenceId: string,
  chatbotId: string,
  stepOrder: number,
  client: PrismaClient,
): Promise<void> {
  const activeSteps = await getActiveStepsForSequence(sequenceId, client)
  const currentStepIsActive = activeSteps.some((s) => s.order === stepOrder)

  let targetOrder = stepOrder
  let nextStepId: string | null = null

  if (currentStepIsActive) {
    const currentStep = activeSteps.find((s) => s.order === stepOrder)
    nextStepId = currentStep?.id ?? null
  } else {
    const nextActiveStep = await getNextActiveStep(
      sequenceId,
      stepOrder,
      client,
    )
    if (nextActiveStep === null) {
      await updateContactsNextRunAt({
        sequenceId,
        chatbotId,
        currentStepOrder: stepOrder,
        delayMsOrDate: -1,
        nextStepId: null,
        client,
      })
      return
    }
    targetOrder = nextActiveStep.order
    nextStepId = nextActiveStep.id
  }

  const cumulativeDelay = await getActiveStepsCumulativeDelay(
    sequenceId,
    targetOrder,
    client,
  )

  await updateContactsNextRunAt({
    sequenceId,
    chatbotId,
    currentStepOrder: stepOrder,
    delayMsOrDate: cumulativeDelay,
    nextStepId,
    client,
  })
}

export async function recalculateAllContactsInSequence(
  sequenceId: string,
  chatbotId: string,
  tx?: PrismaClient,
): Promise<void> {
  const client = tx ?? prisma

  const uniqueSteps = await client.contactsOnSequence.findMany({
    where: {
      sequenceId,
      chatbotId,
      status: "active",
      completedAt: null,
    },
    select: {
      currentStep: true,
    },
    distinct: ["currentStep"],
  })

  for (const { currentStep } of uniqueSteps) {
    await recalculateNextRunAtForStep(
      sequenceId,
      chatbotId,
      currentStep,
      client,
    )
  }
}
