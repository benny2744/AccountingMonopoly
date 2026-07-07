import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { t, setLocale as setSharedLocale, getLocale, locales, type Locale } from "@amono/shared/i18n";

const STORAGE_KEY = "amono-locale";

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: typeof t;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh-CN") return stored;
    return getLocale();
  });

  useEffect(() => {
    setSharedLocale(locale);
    document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : "en";
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const setLocaleWrapper = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale: setLocaleWrapper, t }),
    [locale, setLocaleWrapper],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
