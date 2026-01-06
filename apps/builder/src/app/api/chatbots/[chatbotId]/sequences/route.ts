import { NextResponse } from "next/server"
import { listSequences } from "@/features/sequences/queries"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  const { chatbotId } = await params
  const { searchParams } = new URL(request.url)

  const page = Number(searchParams.get("page")) || 1
  const perPage = Number(searchParams.get("perPage")) || 10
  const name = searchParams.get("name") || ""
  const folderId = searchParams.get("folderId") || undefined
  const activeParam = searchParams.get("active")
  const active = activeParam ? activeParam === "true" : null

  const input = {
    chatbotId,
    page,
    perPage,
    name,
    folderId,
    active,
  }

  const result = await listSequences(input)

  return NextResponse.json(result)
}
