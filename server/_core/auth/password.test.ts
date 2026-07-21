import { describe, expect, it } from "vitest";
import { hashPassword, isPasswordStrongEnough, verifyPassword } from "./password";

describe("password hashing", () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "wrong password")).toBe(false);
  });

  it("produces a different hash each time (self-salting)", async () => {
    const first = await hashPassword("same input password");
    const second = await hashPassword("same input password");
    expect(first).not.toEqual(second);
    expect(await verifyPassword(first, "same input password")).toBe(true);
    expect(await verifyPassword(second, "same input password")).toBe(true);
  });
});

describe("isPasswordStrongEnough", () => {
  it("rejects passwords shorter than the minimum", () => {
    expect(isPasswordStrongEnough("short")).toBe(false);
    expect(isPasswordStrongEnough("elevenchars")).toBe(false);
  });

  it("accepts passwords at or above the minimum length", () => {
    expect(isPasswordStrongEnough("twelvecharas")).toBe(true);
    expect(isPasswordStrongEnough("a".repeat(512))).toBe(true);
  });

  it("rejects passwords over the maximum length", () => {
    expect(isPasswordStrongEnough("a".repeat(513))).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isPasswordStrongEnough(undefined as unknown as string)).toBe(false);
  });
});
