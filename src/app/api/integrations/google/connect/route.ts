import { NextRequest, NextResponse } from "next/server";
import { buildGoogleAuthorizationUrl } from "@/lib/googleCalendar";
import { createGoogleOAuthState } from "@/lib/googleOAuthState";
import {
  ServerAuthError,
  requireUserFromAuthorizationHeader,
} from "@/lib/serverAuth";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserFromAuthorizationHeader(
      request.headers.get("authorization")
    );
    const state = createGoogleOAuthState(user.id);
    const authorizationUrl = buildGoogleAuthorizationUrl(state);

    return NextResponse.json({ authorizationUrl });
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to start Google OAuth flow." },
      { status: 500 }
    );
  }
}

