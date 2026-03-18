import { NextRequest, NextResponse } from "next/server";
import {
  ServerAuthError,
  requireUserFromAuthorizationHeader,
} from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserFromAuthorizationHeader(
      request.headers.get("authorization")
    );
    const supabaseAdmin = getSupabaseAdminClient();

    const { error } = await supabaseAdmin
      .from("calendar_integrations")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", "GOOGLE");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Unable to disconnect Google integration." },
      { status: 500 }
    );
  }
}

