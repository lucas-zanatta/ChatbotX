import { describe, expect, test } from "vitest"
import { z } from "zod"
import { type EncryptedData, encryptUtils } from "../src/encryption"

const IV_HEX_RE = /^[0-9a-f]{24}$/
const TAG_HEX_RE = /^[0-9a-f]{32}$/
const UNSUPPORTED_VERSION_RE = /Unsupported encryption version/

describe("encryptUtils", () => {
  describe("text round-trip", () => {
    test("decrypts what was encrypted", () => {
      const plaintext = "hunter2 — special chars: 你好 🚀"
      const blob = encryptUtils.encryptText(plaintext)
      expect(encryptUtils.decryptText(blob)).toBe(plaintext)
    })

    test("produces a versioned blob with iv, text, tag", () => {
      const blob = encryptUtils.encryptText("abc")
      expect(blob.v).toBe(1)
      expect(blob.iv).toMatch(IV_HEX_RE) // 12 bytes = 24 hex chars
      expect(blob.tag).toMatch(TAG_HEX_RE) // 16 bytes = 32 hex chars
      expect(blob.text.length).toBeGreaterThan(0)
    })

    test("two encryptions of same plaintext yield different ciphertexts", () => {
      const a = encryptUtils.encryptText("same")
      const b = encryptUtils.encryptText("same")
      expect(a.iv).not.toBe(b.iv)
      expect(a.text).not.toBe(b.text)
    })
  })

  describe("tamper detection", () => {
    test("flipping a byte in ciphertext throws", () => {
      const blob = encryptUtils.encryptText("attack at dawn")
      const flipped: EncryptedData = {
        ...blob,
        text: flipFirstHexNibble(blob.text),
      }
      expect(() => encryptUtils.decryptText(flipped)).toThrow()
    })

    test("flipping a byte in the auth tag throws", () => {
      const blob = encryptUtils.encryptText("attack at dawn")
      const flipped: EncryptedData = {
        ...blob,
        tag: flipFirstHexNibble(blob.tag),
      }
      expect(() => encryptUtils.decryptText(flipped)).toThrow()
    })

    test("flipping a byte in the IV throws", () => {
      const blob = encryptUtils.encryptText("attack at dawn")
      const flipped: EncryptedData = {
        ...blob,
        iv: flipFirstHexNibble(blob.iv),
      }
      expect(() => encryptUtils.decryptText(flipped)).toThrow()
    })
  })

  describe("version handling", () => {
    test("unknown version is rejected", () => {
      const blob = encryptUtils.encryptText("hi")
      const bogus = { ...blob, v: 999 as unknown as 1 }
      expect(() => encryptUtils.decryptText(bogus)).toThrow(
        UNSUPPORTED_VERSION_RE,
      )
    })
  })

  describe("object round-trip", () => {
    const secretsSchema = z.object({
      apiKey: z.string(),
      verifyToken: z.string(),
    })

    test("decryptObject parses against schema", () => {
      const original = { apiKey: "k_live_123", verifyToken: "vt-xyz" }
      const blob = encryptUtils.encryptObject(original)
      const recovered = encryptUtils.decryptObject(blob, secretsSchema)
      expect(recovered).toEqual(original)
    })

    test("decryptObject throws when the decrypted value does not match schema", () => {
      const blob = encryptUtils.encryptObject({ apiKey: 42 })
      expect(() => encryptUtils.decryptObject(blob, secretsSchema)).toThrow()
    })
  })
})

const FLIP_HEX_MAP: Record<string, string> = {
  "0": "f",
  "1": "e",
  "2": "d",
  "3": "c",
  "4": "b",
  "5": "a",
  "6": "9",
  "7": "8",
  "8": "7",
  "9": "6",
  a: "5",
  b: "4",
  c: "3",
  d: "2",
  e: "1",
  f: "0",
}

const flipFirstHexNibble = (hex: string): string => {
  const head = (hex[0] ?? "0").toLowerCase()
  const flipped = FLIP_HEX_MAP[head] ?? "0"
  return flipped + hex.slice(1)
}
