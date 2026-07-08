import { createHmac, timingSafeEqual } from "node:crypto";
import { GameError } from "./gameService.js";

const DEV_USERNAME = "admin";
const DEV_PASSWORD = "admin";
const DEV_SECRET = "amono-dev-admin-secret";

let prodCredWarningLogged = false;

function warnOnInsecureProdDefaults(): void {
  if (prodCredWarningLogged || process.env.NODE_ENV !== "production") return;
  prodCredWarningLogged = true;
  if (!process.env.ADMIN_USERNAME) {
    console.warn("[admin] ADMIN_USERNAME is unset; using insecure dev default");
  }
  if (!process.env.ADMIN_PASSWORD) {
    console.warn("[admin] ADMIN_PASSWORD is unset; using insecure dev default");
  }
  if (!process.env.ADMIN_SECRET) {
    console.warn("[admin] ADMIN_SECRET is unset; using insecure dev default");
  }
}

function adminUsername(): string {
  warnOnInsecureProdDefaults();
  return process.env.ADMIN_USERNAME ?? DEV_USERNAME;
}

function adminPassword(): string {
  warnOnInsecureProdDefaults();
  return process.env.ADMIN_PASSWORD ?? DEV_PASSWORD;
}

function adminSecret(): string {
  warnOnInsecureProdDefaults();
  return process.env.ADMIN_SECRET ?? DEV_SECRET;
}

export function verifyCredentials(username: string, password: string): boolean {
  const expectedUser = adminUsername();
  const expectedPass = adminPassword();
  const userOk =
    username.length === expectedUser.length &&
    timingSafeEqual(Buffer.from(username), Buffer.from(expectedUser));
  const passOk =
    password.length === expectedPass.length &&
    timingSafeEqual(Buffer.from(password), Buffer.from(expectedPass));
  return userOk && passOk;
}

function signPayload(payload: string): string {
  return createHmac("sha256", adminSecret()).update(payload).digest("base64url");
}

/** Issue a stateless admin token (survives server restarts). */
export function issueAdminToken(): string {
  const payload = Buffer.from(JSON.stringify({ iat: Date.now() }), "utf8").toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signPayload(payload);
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export function requireAdmin(headerValue: string | undefined): void {
  if (!verifyAdminToken(headerValue)) {
    throw new GameError("NOT_ADMIN", "Admin authentication required");
  }
}
