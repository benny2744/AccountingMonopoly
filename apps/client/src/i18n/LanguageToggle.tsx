import { useTranslation } from "./useTranslation.js";
import { locales, type Locale } from "@amono/shared/i18n";

export function LanguageToggle() {
  const { locale, setLocale } = useTranslation();
  return (
    <select
      aria-label={locales.find((l) => l.value === locale)?.label ?? "Language"}
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none"
    >
      {locales.map((l) => (
        <option key={l.value} value={l.value}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
