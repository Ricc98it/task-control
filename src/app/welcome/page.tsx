"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";

type ProfileRow = {
  user_id: string;
  email: string;
  full_name: string;
};

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

export default function WelcomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function run() {
      setLoading(true);
      let session = null;
      try {
        session = await ensureSession();
      } catch (error) {
        console.error(error);
      }
      if (!active) return;
      if (!session) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("user_id,full_name,email")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!active) return;

      if (error) {
        console.error(error);
      }

      if (data?.full_name) {
        router.replace("/");
        return;
      }

      setLoading(false);
    }

    run();

    return () => {
      active = false;
    };
  }, [router]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Inserisci il tuo nome.");
      return;
    }

    let session = null;
    try {
      session = await ensureSession();
    } catch (error) {
      console.error(error);
    }
    if (!session) {
      router.replace("/login");
      return;
    }

    if (!session.user.email) {
      setErr("Email non disponibile.");
      return;
    }

    setSaving(true);
    const payload = {
      user_id: session.user.id,
      email: session.user.email,
      full_name: trimmed,
    };
    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload)
      .select("user_id,full_name,email")
      .single();
    setSaving(false);

    if (error || !data) {
      setErr(error?.message ?? "Errore nel salvataggio.");
      return;
    }

    router.replace("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="app-shell w-full max-w-xl p-6 sm:p-8 text-center">
        <h1 className="page-title">Come ti chiami?</h1>
        {loading ? (
          <p className="page-subtitle mt-4">Caricamento...</p>
        ) : (
          <form onSubmit={saveName} className="mt-6 space-y-4">
            <input
              className="name-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome"
              required
              aria-label="Nome"
              autoFocus
            />
            <div>
              <Button variant="primary" size="md" type="submit" disabled={saving}>
                {saving ? "Salvo..." : "Continua"}
              </Button>
            </div>
            {err && (
              <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
                {err}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
