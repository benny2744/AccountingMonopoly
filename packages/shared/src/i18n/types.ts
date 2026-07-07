// PRD Phase 5: typed i18n core for full content switching.
// Keep this module dependency-free: no React, Express, or Socket.IO.

export type Locale = "en" | "zh-CN";

export type Flatten<T, Prefix extends string = ""> = T extends string
  ? Prefix extends ""
    ? never
    : { [K in Prefix]: T }
  : T extends object
    ? {
        [K in keyof T]: Flatten<
          T[K],
          Prefix extends "" ? K & string : `${Prefix}.${K & string}`
        >;
      }[keyof T]
    : never;

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I
) => void
  ? I
  : never;

export type Messages<T> = UnionToIntersection<Flatten<T>>;
export type TranslationKey<T> = keyof Messages<T>;
