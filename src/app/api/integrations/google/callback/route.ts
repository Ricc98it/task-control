import { NextRequest, NextResponse } from "next/server";
import {
  exchangeGoogleAuthorizationCode,
  fetchGooglePrimaryCalendar,
} from "@/lib/googleCalendar";
import { verifyGoogleOAuthState } from "@/lib/googleOAuthState";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function resolveAppBaseUrl(request: NextRequest): string {
  const configured =
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

function redirectWithStatus(
  request: NextRequest,
  status: "connected" | "error",
  reason?: string
) {
  const url = new URL("/all", resolveAppBaseUrl(request));
  url.searchParams.set("google", status);
  if (reason) {
    url.searchParams.set("reason", reason);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const googleError = request.nextUrl.searchParams.get("error");
  if (googleError) {
    return redirectWithStatus(request, "error", googleError);
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return redirectWithStatus(request, "error", "missing_code_or_state");
  }

  const statePayload = verifyGoogleOAuthState(state);
  if (!statePayload) {
    return redirectWithStatus(request, "error", "invalid_state");
  }

  try {
    const supabaseAdmin = getSupabaseAdminClient();
    const tokenResponse = await exchangeGoogleAuthorizationCode(code);
    const primaryCalendar = await fetchGooglePrimaryCalendar(tokenResponse.accessToken);

    const { data: existingConnection } = await supabaseAdmin
      .from("calendar_integrations")
      .select("refresh_token")
      .eq("user_id", statePayload.userId)
      .eq("provider", "GOOGLE")
      .maybeSingle();

    const existingRefreshToken = (
      existingConnection as { refresh_token: string | null } | null
    )?.refresh_token;
    const refreshToken = tokenResponse.refreshToken ?? existingRefreshToken ?? null;

    const expiresAt = new Date(Date.now() + tokenResponse.expiresIn * 1000).toISOString();

    const payload = {
      user_id: statePayload.userId,
      provider: "GOOGLE",
      provider_account_email: primaryCalendar.calendarId || primaryCalendar.summary,
      calendar_id: primaryCalendar.calendarId,
      access_token: tokenResponse.accessToken,
      refresh_token: refreshToken,
      token_scope: tokenResponse.scope,
      token_expires_at: expiresAt,
      connection_status: "ACTIVE",
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("calendar_integrations")
      .upsert(payload, { onConflict: "user_id,provider" });

    if (error) {
      console.error(error);
      return redirectWithStatus(request, "error", "save_failed");
    }

    return redirectWithStatus(request, "connected");
  } catch (error) {
    console.error(error);
    return redirectWithStatus(request, "error", "oauth_exchange_failed");
  }
}
