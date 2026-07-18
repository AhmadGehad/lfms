const FARM_SELECTION_PREFIX = "lfms-farm-public-id";

function storageKey() {
  return `${FARM_SELECTION_PREFIX}:${window.location.hostname.toLowerCase()}`;
}

export function getStoredFarmPublicId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(storageKey());
}

export function setStoredFarmPublicId(publicId: string | null): void {
  if (typeof window === "undefined") return;
  if (publicId) localStorage.setItem(storageKey(), publicId);
  else localStorage.removeItem(storageKey());
}
