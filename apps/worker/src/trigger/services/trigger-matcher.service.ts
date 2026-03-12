import { and, db, eq, inArray } from "@aha.chat/database/client"
import { Condition as ConditionEnum } from "@aha.chat/database/enums"
import {
  chatbotModel,
  conditionModel,
  triggerModel,
} from "@aha.chat/database/schema"
import type { ChatbotModel } from "@aha.chat/database/types"
import type { TriggerEventData, TriggerWithConditions } from "../types"
import { ConditionEvaluator } from "./condition-evaluator"

export class TriggerMatcherService {
  private readonly conditionEvaluator: ConditionEvaluator

  constructor() {
    this.conditionEvaluator = new ConditionEvaluator()
  }

  async findMatchingTriggers(
    eventData: TriggerEventData,
  ): Promise<TriggerWithConditions[]> {
    const { chatbotId, eventType, eventData: metadata } = eventData

    const conditionTypes = this.mapEventTypeToConditionTypes(eventType)
    if (conditionTypes.length === 0) {
      return []
    }

    const sourceId = metadata.sourceId as string | undefined

    const matchingConditions = await db
      .select({ triggerId: conditionModel.triggerId })
      .from(conditionModel)
      .where(
        and(
          inArray(conditionModel.eventType, conditionTypes),
          sourceId ? eq(conditionModel.eventSourceId, sourceId) : undefined,
        ),
      )

    const triggerIds = [...new Set(matchingConditions.map((c) => c.triggerId))]
    if (triggerIds.length === 0) {
      return []
    }

    const triggers = await db.query.triggerModel.findMany({
      where: and(
        eq(triggerModel.chatbotId, chatbotId),
        eq(triggerModel.active, true),
        inArray(triggerModel.id, triggerIds),
      ),
      with: {
        conditions: true,
      },
    })

    const [chatbot] = await db
      .select()
      .from(chatbotModel)
      .where(eq(chatbotModel.id, chatbotId))
      .limit(1)

    if (triggers.length === 0 || !chatbot) {
      return []
    }

    const evaluationPromises = triggers.map(async (trigger) => {
      const isMatch = await this.evaluateTriggerConditions(
        trigger,
        eventData,
        chatbot,
      )
      return isMatch ? trigger : null
    })

    const results = await Promise.all(evaluationPromises)

    return results.filter((t): t is TriggerWithConditions => t !== null)
  }

  private async evaluateTriggerConditions(
    trigger: TriggerWithConditions,
    eventData: TriggerEventData,
    chatbot: ChatbotModel,
  ): Promise<boolean> {
    const { conditions } = trigger

    if (conditions.length === 0) {
      return false
    }

    for (const condition of conditions) {
      const isMatch = await this.conditionEvaluator.evaluate({
        condition,
        eventData,
        chatbotId: trigger.chatbotId,
        contactId: eventData.contactId,
        chatbot,
      })

      // console.log({ condition, isMatch })

      if (!isMatch) {
        return false
      }
    }

    return true
  }

  private mapEventTypeToConditionTypes(eventType: number): number[] {
    const mapping: Record<number, number[]> = {
      [ConditionEnum.tagApplied]: [ConditionEnum.tagApplied],
      [ConditionEnum.tagRemoved]: [ConditionEnum.tagRemoved],
      [ConditionEnum.customFieldValueChanged]: [
        ConditionEnum.customFieldValueChanged,
      ],
      [ConditionEnum.conversationTransferredToHuman]: [
        ConditionEnum.conversationTransferredToHuman,
      ],
      [ConditionEnum.conversationTransferredToBot]: [
        ConditionEnum.conversationTransferredToBot,
      ],
      [ConditionEnum.newContact]: [ConditionEnum.newContact],
      [ConditionEnum.contactUnsubscribedFormBroadcast]: [
        ConditionEnum.contactUnsubscribedFormBroadcast,
      ],
      [ConditionEnum.archived]: [ConditionEnum.archived],
      [ConditionEnum.followUp]: [ConditionEnum.followUp],
      [ConditionEnum.conversationAssigned]: [
        ConditionEnum.conversationAssigned,
      ],
      [ConditionEnum.conversationUnassigned]: [
        ConditionEnum.conversationUnassigned,
      ],
      [ConditionEnum.subscribedToSequence]: [
        ConditionEnum.subscribedToSequence,
      ],
      [ConditionEnum.unsubscribedFromSequence]: [
        ConditionEnum.unsubscribedFromSequence,
      ],
    }

    return mapping[eventType] || []
  }
}
