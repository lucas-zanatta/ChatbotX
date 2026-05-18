import { systemFunctionNames, toolPrefixes } from "@chatbotx.io/ai"

export const MAX_WEB_SEARCH_AUTHORIZED_DOMAINS = 20

export const webSearchToolValue = `${toolPrefixes.enum.sys}:${systemFunctionNames.webSearch}`

type WebSearchAuthorizedDomain = {
  value: string
}

export function isWebSearchSelected(tools?: string[] | null): boolean {
  return Boolean(tools?.includes(webSearchToolValue))
}

export function normalizeWebSearchDomains(
  domains?: WebSearchAuthorizedDomain[] | null,
): string[] {
  const normalizedDomains = new Set<string>()

  for (const domain of domains ?? []) {
    const normalizedDomain = domain.value.trim().toLowerCase()

    if (normalizedDomain) {
      normalizedDomains.add(normalizedDomain)
    }
  }

  return Array.from(normalizedDomains)
}
