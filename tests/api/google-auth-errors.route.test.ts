import { beforeEach, describe, expect, it, vi } from "vitest";

async function mockAuthAsUnauthorized() {
  vi.doMock("@/lib/serverAuth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/serverAuth")>();
    return {
      ...actual,
      requireUserFromAuthorizationHeader: vi.fn(async () => {
        throw new actual.ServerAuthError("Missing bearer token.", 401);
      }),
    };
  });
}

describe("Google route auth guards", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("maps auth errors on POST /api/integrations/google/events", async () => {
    await mockAuthAsUnauthorized();
    const { POST } = await import("@/app/api/integrations/google/events/route");
    const response = await POST(
      new Request("http://localhost/api/integrations/google/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }) as never
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Missing bearer token." });
  });

  it("maps auth errors on POST /api/integrations/google/sync", async () => {
    await mockAuthAsUnauthorized();
    const { POST } = await import("@/app/api/integrations/google/sync/route");
    const response = await POST(
      new Request("http://localhost/api/integrations/google/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }) as never
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Missing bearer token." });
  });

  it("maps auth errors on POST /api/integrations/google/rsvp", async () => {
    await mockAuthAsUnauthorized();
    const { POST } = await import("@/app/api/integrations/google/rsvp/route");
    const response = await POST(
      new Request("http://localhost/api/integrations/google/rsvp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }) as never
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Missing bearer token." });
  });
});
