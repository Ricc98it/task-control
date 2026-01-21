import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

let sessionPromise: Promise<Session | null> | null = null;

export async function ensureSession(): Promise<Session | null> {
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session ?? null;
  })();

  try {
    return await sessionPromise;
  } finally {
    sessionPromise = null;
  }
}
