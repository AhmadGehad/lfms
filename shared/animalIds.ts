export const MAX_ANIMAL_ID_LENGTH = 20;
export const MAX_ANIMAL_ID_NUMBER = 2_147_483_646;

export function normalizeAnimalIdNumber(value: string, prefix = "") {
  const maxDigits = Math.min(
    String(MAX_ANIMAL_ID_NUMBER).length,
    Math.max(1, MAX_ANIMAL_ID_LENGTH - prefix.length),
  );
  return value.replace(/\D/g, "").slice(0, maxDigits);
}

export function composeAnimalId(prefix: string, number: string) {
  const normalized = number.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error("Animal ID number must contain digits only");
  }

  const animalId = `${prefix}${normalized}`;
  if (animalId.length > MAX_ANIMAL_ID_LENGTH) {
    throw new Error(`Animal ID must be at most ${MAX_ANIMAL_ID_LENGTH} characters`);
  }
  return animalId;
}

export function extractAnimalIdNumber(animalId: string, prefix: string) {
  if (animalId.startsWith(prefix)) {
    const suffix = animalId.slice(prefix.length);
    if (/^\d+$/.test(suffix)) return suffix;
  }
  return animalId.match(/(\d+)$/)?.[1] ?? "";
}
