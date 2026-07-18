import { describe, expect, it } from "vitest";
import { generatePublicId, isPublicId, normalizePublicId } from "./publicIds";

describe("public IDs", () => {
  it("generates a canonical 26-character ULID", () => {
    const value = generatePublicId(1_720_000_000_000, new Uint8Array(10).fill(7));
    expect(value).toHaveLength(26);
    expect(isPublicId(value)).toBe(true);
  });

  it("sorts by timestamp", () => {
    const entropy = new Uint8Array(10);
    expect(generatePublicId(100, entropy) < generatePublicId(101, entropy)).toBe(true);
  });

  it("normalizes case and rejects ambiguous characters", () => {
    const id = generatePublicId(100, new Uint8Array(10));
    expect(normalizePublicId(id.toLowerCase())).toBe(id);
    expect(() => normalizePublicId(`${id.slice(0, 25)}I`)).toThrow(/invalid/i);
  });
});
