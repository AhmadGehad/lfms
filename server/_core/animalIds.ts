import { TRPCError } from "@trpc/server";
import { composeAnimalId, MAX_ANIMAL_ID_NUMBER } from "@shared/animalIds";

export function composeAnimalIdOrThrow(prefix: string, number: string) {
  try {
    return composeAnimalId(prefix, number);
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Invalid animal ID number",
    });
  }
}

export function sequenceValueFromAnimalIdNumber(number: string) {
  const value = Number(number);
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_ANIMAL_ID_NUMBER
    ? value
    : null;
}
