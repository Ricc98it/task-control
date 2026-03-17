import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export class ServerAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function parseBearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match?.[1] ?? null;
}

export async function requireUserFromAuthorizationHeader(
  headerValue: string | null
): Promise<User> {
  const token = parseBearerToken(headerValue);
  if (!token) {
    throw new ServerAuthError("Missing bearer token.", 401);
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    throw new ServerAuthError("Invalid session token.", 401);
  }

  return data.user;
}

