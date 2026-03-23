"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import type { SessionState } from "@/hooks/useSession";

export type Profile = {
  user_id: string;
  email: string;
  full_name: string;
};

export function useProfile(sessionState: SessionState, sessionUser: User | null) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);

  useEffect(() => {
    if (sessionState !== "authed" || !sessionUser) return;
    let active = true;
    setProfileLoading(true);
    setProfileChecked(false);

    const loadProfile = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id,full_name,email")
          .eq("user_id", sessionUser.id)
          .maybeSingle();

        if (!active) return;
        if (error) console.error(error);

        setProfile(
          data
            ? {
                user_id: data.user_id,
                email: data.email,
                full_name: data.full_name,
              }
            : null
        );
      } catch {
        if (!active) return;
        setProfile(null);
      } finally {
        if (!active) return;
        setProfileLoading(false);
        setProfileChecked(true);
      }
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, [sessionState, sessionUser]);

  return { profile, profileLoading, profileChecked };
}
