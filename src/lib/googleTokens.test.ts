import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the crypto module before importing googleTokens
vi.mock("@/lib/tokenCrypto", () => ({
  encryptToken: (v: string) => `enc:v1:mock:${v}`,
  decryptToken: (v: string) => (v.startsWith("enc:v1:mock:") ? v.slice("enc:v1:mock:".length) : v),
}));

// Mock googleCalendar so no real HTTP calls are made
vi.mock("@/lib/googleCalendar", () => ({
  refreshGoogleAccessToken: vi.fn(),
}));

// Mock supabaseAdmin to avoid real DB calls
vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdminClient: vi.fn(() => ({
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  })),
}));

import { decryptIntegrationTokens, ensureValidAccessToken } from "./googleTokens";
import { refreshGoogleAccessToken } from "@/lib/googleCalendar";

const mockRefresh = vi.mocked(refreshGoogleAccessToken);

const FUTURE = new Date(Date.now() + 3600 * 1000).toISOString();
const PAST = new Date(Date.now() - 3600 * 1000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("decryptIntegrationTokens", () => {
  it("decrypts encrypted access_token and refresh_token", () => {
    const row = {
      id: "1",
      user_id: "u1",
      calendar_id: "primary",
      access_token: "enc:v1:mock:real_access",
      refresh_token: "enc:v1:mock:real_refresh",
      token_expires_at: FUTURE,
      token_scope: "calendar",
      sync_token: null,
      connection_status: "ACTIVE",
    };
    const result = decryptIntegrationTokens(row);
    expect(result.access_token).toBe("real_access");
    expect(result.refresh_token).toBe("real_refresh");
  });

  it("passes through plaintext tokens unchanged (backward compat)", () => {
    const row = {
      id: "1",
      user_id: "u1",
      calendar_id: "primary",
      access_token: "ya29.plaintext",
      refresh_token: "1//plaintext_refresh",
      token_expires_at: FUTURE,
      token_scope: "calendar",
      sync_token: null,
      connection_status: "ACTIVE",
    };
    const result = decryptIntegrationTokens(row);
    expect(result.access_token).toBe("ya29.plaintext");
    expect(result.refresh_token).toBe("1//plaintext_refresh");
  });

  it("handles null tokens without throwing", () => {
    const row = {
      id: "1",
      user_id: "u1",
      calendar_id: "primary",
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      token_scope: null,
    };
    const result = decryptIntegrationTokens(row);
    expect(result.access_token).toBeNull();
    expect(result.refresh_token).toBeNull();
  });
});

describe("ensureValidAccessToken", () => {
  it("returns existing token when not expired", async () => {
    const integration = {
      access_token: "valid_token",
      refresh_token: "refresh",
      token_expires_at: FUTURE,
      token_scope: "calendar",
    };
    const result = await ensureValidAccessToken(integration);
    expect(result.accessToken).toBe("valid_token");
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("refreshes token when expired", async () => {
    mockRefresh.mockResolvedValueOnce({
      accessToken: "new_access",
      refreshToken: "new_refresh",
      expiresIn: 3600,
      scope: "calendar",
      tokenType: "Bearer",
    });

    const integration = {
      access_token: "old_token",
      refresh_token: "valid_refresh",
      token_expires_at: PAST,
      token_scope: "calendar",
    };
    const result = await ensureValidAccessToken(integration);
    expect(mockRefresh).toHaveBeenCalledWith("valid_refresh");
    expect(result.accessToken).toBe("new_access");
  });

  it("refreshes token when access_token is null", async () => {
    mockRefresh.mockResolvedValueOnce({
      accessToken: "new_access",
      refreshToken: null,
      expiresIn: 3600,
      scope: "calendar",
      tokenType: "Bearer",
    });

    const integration = {
      access_token: null,
      refresh_token: "valid_refresh",
      token_expires_at: FUTURE,
      token_scope: "calendar",
    };
    const result = await ensureValidAccessToken(integration);
    expect(result.accessToken).toBe("new_access");
  });

  it("throws when token is expired and refresh_token is missing", async () => {
    const integration = {
      access_token: "old_token",
      refresh_token: null,
      token_expires_at: PAST,
      token_scope: "calendar",
    };
    await expect(ensureValidAccessToken(integration)).rejects.toThrow(
      /refresh token/i
    );
  });

  it("forces refresh when forceRefresh=true even if token not expired", async () => {
    mockRefresh.mockResolvedValueOnce({
      accessToken: "forced_new",
      refreshToken: null,
      expiresIn: 3600,
      scope: "calendar",
      tokenType: "Bearer",
    });

    const integration = {
      access_token: "still_valid",
      refresh_token: "refresh",
      token_expires_at: FUTURE,
      token_scope: "calendar",
    };
    const result = await ensureValidAccessToken(integration, true);
    expect(mockRefresh).toHaveBeenCalled();
    expect(result.accessToken).toBe("forced_new");
  });
});
