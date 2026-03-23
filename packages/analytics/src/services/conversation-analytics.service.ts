import { conversationStatsRepository } from "../repositories/conversation-stats.repository"
import type {
  ConversationArchivedStats,
  ConversationFollowUpStats,
  ConversationHandoffStats,
  TimeRangeQuery,
} from "../schemas"

export class ConversationAnalyticsService {
  getHandoffsByDay(props: TimeRangeQuery): Promise<ConversationHandoffStats[]> {
    return conversationStatsRepository.getHandoffsByDay(props)
  }

  getFollowUpsByDay(
    props: TimeRangeQuery,
  ): Promise<ConversationFollowUpStats[]> {
    return conversationStatsRepository.getFollowUpsByDay(props)
  }

  getArchivedByDay(
    props: TimeRangeQuery,
  ): Promise<ConversationArchivedStats[]> {
    return conversationStatsRepository.getArchivedByDay(props)
  }
}

export const conversationAnalyticsService = new ConversationAnalyticsService()
