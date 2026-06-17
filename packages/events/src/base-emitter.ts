import {
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"

/**
 * Base event emitter class with common functionality
 */
export abstract class BaseEventEmitter {
  protected abstract supportedEventTypes: Set<TriggerEventType>
  protected abstract shouldEmitEvent(
    eventType: TriggerEventType,
    workspaceId: string,
    sourceId?: string,
  ): Promise<boolean>

  protected abstract emitToQueue(
    eventType: TriggerEventType,
    data: {
      workspaceId: string
      contactId: string
      metadata?: Record<string, unknown>
    },
  ): Promise<void>

  async emit(
    eventType: TriggerEventType,
    data: {
      workspaceId: string
      contactId: string
      metadata?: Record<string, unknown>
    },
  ): Promise<void> {
    const { workspaceId, contactId, metadata = {} } = data

    if (!(workspaceId && contactId)) {
      return
    }

    if (!this.supportedEventTypes.has(eventType)) {
      return
    }

    const sourceId = metadata.sourceId as string | undefined
    const shouldEmit = await this.shouldEmitEvent(
      eventType,
      workspaceId,
      sourceId,
    )

    if (!shouldEmit) {
      return
    }

    await this.emitToQueue(eventType, data)
  }

  async tagApplied(
    workspaceId: string,
    contactId: string,
    tagId: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.tagApplied, {
      workspaceId,
      contactId,
      metadata: { sourceId: tagId, tagId },
    })
  }

  async tagRemoved(
    workspaceId: string,
    contactId: string,
    tagId: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.tagRemoved, {
      workspaceId,
      contactId,
      metadata: { sourceId: tagId, tagId },
    })
  }

  async customFieldChanged(
    workspaceId: string,
    contactId: string,
    customFieldId: string,
    customFieldName: string,
    oldValue: unknown,
    newValue: unknown,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.customFieldValueChanged, {
      workspaceId,
      contactId,
      metadata: {
        sourceId: customFieldId,
        customFieldId,
        customFieldName,
        oldValue,
        newValue,
      },
    })
  }

  async conversationTransferredToHuman(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    transferredBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.conversationTransferredToHuman, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        transferredBy,
      },
    })
  }

  async conversationTransferredToBot(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    transferredBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.conversationTransferredToBot, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        transferredBy,
      },
    })
  }

  async contactCreated(
    workspaceId: string,
    contactId: string,
    name?: string,
    phone?: string,
    email?: string,
    customFields?: Record<string, unknown>,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.newContact, {
      workspaceId,
      contactId,
      metadata: {
        name,
        phone,
        email,
        customFields,
      },
    })
  }

  async contactUnsubscribed(
    workspaceId: string,
    contactId: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.contactUnsubscribedFormBroadcast, {
      workspaceId,
      contactId,
    })
  }

  async conversationArchived(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    archivedBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.archived, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        archivedBy,
      },
    })
  }

  async conversationFollowUp(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    markedBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.followUp, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        markedBy,
      },
    })
  }

  async conversationAssigned(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    assignedTo: string,
    assignedBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.conversationAssigned, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        assignedTo,
        assignedBy,
      },
    })
  }

  async conversationUnassigned(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    unassignedBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.conversationUnassigned, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        unassignedBy,
      },
    })
  }

  async instagramCommentCreated(
    workspaceId: string,
    contactId: string,
    comment: {
      commentId: string
      mediaId?: string
      text?: string
      username?: string
      parentId?: string
    },
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.instagramCommentCreated, {
      workspaceId,
      contactId,
      metadata: {
        sourceId: comment.mediaId,
        ...comment,
      },
    })
  }

  async instagramMessageReceived(
    workspaceId: string,
    contactId: string,
    message: {
      messageId?: string
      text?: string
      quickReplyPayload?: string | null
    },
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.instagramMessageReceived, {
      workspaceId,
      contactId,
      metadata: message,
    })
  }

  async instagramPostbackReceived(
    workspaceId: string,
    contactId: string,
    postback: {
      payload?: string | null
      title?: string | null
      messageId?: string
    },
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.instagramPostbackReceived, {
      workspaceId,
      contactId,
      metadata: postback,
    })
  }

  async instagramReferralReceived(
    workspaceId: string,
    contactId: string,
    referral: { ref?: string | null },
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.instagramReferralReceived, {
      workspaceId,
      contactId,
      metadata: referral,
    })
  }

  async instagramOptinReceived(
    workspaceId: string,
    contactId: string,
    optin: { ref?: string | null },
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.instagramOptinReceived, {
      workspaceId,
      contactId,
      metadata: optin,
    })
  }

  async instagramMessageSeen(
    workspaceId: string,
    contactId: string,
    seen: { conversationId?: string; seenAt?: Date },
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.instagramMessageSeen, {
      workspaceId,
      contactId,
      metadata: seen,
    })
  }

  async instagramMentionCreated(
    workspaceId: string,
    contactId: string,
    mention: { mediaId?: string; commentId?: string; username?: string },
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.instagramMentionCreated, {
      workspaceId,
      contactId,
      metadata: mention,
    })
  }

  async instagramLiveCommentCreated(
    workspaceId: string,
    contactId: string,
    comment: { mediaId?: string; commentId?: string; username?: string },
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.instagramLiveCommentCreated, {
      workspaceId,
      contactId,
      metadata: comment,
    })
  }

  async instagramReactionReceived(
    workspaceId: string,
    contactId: string,
    reaction: Record<string, unknown>,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.instagramReactionReceived, {
      workspaceId,
      contactId,
      metadata: reaction,
    })
  }

  async instagramHandoverReceived(
    workspaceId: string,
    contactId: string,
    handover: Record<string, unknown>,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.instagramHandoverReceived, {
      workspaceId,
      contactId,
      metadata: handover,
    })
  }

  async instagramStandbyReceived(
    workspaceId: string,
    contactId: string,
    standby: Record<string, unknown>,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.instagramStandbyReceived, {
      workspaceId,
      contactId,
      metadata: standby,
    })
  }

  async instagramStoryInsights(
    workspaceId: string,
    contactId: string,
    insights: Record<string, unknown>,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.instagramStoryInsights, {
      workspaceId,
      contactId,
      metadata: insights,
    })
  }

  async sequenceSubscribed(
    workspaceId: string,
    contactId: string,
    sequenceId: string,
    sequenceName: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.subscribedToSequence, {
      workspaceId,
      contactId,
      metadata: { sourceId: sequenceId, sequenceId, sequenceName },
    })
  }

  async sequenceUnsubscribed(
    workspaceId: string,
    contactId: string,
    sequenceId: string,
    sequenceName: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.unsubscribedFromSequence, {
      workspaceId,
      contactId,
      metadata: { sourceId: sequenceId, sequenceId, sequenceName },
    })
  }
}
