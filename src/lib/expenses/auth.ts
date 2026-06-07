// Wave 3 auth: simple shared-password gate. No users, no sessions table — a
// single EXPENSES_PASSWORD env var plus a signed cookie is enough to keep the
// /expenses/* routes off the public internet. If the env var is empty, auth
// is fully disabled (back-compat for local dev and the existing PWA install).
//
// HMAC uses the Web Crypto API (crypto.subtle) so the same code runs in both
// the Edge runtime (middleware) and the Node route handlers — Node's
// `node:crypto` is unavailable on Edge.

const COOKIE_NAME = "expenses_session";
// Wave 3 auth: 30 days. Long enough that the PWA reopens without re-asking,
// short enough that a stolen device eventually locks out.
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
// Wave 3 auth: algorithm tag and the version byte live in the cookie payload
// so we can rotate the format later without breaking older cookies silently.
const VERSION = "v1";

function getPassword(): string {
  return process.env.EXPENSES_PASSWORD?.trim() ?? "";
}

export function isAuthEnabled(): boolean {
  return getPassword().length > 0;
}

function getSubtle(): SubtleCrypto {
  // Wave 3 auth: Web Crypto is available globally on both Edge and Node 20+.
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto API unavailable; auth requires a modern runtime");
  return subtle;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return getSubtle().importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const sig = await getSubtle().sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToHex(new Uint8Array(sig));
}

export async function buildSessionCookieValue(): Promise<string> {
  // Wave 3 auth: payload format is "<version>:<random-uuid>". The version
  // prefix lets us rotate the format later without breaking older cookies
  // silently — we'd just check the prefix on read.
  const nonce = crypto.randomUUID();
  const payload = `${VERSION}:${nonce}`;
  const sig = await signPayload(payload, getPassword());
  return `${payload}.${sig}`;
}

async function verifyCookieValue(value: string | undefined | null): Promise<boolean> {
  if (!value) return false;
  const password = getPassword();
  if (!password) return false;
  const lastDot = value.lastIndexOf(".");
  if (lastDot < 0) return false;
  const payload = value.slice(0, lastDot);
  const provided = value.slice(lastDot + 1);
  if (!payload.startsWith(`${VERSION}:`)) return false;
  const expected = await signPayload(payload, password);
  // Constant-ish compare via length pre-check; Web Crypto verify would also
  // work but the length+equality check is fast and we're not protecting
  // against a side-channel attacker on a single-tenant install.
  if (expected.length !== provided.length) return false;
  return expected === provided;
}

export async function isValidSessionCookie(value: string | undefined | null): Promise<boolean> {
  if (!isAuthEnabled()) return false;
  return verifyCookieValue(value);
}

export function sessionCookieAttributes(): string {
  // Wave 3 auth: HttpOnly + SameSite=Lax. We intentionally do not set Secure
  // here so the cookie works on plain http://localhost during dev; production
  // should be served over HTTPS and rely on a reverse proxy or browser to
  // enforce that. Lax (not Strict) lets the user click a deep link from an
  // email and still land on the page.
  return [
    `${COOKIE_NAME}=%VALUE%`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax"
  ].join("; ");
}

export function readSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) === COOKIE_NAME) return part.slice(eq + 1);
  }
  return null;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
