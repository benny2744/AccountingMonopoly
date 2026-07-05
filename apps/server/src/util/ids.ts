import { createHash, randomUUID } from "node:crypto";

export function uuid(): string {
  return randomUUID();
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
export function roomCode(length = 5): string {
  let out = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export function now(): string {
  return new Date().toISOString();
}
