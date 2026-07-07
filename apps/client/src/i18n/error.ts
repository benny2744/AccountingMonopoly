import { format, isValidKey, type I18nKey } from "@amono/shared/i18n";

export function translateServerError(
  code: string,
  fallback: string,
  params?: Record<string, unknown>,
): string {
  const key = `errors.${code}` as I18nKey;
  if (!isValidKey(key)) return fallback;
  const translated = format(
    key,
    params as Record<string, string | number> | undefined,
  );
  // If placeholders remain, the server didn't send all params; fall back.
  if (/\{\{[^}]+\}\}/.test(translated)) return fallback;
  return translated;
}
