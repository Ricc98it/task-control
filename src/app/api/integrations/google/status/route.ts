import { NextRequest, NextResponse } from "next/server";
import {
  ServerAuthError,
  requireUserFromAuthorizationHeader,
} from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUserFromAuthorizationHeader(
      request.headers.get("authorization")
    );
    const supabaseAdmin = getSupabaseAdminClient();

    const { data, error } = await supabaseAdmin
      .from("calendar_integrations")
      .select(
        "provider,provider_account_email,calendar_id,connection_status,token_expires_at,last_sync_at,last_sync_error"
      )
      .eq("user_id", user.id)
      .eq("provider", "GOOGLE")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({
        connected: false,
        provider: "GOOGLE",
      });
    }

    return NextResponse.json({
      connected: data.connection_status === "ACTIVE",
      provider: data.provider,
      providerAccountEmail: data.provider_account_email,
      calendarId: data.calendar_id,
      connectionStatus: data.connection_status,
      tokenExpiresAt: data.token_expires_at,
      lastSyncAt: data.last_sync_at,
      lastSyncError: data.last_sync_error,
    });
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to read Google integration status." },
      { status: 500 }
    );
  }
}

