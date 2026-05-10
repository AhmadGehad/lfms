import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const toggle = () => {
    const next = isArabic ? "en" : "ar";
    i18n.changeLanguage(next);
    // Apply RTL direction to document
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = next;
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="gap-1.5 font-medium text-xs"
      title={isArabic ? "Switch to English" : "التبديل إلى العربية"}
    >
      <Globe className="h-3.5 w-3.5" />
      {isArabic ? "EN" : "عربي"}
    </Button>
  );
}
