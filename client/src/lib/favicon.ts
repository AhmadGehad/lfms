import { useEffect } from "react";

const DEFAULT_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%232F5233'/%3E%3Cpath d='M16 6l8 4v6c0 5-3 8-8 11-5-3-8-6-8-11v-6l8-4z' fill='none' stroke='%23F7F5EE' stroke-width='2'/%3E%3C/svg%3E";

/** Swaps the browser tab icon between the tenant's custom favicon and the default LFMS mark. */
export function useFavicon(hasCustomFavicon: boolean | undefined) {
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = hasCustomFavicon ? "/public/company-favicon" : DEFAULT_FAVICON;
  }, [hasCustomFavicon]);
}
