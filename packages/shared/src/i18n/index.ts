import { en } from "./locales/en.js";
import { zhCN } from "./locales/zh-CN.js";
import { flatten } from "./flatten.js";
import type { Locale, Messages, TranslationKey } from "./types.js";

export * from "./labels.js";
export type { Locale, TranslationKey };
export type I18nKey = TranslationKey<typeof en>;

const flatEn = flatten(en as unknown as Record<string, unknown>);
const flatZh = flatten(zhCN as unknown as Record<string, unknown>);

const dictionaries: Record<Locale, Record<string, string>> = {
  en: flatEn,
  "zh-CN": flatZh,
};

let currentLocale: Locale = "zh-CN";

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: I18nKey, params?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale] ?? dictionaries["zh-CN"];
  let text = dict[key as string] ?? dictionaries.en[key as string] ?? (key as string);
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{{${name}}}`).join(String(value));
    }
  }
  return text;
}

export function format(key: I18nKey, params?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale] ?? dictionaries["zh-CN"];
  let text = dict[key as string] ?? dictionaries.en[key as string] ?? (key as string);
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      const display = typeof value === "string" && isValidKey(value) ? t(value as I18nKey) : String(value);
      text = text.split(`{{${name}}}`).join(display);
    }
  }
  return text;
}

export function isValidKey(key: string): key is I18nKey {
  return key in flatEn;
}

export const locales: { value: Locale; label: string }[] = [
  { value: "zh-CN", label: zhCN.common.chinese },
  { value: "en", label: en.common.english },
];
