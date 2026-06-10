import {
  type SendFoxCreateContactSchema,
  sendFoxCreateContactDefaultFn,
  sendFoxCreateContactSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import SendFoxCreateContactEditor from "./editor"
import SendFoxCreateContactViewer from "./viewer"

export const sendFoxCreateContactStep: StepDefinition<SendFoxCreateContactSchema> =
  {
    editor: SendFoxCreateContactEditor,
    viewer: SendFoxCreateContactViewer,
    validator: sendFoxCreateContactSchema,
    defaultFn: sendFoxCreateContactDefaultFn,
  }
