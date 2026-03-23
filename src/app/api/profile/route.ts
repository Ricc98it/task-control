import { NextRequest, NextResponse } from "next/server";
import {
  ServerAuthError,
  requireUserFromAuthorizationHeader,
} from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

function isValidIANATimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUserFromAuthorizationHeader(
      request.headers.get("authorization")
    );
    const supabaseAdmin = getSupabaseAdminClient();

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("user_id,email,full_name,timezone")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }

    return NextResponse.json({
      userId: data.user_id,
      email: data.email,
      fullName: data.full_name,
      timezone: data.timezone ?? "Europe/Rome",
    });
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to load profile." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUserFromAuthorizationHeader(
      request.headers.get("authorization")
    );
    const body = (await request.json()) as { timezone?: string };
    const timezone = body.timezone?.trim();

    if (!timezone) {
      return NextResponse.json({ error: "timezone is required." }, { status: 400 });
    }
    if (!isValidIANATimezone(timezone)) {
      return NextResponse.json(
        { error: `"${timezone}" non è un timezone IANA valido.` },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ timezone, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, timezone });
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to update profile." }, { status: 500 });
  }
}
