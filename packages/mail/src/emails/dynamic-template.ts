import { z } from "zod"

export const mailElementTypes = z.enum([
  "Heading",
  "Text",
  "Image",
  "Button",
  "Spacing",
  "Code",
  "Line",
])
export type MailElementType = z.infer<typeof mailElementTypes>

export const mailElementSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum([
      mailElementTypes.enum.Heading,
      mailElementTypes.enum.Text,
      mailElementTypes.enum.Code,
    ]),
    text: z.string(),
  }),
  z.object({
    type: z.enum([mailElementTypes.enum.Image]),
    url: z.string().optional(),
  }),
  z.object({
    type: z.enum([mailElementTypes.enum.Line, mailElementTypes.enum.Spacing]),
  }),
  z.object({
    type: z.literal(mailElementTypes.enum.Button),
    label: z.string().optional(),
    url: z.string().optional(),
  }),
])
export type MailElementSchema = z.infer<typeof mailElementSchema>

export const elements = z.array(mailElementSchema)

export type DynamicEmailProps = {
  brandName: string
  brandLogoUrl: string
  brandUrl: string
  subject: string
  preheader: string
  elements: MailElementSchema[]
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function elementToMjml(element: MailElementSchema): string {
  switch (element.type) {
    case "Heading":
      return `
        <mj-section>
          <mj-column>
            <mj-text font-size="20px" font-weight="700" color="#1d1c1d" line-height="28px" padding="0">
              ${escapeHtml(element.text)}
            </mj-text>
          </mj-column>
        </mj-section>`

    case "Text":
      return `
        <mj-section>
          <mj-column>
            <mj-text font-size="16px" color="#3c3f44" line-height="24px" padding="0">
              ${escapeHtml(element.text)}
            </mj-text>
          </mj-column>
        </mj-section>`

    case "Code":
      return `
        <mj-section>
          <mj-column>
            <mj-text font-family="monospace, Courier New" font-size="14px" color="#3c3f44"
              line-height="22px" background-color="#f4f4f5" padding="12px"
              container-background-color="#f4f4f5">
              ${escapeHtml(element.text).replace(/\n/g, "<br />")}
            </mj-text>
          </mj-column>
        </mj-section>`

    case "Image":
      return element.url
        ? `
        <mj-section>
          <mj-column>
            <mj-image src="${escapeHtml(element.url)}" alt="" />
          </mj-column>
        </mj-section>`
        : ""

    case "Button":
      return element.url
        ? `
        <mj-section>
          <mj-column>
            <mj-button background-color="#111111" color="#ffffff" font-size="14px"
              font-weight="700" border-radius="4px" href="${escapeHtml(element.url)}">
              ${escapeHtml(element.label || "Click here")}
            </mj-button>
          </mj-column>
        </mj-section>`
        : ""

    case "Line":
      return `
        <mj-section>
          <mj-column>
            <mj-divider border-color="#e8e8e8" border-width="1px" />
          </mj-column>
        </mj-section>`

    case "Spacing":
      return `<mj-section padding="12px 0" />`

    default:
      return ""
  }
}

export function buildMjmlTemplate(props: DynamicEmailProps): string {
  const { elements: els } = props
  const bodyElements = els.map(elementToMjml).join("\n")

  return `
    <mjml>
      <mj-head>
        <mj-preview>
          ${escapeHtml(props.preheader)}
        </mj-preview>
      </mj-head>
      <mj-body background-color="#ffffff">
        ${bodyElements}

        <mj-section>
          <mj-column>
            <mj-text font-size="12px" color="#888" padding="16px 0 0 0">⚡ Built with chatbotx.io</mj-text>
          </mj-column>
        </mj-section>
      </mj-body>
    </mjml>
  `
}
