// Wave 4: independent Bearer-token auth for the SMS webhook endpoint.
// Shortcuts cannot easily manage a signed session cookie, so this route uses a
// dedicated secret from EXPENSES_SMS_TOKEN. If the env var is unset, the
// endpoint is disabled (returns 503) so the route is never accidentally open.

const TOKEN_ENV_VAR = "EXPENSES_SMS_TOKEN";

export function getSmsToken(): string {
  return process.env[TOKEN_ENV_VAR]?.trim() ?? "";
}

export function isSmsAuthEnabled(): boolean {
  return getSmsToken().length > 0;
}

export function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

export function verifySmsToken(token: string | null): boolean {
  if (!isSmsAuthEnabled() || !token) return false;
  const expected = getSmsToken();
  if (expected.length !== token.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i += 1) {
    result |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return result === 0;
}
