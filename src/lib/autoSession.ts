import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

let sessionPromise: Promise<Session | null> | null = null;

export async function ensureSession(): Promise<Session | null> {
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) return data.session;

    const { data: anonData, error: anonError } =
      await supabase.auth.signInAnonymously();
    if (anonError) throw anonError;
    return anonData.session ?? null;
  })();

  try {
    return await sessionPromise;
  } finally {
    sessionPromise = null;
  }
}
