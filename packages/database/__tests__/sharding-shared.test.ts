import { afterEach, describe, expect, test, vi } from "vitest"

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { envInt } from "../src/sharding/shared/env"

describe("envInt", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("returns the parsed value for a valid integer", () => {
    vi.stubEnv("TEST_SHARD_ENV", "1500")
    expect(envInt("TEST_SHARD_ENV", 60_000)).toBe(1500)
  })

  test("returns the fallback when the variable is unset", () => {
    expect(envInt("TEST_SHARD_ENV_UNSET", 60_000)).toBe(60_000)
  })

  test("returns the fallback for a non-numeric value (NaN guard)", () => {
    vi.stubEnv("TEST_SHARD_ENV", "abc")
    expect(envInt("TEST_SHARD_ENV", 60_000)).toBe(60_000)
  })

  test("returns the fallback for a negative value", () => {
    vi.stubEnv("TEST_SHARD_ENV", "-5")
    expect(envInt("TEST_SHARD_ENV", 60_000)).toBe(60_000)
  })

  test("returns the fallback for a non-integer value", () => {
    vi.stubEnv("TEST_SHARD_ENV", "1.5")
    expect(envInt("TEST_SHARD_ENV", 60_000)).toBe(60_000)
  })

  test("accepts zero by default", () => {
    vi.stubEnv("TEST_SHARD_ENV", "0")
    expect(envInt("TEST_SHARD_ENV", 60_000)).toBe(0)
  })

  test("returns the fallback when the value is below min (pool max must be positive)", () => {
    vi.stubEnv("TEST_SHARD_ENV", "0")
    expect(envInt("TEST_SHARD_ENV", 10, { min: 1 })).toBe(10)
  })

  test("accepts values at or above min", () => {
    vi.stubEnv("TEST_SHARD_ENV", "25")
    expect(envInt("TEST_SHARD_ENV", 10, { min: 1 })).toBe(25)
  })
})
