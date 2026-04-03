import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { getSequenceStepStats } from "../queries/get-sequence-step-stats.query"
import {
  getSequenceStepStatsRequest,
  getSequenceStepStatsResponse,
} from "../schema"

export const sequencesPrivateAPI = {
  privateGetSequenceStepStatsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/sequences/{sequenceId}/steps/{stepId}/stats",
      summary: "Get sequence step stats",
      tags: ["Sequences"],
    })
    .input(getSequenceStepStatsRequest)
    .output(getSequenceStepStatsResponse)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      return await getSequenceStepStats({
        chatbotId: input.chatbotId,
        sequenceId: input.sequenceId,
        stepId: input.stepId,
      })
    }),
}
