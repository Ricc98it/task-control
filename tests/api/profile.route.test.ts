import { beforeEach, describe, expect, it, vi } from "vitest";

describe("API /api/profile", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("PATCH validates timezone and returns 400 for invalid IANA timezone", async () => {
    vi.doMock("@/lib/serverAuth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/serverAuth")>();
      return {
        ...actual,
        requireUserFromAuthorizationHeader: vi.fn(async () => ({ id: "user-1" })),
      };
    });

    const { PATCH } = await import("@/app/api/profile/route");
    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone: "Mars/Olympus_Mons" }),
      }) as never
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain("timezone IANA");
  });
});
