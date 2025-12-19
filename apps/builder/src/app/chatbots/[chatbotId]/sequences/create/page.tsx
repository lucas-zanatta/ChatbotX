import { CreateSequenceForm } from "@/features/sequences/create-sequence-form"

export default async function CreateSequencePage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await props.params

  return <CreateSequenceForm chatbotId={chatbotId} />
}
