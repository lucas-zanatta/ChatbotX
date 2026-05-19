import type nodemailer from "nodemailer"
import type { DynamicEmailProps } from "./emails/dynamic-template"
import { buildEmailHtml } from "./emails/dynamic-template"
import { keys } from "./keys"
import { createSmtpTransporter } from "./transport"

export type {
  DynamicEmailProps,
  MailElementSchema,
} from "./emails/dynamic-template"

export { buildEmailHtml } from "./emails/dynamic-template"

export const sendDynamicEmail = async (
  email: string,
  props: DynamicEmailProps,
  options?: { from?: string; transporter?: nodemailer.Transporter },
) => {
  const env = keys()
  const html = buildEmailHtml(props)
  const transporter = options?.transporter ?? createSmtpTransporter()
  await transporter.sendMail({
    from: options?.from ?? env.NEXT_PUBLIC_SMTP_FROM,
    to: email,
    subject: props.subject,
    html,
  })
}
