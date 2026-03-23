import { refreshGoogleAccessToken } from "@/lib/googleCalendar";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { decryptToken, encryptToken } from "@/lib/tokenCrypto";

export type TokenState = {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  tokenScope: string | null;
};

type WithTokenFields = {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  token_scope: string | null;
};

/**
 * Decrypts access_token and refresh_token in a calendar integration row fetched
 * from Supabase. Rows that still hold plaintext values (pre-migration) pass through
 * unchanged because decryptToken is backwards-compatible.
 */
export function decryptIntegrationTokens<T extends WithTokenFields>(row: T): T {
  return {
    ...row,
    access_token: row.access_token ? decryptToken(row.access_token) : null,
    refresh_token: row.refresh_token ? decryptToken(row.refresh_token) : null,
  };
}

/**
 * Returns a valid access token for the given integration.
 * Expects the integration row to have already been decrypted with
 * decryptIntegrationTokens (i.e. access_token / refresh_token are plain text).
 */
export async function ensureValidAccessToken(
  integration: WithTokenFields,
  forceRefresh = false
): Promise<TokenState> {
  const expiresAtMs = integration.token_expires_at
    ? new Date(integration.token_expires_at).getTime()
    : 0;
  const isExpiredOrMissing =
    forceRefresh ||
    !integration.access_token ||
    !expiresAtMs ||
    expiresAtMs <= Date.now() + 60_000;

  if (!isExpiredOrMissing) {
    return {
      accessToken: integration.access_token!,
      refreshToken: integration.refresh_token,
      tokenExpiresAt: integration.token_expires_at,
      tokenScope: integration.token_scope,
    };
  }

  if (!integration.refresh_token) {
    throw new Error("Google refresh token mancante. Ricollega l'integrazione.");
  }

  const refreshed = await refreshGoogleAccessToken(integration.refresh_token);
  const tokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
  return {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    tokenExpiresAt,
    tokenScope: refreshed.scope,
  };
}

/**
 * Persists token state back to calendar_integrations, encrypting
 * access_token and refresh_token before writing to Supabase.
 */
export async function persistIntegrationTokens(
  integrationId: string,
  tokenState: TokenState
): Promise<void> {
  const supabaseAdmin = getSupabaseAdminClient();
  await supabaseAdmin
    .from("calendar_integrations")
    .update({
      access_token: encryptToken(tokenState.accessToken),
      refresh_token: tokenState.refreshToken
        ? encryptToken(tokenState.refreshToken)
        : null,
      token_expires_at: tokenState.tokenExpiresAt,
      token_scope: tokenState.tokenScope,
      updated_at: new Date().toISOString(),
    })
    .eq("id", integrationId);
}
