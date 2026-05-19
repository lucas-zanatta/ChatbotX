import { z } from "zod"

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export const mailElementTypes = z.enum([
  "heading",
  "text",
  "image",
  "button",
  "spacing",
  "code",
  "line",
])
export type MailElementType = z.infer<typeof mailElementTypes>

export const mailElementSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum([
      mailElementTypes.enum.heading,
      mailElementTypes.enum.text,
      mailElementTypes.enum.code,
    ]),
    text: z.string(),
  }),
  z.object({
    type: z.enum([mailElementTypes.enum.image]),
    url: z.string().optional(),
  }),
  z.object({
    type: z.enum([mailElementTypes.enum.line, mailElementTypes.enum.spacing]),
  }),
  z.object({
    type: z.literal(mailElementTypes.enum.button),
    label: z.string().optional(),
    url: z.string().optional(),
  }),
])
export type MailElementSchema = z.infer<typeof mailElementSchema>

export const elements = z.array(mailElementSchema)

export type DynamicEmailProps = {
  brandName: string
  subject: string
  preheader: string
  elements: MailElementSchema[]
}

export function elementToHtmlRow(element: MailElementSchema): string {
  switch (element.type) {
    case "heading":
      return `
        <tr>
          <td style="padding:16px 24px 0;">
            <div style="font-size:20px;font-weight:700;color:#1d1c1d;line-height:28px;">
              ${escapeHtml(element.text)}
            </div>
          </td>
        </tr>`

    case "text":
      return `
        <tr>
          <td style="padding:8px 24px;">
            <div style="font-size:16px;color:#3c3f44;line-height:24px;">
              ${escapeHtml(element.text)}
            </div>
          </td>
        </tr>`

    case "code":
      return `
        <tr>
          <td style="padding:8px 24px;">
            <div style="font-family:monospace,'Courier New';font-size:14px;color:#3c3f44;line-height:22px;background-color:#f4f4f5;padding:12px;border-radius:4px;">
              ${escapeHtml(element.text).replace(/\n/g, "<br />")}
            </div>
          </td>
        </tr>`

    case "image":
      return element.url
        ? `
        <tr>
          <td style="padding:8px 24px;text-align:center;">
            <img src="${escapeHtml(element.url)}" alt="" style="max-width:100%;height:auto;display:block;margin:0 auto;" />
          </td>
        </tr>`
        : ""

    case "button":
      return element.url
        ? `
        <tr>
          <td style="padding:8px 24px;">
            <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(element.url)}" style="height:40px;v-text-anchor:middle;width:200px;" arcsize="10%" stroke="f" fillcolor="#111111"><w:anchorlock/><center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:700;"><!
            [endif]-->
            <a href="${escapeHtml(element.url)}" style="background-color:#111111;border-radius:4px;color:#ffffff;display:inline-block;font-size:14px;font-weight:700;line-height:40px;text-align:center;text-decoration:none;padding:0 24px;-webkit-text-size-adjust:none;mso-hide:all;">
              ${escapeHtml(element.label ?? "Click here")}
            </a>
            <!--[if mso]></center></v:roundrect><![endif]-->
          </td>
        </tr>`
        : ""

    case "line":
      return `
        <tr>
          <td style="padding:8px 24px;">
            <hr style="border:none;border-top:1px solid #e8e8e8;margin:0;" />
          </td>
        </tr>`

    case "spacing":
      return `
        <tr>
          <td style="height:24px;line-height:24px;font-size:24px;">&nbsp;</td>
        </tr>`

    default:
      return ""
  }
}

export function buildEmailHtml(props: DynamicEmailProps): string {
  const rows = props.elements.map(elementToHtmlRow).join("\n")

  return `<!DOCTYPE html>
<html lang="und" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(props.subject)}</title>
  <!--[if !mso]><!-->
  <style type="text/css">
    @media only screen and (max-width:600px) {
      .container { width:100% !important; }
      .content-cell { padding-left:16px !important; padding-right:16px !important; }
    }
  </style>
  <!--<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#ffffff;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(props.preheader)}</div>
  <!--[if mso]>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="width:600px;"><tr><td>
  <![endif]-->
  <div class="container" style="max-width:600px;margin:0 auto;padding:20px 0;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tbody>
        ${rows}
        <tr>
          <td style="padding:16px 24px 24px;font-size:12px;color:#888888;">
            &#9889; Built with chatbotx.io
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`
}
