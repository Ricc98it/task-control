"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ensureSession } from "@/lib/autoSession";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    ensureSession()
      .then(async (session) => {
        if (!session) {
          router.replace("/login");
          return;
        }
        const { data } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        router.replace(data ? "/" : "/welcome");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="app-shell px-6 py-4">
        <p className="text-slate-200">Accesso in corso...</p>
      </div>
    </main>
  );
}
