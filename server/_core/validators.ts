import { z } from "zod";
import { MAX_ANIMAL_ID_LENGTH, MAX_ANIMAL_ID_NUMBER, normalizeAnimalIdNumber } from "../../shared/animalIds";

/**
 * Shared input validators for business data. Money and weight come in as
 * strings (decimal columns), so we validate they parse to sane, non-negative
 * numbers within realistic ranges to keep reports trustworthy.
 */

// A decimal string representing money: non-negative, <= 100 million.
export const moneyString = z
  .string()
  .refine((s) => s.trim() !== "" && !isNaN(parseFloat(s)), "Must be a number")
  .refine((s) => parseFloat(s) >= 0, "Cannot be negative")
  .refine((s) => parseFloat(s) <= 100_000_000, "Unrealistically large amount");

export const optionalMoneyString = moneyString.optional();

// A weight in kg: > 0 and <= 2000 (covers cattle; rejects typos like 99999).
export const weightString = z
  .string()
  .refine((s) => s.trim() !== "" && !isNaN(parseFloat(s)), "Must be a number")
  .refine((s) => parseFloat(s) > 0, "Weight must be greater than 0")
  .refine((s) => parseFloat(s) <= 2000, "Weight is unrealistically large");

export const optionalWeightString = weightString.optional();

export const optionalAnimalIdNumber = z.preprocess(
  value => {
    if (value === "" || value === undefined || value === null) return undefined;
    if (typeof value === "string") return normalizeAnimalIdNumber(value);
    return value;
  },
  z.string()
    .trim()
    .min(1)
    .max(MAX_ANIMAL_ID_LENGTH)
    .regex(/^\d+$/, "Animal ID number must contain digits only")
    .refine(
      value => !/^\d+$/.test(value) ||
        BigInt(value) <= BigInt(MAX_ANIMAL_ID_NUMBER),
      "Animal ID number is too large",
    )
    .optional(),
);

// A feed/ration quantity in kg: >= 0 and <= 1,000,000.
export const qtyString = z
  .string()
  .refine((s) => s.trim() !== "" && !isNaN(parseFloat(s)), "Must be a number")
  .refine((s) => parseFloat(s) >= 0, "Cannot be negative")
  .refine((s) => parseFloat(s) <= 1_000_000, "Quantity is unrealistically large");

// A per-head-per-day ration rate: >= 0 and <= 100 kg/day.
export const rationRateString = z
  .string()
  .refine((s) => s.trim() !== "" && !isNaN(parseFloat(s)), "Must be a number")
  .refine((s) => parseFloat(s) >= 0, "Cannot be negative")
  .refine((s) => parseFloat(s) <= 100, "Ration rate is unrealistically large");

// An ISO date (YYYY-MM-DD) that is not in the future (for events that already happened).
export const pastOrTodayDate = z
  .string()
  .refine((s) => !isNaN(Date.parse(s)), "Invalid date")
  .refine(
    (s) => new Date(s) <= new Date(new Date().toISOString().split("T")[0] + "T23:59:59"),
    "Date cannot be in the future"
  );

// A plain valid ISO date (may be future, e.g. effective dates).
export const isoDate = z
  .string()
  .refine((s) => !isNaN(Date.parse(s)), "Invalid date");
