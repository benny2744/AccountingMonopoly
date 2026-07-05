// Bridge to the experimental node:sqlite builtin. Vite 5.x predates node:sqlite
// and doesn't recognize it as a node builtin, so we import it through
// createRequire which bypasses Vite's ESM resolver.
import { createRequire } from "node:module";

const nativeRequire = createRequire(import.meta.url);
export const { DatabaseSync } = nativeRequire("node:sqlite") as typeof import("node:sqlite");
