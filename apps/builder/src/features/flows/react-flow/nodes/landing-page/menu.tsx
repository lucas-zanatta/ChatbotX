import { PAGE_ELEMENT_MENU } from "../../steps/email/page-node-menu"
import type { MenuItem, TranslationFn } from "../types"

export const landingPageEditorMenus = (t: TranslationFn): MenuItem[] =>
  PAGE_ELEMENT_MENU.map((item) => ({
    label: t(item.labelKey),
    icon: item.icon,
    stepType: null,
  }))
