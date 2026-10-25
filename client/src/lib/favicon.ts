import { useEffect } from "react";

const DEFAULT_FAVICON = "/favicon.svg";

/** Swaps the browser tab icon between the tenant's custom favicon and the default APIS mark. */
export function useFavicon(hasCustomFavicon: boolean | undefined) {
  useEffect(() => {
    const href = hasCustomFavicon ? "/public/company-favicon" : DEFAULT_FAVICON;
    // index.html declares an SVG and an .ico; update both so browsers that
    // prefer either one still show the company's favicon.
    const links = document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']");
    if (links.length === 0) {
      const link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
      link.href = href;
      return;
    }
    for (const link of links) {
      link.href = href;
      if (hasCustomFavicon) link.removeAttribute("type");
    }
  }, [hasCustomFavicon]);
}
