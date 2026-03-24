import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/integrations/google/status", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns connected=false when integration is missing", async () => {
    vi.doMock("@/lib/serverAuth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/serverAuth")>();
      return {
        ...actual,
        requireUserFromAuthorizationHeader: vi.fn(async () => ({ id: "user-1" })),
      };
    });

    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const eqProvider = vi.fn(() => ({ maybeSingle }));
    const eqUser = vi.fn(() => ({ eq: eqProvider }));
    const select = vi.fn(() => ({ eq: eqUser }));
    const from = vi.fn(() => ({ select }));

    vi.doMock("@/lib/supabaseAdmin", () => ({
      getSupabaseAdminClient: () => ({ from }),
    }));

    const { GET } = await import("@/app/api/integrations/google/status/route");
    const response = await GET(
      new Request("http://localhost/api/integrations/google/status") as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      connected: false,
      provider: "GOOGLE",
    });
    expect(from).toHaveBeenCalledWith("calendar_integrations");
  });
});
