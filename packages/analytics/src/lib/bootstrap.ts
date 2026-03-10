import { initBotMessageSpooler } from "./bot-message-events-spooler"
import { initContactSpooler } from "./contact-events-spooler"
import { initConversationSpooler } from "./conversation-events-spooler"

const BOOTSTRAP_KEY = "__aha_analytics_bootstrap__"
const globalForBootstrap = globalThis as typeof globalThis & {
  [BOOTSTRAP_KEY]?: { initialized: boolean; promise: Promise<void> | null }
}
if (!globalForBootstrap[BOOTSTRAP_KEY]) {
  globalForBootstrap[BOOTSTRAP_KEY] = { initialized: false, promise: null }
}
const state = globalForBootstrap[BOOTSTRAP_KEY]

export async function bootstrapAnalytics() {
  if (state.initialized) {
    return
  }

  if (state.promise) {
    return state.promise
  }

  state.promise = (async () => {
    await initContactSpooler()
    await initBotMessageSpooler()
    await initConversationSpooler()
    state.initialized = true
  })()

  await state.promise
  state.promise = null
}
