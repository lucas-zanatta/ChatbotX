import { Snowflake } from "uuniq"

const NumericSnowflakeIDs = new Snowflake({
  epoch: new Date("2026-03-31").toISOString(),
})

export const SymbolicSnowflakeIDs = new Snowflake({
  epoch: new Date("2026-03-31").toISOString(),
  format: "symbolic",
  place_id: 1,
})

export const createId = (): string => NumericSnowflakeIDs.generate()

export const parseBigIntId = (
  id: string | undefined | null,
): string | undefined => {
  if (!id) {
    return
  }
  try {
    return BigInt(id).toString()
  } catch {
    return
  }
}

export const getIdFromParams = <
  T extends Record<string, string | undefined | null>,
>(
  params: T,
  fieldName: keyof T,
) => params[fieldName]

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const BASE = BigInt(CHARSET.length)

export function encode(input: string): string {
  let num = BigInt(input)

  if (num === 0n) {
    return CHARSET[0]
  }
  if (num < 0n) {
    throw new Error("Input must be a non-negative integer string")
  }

  let result = ""

  while (num > 0n) {
    const remainder = num % BASE
    result = CHARSET[Number(remainder)] + result
    num /= BASE
  }
  return result
}

export function decode(input: string): string {
  let result = 0n

  for (const char of input) {
    const index = CHARSET.indexOf(char)

    if (index === -1) {
      throw new Error(`Invalid character in string: ${char}`)
    }

    result = result * BASE + BigInt(index)
  }
  return result.toString()
}
