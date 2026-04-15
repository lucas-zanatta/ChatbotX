import { ReflinkAnalytics } from "@chatbotx.io/analytics-nextjs/components/reflink-analytics"
import { db } from "@chatbotx.io/database/client"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"

const paramsSchema = z.object({
  workspaceId: zodBigintAsString(),
  reflinkId: zodBigintAsString(),
})

type Props = {
  params: Promise<{ workspaceId: string; reflinkId: string }>
}

export default async function ReflinkAnalyticsPage({ params }: Props) {
  const { data } = await paramsSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const result = await getCurrentUserAndTargetChatbot(data.workspaceId)
  if (!result) {
    return redirect("/")
  }

  const reflink = await db.query.reflinkModel.findFirst({
    where: {
      id: data.reflinkId,
      workspaceId: data.workspaceId,
    },
  })
  if (!reflink) {
    return notFound()
  }

  return (
    <div className="container mx-auto flex flex-col gap-6 py-6">
      <ReflinkAnalytics
        defaultSearchParams={{
          workspaceId: data.workspaceId,
          linkId: data.reflinkId,
          timezone: "UTC",
        }}
      />
    </div>
  )
}
