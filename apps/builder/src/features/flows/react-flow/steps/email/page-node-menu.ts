import {
  buttonStepDefaultFn,
  type PageElementSchema,
  pageElementTypes,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils/id"
import {
  CodeIcon,
  HeadingIcon,
  ImageIcon,
  MinusIcon,
  MoveVerticalIcon,
  RectangleHorizontalIcon,
  TextAlignStartIcon,
} from "lucide-react"

export const PAGE_ELEMENT_MENU = [
  {
    labelKey: "fields.heading.label",
    icon: HeadingIcon,
    defaultFn: headingElementDefaultFn,
    stepType: pageElementTypes.enum.Heading,
  },
  {
    labelKey: "fields.text.label",
    icon: TextAlignStartIcon,
    defaultFn: textElementDefaultFn,
    stepType: pageElementTypes.enum.Text,
  },
  {
    labelKey: "fields.image.label",
    icon: ImageIcon,
    defaultFn: imageElementDefaultFn,
    stepType: pageElementTypes.enum.Image,
  },
  {
    labelKey: "fields.button.label",
    icon: RectangleHorizontalIcon,
    defaultFn: buttonElementDefaultFn,
    stepType: pageElementTypes.enum.Button,
  },
  {
    labelKey: "fields.line.label",
    icon: MinusIcon,
    defaultFn: lineElementDefaultFn,
    stepType: pageElementTypes.enum.Line,
  },
  {
    labelKey: "fields.spacing.label",
    icon: MoveVerticalIcon,
    defaultFn: spacingElementDefaultFn,
    stepType: pageElementTypes.enum.Spacing,
  },
  {
    labelKey: "fields.code.label",
    icon: CodeIcon,
    defaultFn: codeElementDefaultFn,
    stepType: pageElementTypes.enum.Code,
  },
]

function headingElementDefaultFn(): PageElementSchema {
  return {
    id: createId(),
    type: pageElementTypes.enum.Heading,
    text: "",
  }
}

function textElementDefaultFn(): PageElementSchema {
  return {
    id: createId(),
    type: pageElementTypes.enum.Text,
    text: "",
  }
}

function imageElementDefaultFn(): PageElementSchema {
  return {
    id: createId(),
    type: pageElementTypes.enum.Image,
    mode: "file",
    url: "",
  }
}

function buttonElementDefaultFn(): PageElementSchema {
  return {
    id: createId(),
    type: pageElementTypes.enum.Button,
    beforeStep: buttonStepDefaultFn(),
  }
}

function lineElementDefaultFn(): PageElementSchema {
  return {
    id: createId(),
    type: pageElementTypes.enum.Line,
  }
}

function spacingElementDefaultFn(): PageElementSchema {
  return {
    id: createId(),
    type: pageElementTypes.enum.Spacing,
  }
}

function codeElementDefaultFn(): PageElementSchema {
  return {
    id: createId(),
    type: pageElementTypes.enum.Code,
    text: "",
  }
}
