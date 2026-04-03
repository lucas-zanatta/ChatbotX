"use client"

import { Skeleton } from "@aha.chat/ui/components/ui/skeleton"
import { useParams } from "next/navigation"
import { memo, useEffect, useState } from "react"
import { client } from "@/lib/orpc/orpc"
import type { GetSequenceStepStatsResponse } from "../schema"

type Props = {
  sequenceId: string
  stepId?: string
}

export const SequenceStepStats = memo(function SequenceStepStats({
  sequenceId,
  stepId,
}: Props) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const [stats, setStats] = useState<GetSequenceStepStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!stepId) {
      setIsLoading(false)
      return
    }

    let isMounted = true

    async function fetchStats() {
      try {
        const result = await client.sequencesAPI.privateGetSequenceStepStatsAPI(
          {
            chatbotId,
            sequenceId,
            stepId: stepId as string,
          },
        )

        if (isMounted) {
          setStats(result)
        }
      } catch (error) {
        console.error("Failed to fetch sequence step stats:", error)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchStats()

    return () => {
      isMounted = false
    }
  }, [chatbotId, sequenceId, stepId])

  const formatValue = (value: number) => {
    return value ? value.toLocaleString() : "----"
  }

  const getPercentage = (value: number, total: number) => {
    if (!(value && total)) {
      return null
    }
    const percentage = (value / total) * 100
    return percentage.toFixed(1)
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
      </div>
    )
  }

  const sent = stats?.sent ?? 0
  const seen = stats?.seen ?? 0
  const clicked = stats?.clicked ?? 0
  const failed = stats?.failed ?? 0

  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="w-12 text-center tabular-nums">{formatValue(sent)}</span>
      <span className="w-12 text-center tabular-nums">
        {formatValue(seen)}
        {getPercentage(seen, sent) && (
          <span className="ml-0.5 text-muted-foreground">
            ({getPercentage(seen, sent)}%)
          </span>
        )}
      </span>
      <span className="w-12 text-center tabular-nums">
        {formatValue(clicked)}
        {getPercentage(clicked, sent) && (
          <span className="ml-0.5 text-muted-foreground">
            ({getPercentage(clicked, sent)}%)
          </span>
        )}
      </span>
      <span className="w-12 text-center tabular-nums">
        {formatValue(failed)}
      </span>
    </div>
  )
})
