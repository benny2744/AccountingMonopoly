// Flatten nested translation dictionaries into a dot-key map for runtime lookups.

export function flatten(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const res: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      res[newKey] = value;
    } else if (typeof value === "object" && value !== null) {
      Object.assign(res, flatten(value as Record<string, unknown>, newKey));
    }
  }
  return res;
}
