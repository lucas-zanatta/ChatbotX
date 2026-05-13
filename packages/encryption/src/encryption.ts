import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { z } from "zod"
import { env } from "./keys"

const CURRENT_VERSION = 1
const IV_LENGTH_BYTES = 12
const AUTH_TAG_LENGTH_BYTES = 16
const KEY_LENGTH_BYTES = 32
const ALGORITHM = "aes-256-gcm" as const

export const encryptedDataSchema = z.object({
  v: z.literal(CURRENT_VERSION),
  iv: z.string().length(IV_LENGTH_BYTES * 2),
  text: z.string().min(1),
  tag: z.string().length(AUTH_TAG_LENGTH_BYTES * 2),
})
export type EncryptedData = z.infer<typeof encryptedDataSchema>

let cachedKey: Buffer | null = null

const getKey = (): Buffer => {
  if (cachedKey) {
    return cachedKey
  }
  const key = Buffer.from(env.ENCRYPTION_KEY, "hex")
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must decode to ${KEY_LENGTH_BYTES} bytes; got ${key.length}.`,
    )
  }
  cachedKey = key
  return cachedKey
}

const assertCurrentVersion = (v: number): void => {
  if (v !== CURRENT_VERSION) {
    throw new Error(
      `Unsupported encryption version: ${v}. Expected ${CURRENT_VERSION}.`,
    )
  }
}

export const encryptUtils = {
  encryptText: (text: string): EncryptedData => {
    const iv = randomBytes(IV_LENGTH_BYTES)
    const cipher = createCipheriv(ALGORITHM, getKey(), iv)
    const encryptedText = Buffer.concat([
      cipher.update(text, "utf-8"),
      cipher.final(),
    ])
    const tag = cipher.getAuthTag()

    return {
      v: CURRENT_VERSION,
      iv: iv.toString("hex"),
      text: encryptedText.toString("hex"),
      tag: tag.toString("hex"),
    }
  },

  decryptText: (encryptedData: EncryptedData): string => {
    assertCurrentVersion(encryptedData.v)
    const iv = Buffer.from(encryptedData.iv, "hex")
    const tag = Buffer.from(encryptedData.tag, "hex")
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
    decipher.setAuthTag(tag)
    const result = Buffer.concat([
      decipher.update(encryptedData.text, "hex"),
      decipher.final(),
    ])
    return result.toString("utf-8")
  },

  encryptObject: (object: unknown): EncryptedData =>
    encryptUtils.encryptText(JSON.stringify(object)),

  decryptObject: <T>(encryptedData: EncryptedData, schema: z.ZodType<T>): T => {
    const text = encryptUtils.decryptText(encryptedData)
    const parsed: unknown = JSON.parse(text)
    return schema.parse(parsed)
  },
}
