export const MAX_ANIMAL_ID_LENGTH = 20;
export const MAX_ANIMAL_ID_NUMBER = 2_147_483_646;

const ARABIC_DIGIT_MAP: Record<string, string> = {
  "\u0660": "0", "\u0661": "1", "\u0662": "2", "\u0663": "3", "\u0664": "4",
  "\u0665": "5", "\u0666": "6", "\u0667": "7", "\u0668": "8", "\u0669": "9",
  "\u06F0": "0", "\u06F1": "1", "\u06F2": "2", "\u06F3": "3", "\u06F4": "4",
  "\u06F5": "5", "\u06F6": "6", "\u06F7": "7", "\u06F8": "8", "\u06F9": "9",
};

export function normalizeAnimalIdNumber(value: string, prefix = "") {
  const maxDigits = Math.min(
    String(MAX_ANIMAL_ID_NUMBER).length,
    Math.max(1, MAX_ANIMAL_ID_LENGTH - prefix.length),
  );
  const ascii = value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (ch) => ARABIC_DIGIT_MAP[ch] ?? ch);
  return ascii.replace(/\D/g, "").slice(0, maxDigits);
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
