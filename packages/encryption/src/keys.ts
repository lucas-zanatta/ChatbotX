import { createEnv } from "@t3-oss/env-core"
import z from "zod"

const ENCRYPTION_KEY_HEX_LENGTH = 64
const HEX_REGEX = /^[0-9a-fA-F]+$/

export const keys = () =>
  createEnv({
    server: {
      ENCRYPTION_KEY: z
        .string()
        .length(
          ENCRYPTION_KEY_HEX_LENGTH,
          "ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars). Generate with: openssl rand -hex 32",
        )
        .regex(
          HEX_REGEX,
          "ENCRYPTION_KEY must be a hex-encoded string (0-9, a-f).",
        ),
    },
    runtimeEnv: process.env,
  })

export const env = keys()
