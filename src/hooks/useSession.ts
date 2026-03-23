"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { ensureSession } from "@/lib/autoSession";

export type SessionState = "loading" | "authed" | "anon";

function formatNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim();
  if (!local) return email;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return local;
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveUserName(user: User | null): string | null {
  if (!user) return null;
  const metadata = user.user_metadata ?? {};
  const metaName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
      ? metadata.name
      : null;
  if (metaName && metaName.trim()) return metaName.trim();
  if (user.email) return formatNameFromEmail(user.email);
  return null;
}

export function useSession() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const session = await ensureSession();
        if (!active) return;
        if (!session) {
          setSessionState("anon");
          setSessionUser(null);
          setUserName(null);
          router.replace("/login");
          return;
        }
        setSessionState("authed");
        setSessionUser(session.user ?? null);
        setUserName(resolveUserName(session.user ?? null));
      } catch {
        if (!active) return;
        setSessionState("anon");
        setSessionUser(null);
        setUserName(null);
        router.replace("/login");
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  return { sessionState, sessionUser, userName };
}
