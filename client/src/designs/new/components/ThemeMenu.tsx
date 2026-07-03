import { useTheme, type ThemePreference } from "@/contexts/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Monitor, Moon, Sun, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

const OPTIONS: { value: ThemePreference; icon: typeof Sun; labelKey: string; fallback: string }[] = [
  { value: "light", icon: Sun, labelKey: "theme.light", fallback: "Light" },
  { value: "dark", icon: Moon, labelKey: "theme.dark", fallback: "Dark" },
  { value: "system", icon: Monitor, labelKey: "theme.system", fallback: "System" },
];

/** Light / Dark / System control. Independent of design version (ux-audit/11 §F). */
export function ThemeMenu() {
  const { theme, themePreference, setThemePreference } = useTheme();
  const { t } = useTranslation();
  const Active = themePreference === "system" ? Monitor : theme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-foreground/70 hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring sm:h-9 sm:w-9"
          aria-label={t("theme.label", "Theme")}
        >
          <Active className="h-[18px] w-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {OPTIONS.map(o => (
          <DropdownMenuItem
            key={o.value}
            onClick={() => setThemePreference(o.value)}
            className="cursor-pointer gap-2"
          >
            <o.icon className="h-4 w-4" />
            <span className="flex-1">{t(o.labelKey, o.fallback)}</span>
            {themePreference === o.value && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
