"use client"

import {
  type PageElementSchema,
  type PageElementType,
  pageElementTypes,
} from "@chatbotx.io/flow-config"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { ButtonStepEditor } from "../../steps/button/editor"
import { ButtonStepViewer } from "../../steps/button/viewer"

type BuilderProps = {
  parentName: string
  type: PageElementType
}
export function PageElementBuilder({ type, parentName }: BuilderProps) {
  const t = useTranslations()
  switch (type) {
    case pageElementTypes.enum.Heading:
      return (
        <TiptapEditorField
          name={`${parentName}.text`}
          placeholder={t("fields.heading.placeholder")}
        />
      )
    case pageElementTypes.enum.Text:
      return (
        <TiptapEditorField
          name={`${parentName}.text`}
          placeholder={t("fields.text.placeholder")}
        />
      )
    case pageElementTypes.enum.Image:
      return (
        <DirectUploadOrInsertLink fileType="image" parentName={parentName} />
      )
    case pageElementTypes.enum.Button:
      return <ButtonStepEditor parentName={`${parentName}.beforeStep`} />
    case pageElementTypes.enum.Line:
      return <Separator />
    case pageElementTypes.enum.Spacing:
      return <div className="h-4" />
    case pageElementTypes.enum.Code:
      return (
        <TiptapEditorField
          name={`${parentName}.text`}
          placeholder={t("fields.code.placeholder")}
        />
      )
    default:
      return null
  }
}

type ViewerProps = {
  data: PageElementSchema
}
export function PageElementViewer({ data }: ViewerProps) {
  switch (data.type) {
    case pageElementTypes.enum.Heading:
      return <p className="font-semibold">{data.text}</p>
    case pageElementTypes.enum.Text:
      return <p>{data.text}</p>
    case pageElementTypes.enum.Image:
      return (
        <div className="relative h-37.5">
          {data.url?.startsWith("https") ? (
            <Image alt={data.type} fill={true} src={data.url} />
          ) : null}
        </div>
      )
    case pageElementTypes.enum.Button:
      return data.beforeStep ? (
        <ButtonStepViewer data={data.beforeStep} />
      ) : null
    case pageElementTypes.enum.Line:
      return <Separator />
    case pageElementTypes.enum.Spacing:
      return <div className="h-4" />
    case pageElementTypes.enum.Code:
      return <p className="font-mono text-sm">{data.text}</p>
    default:
      return null
  }
}
