"use client";

import { useState } from "react";
import Button from "@/components/Button";
import Icon from "@/components/Icon";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="app-shell w-full max-w-sm p-6 sm:p-7">
        <div className="text-center">
          <h1 className="page-title">Accedi</h1>
          <p className="page-subtitle">Ricevi un magic link via email.</p>
        </div>

        <form onSubmit={signIn} className="mt-6 space-y-3">
          <input
            className="glass-input px-4 py-2"
            type="email"
            placeholder="La tua email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Button
            variant="primary"
            size="md"
            type="submit"
            icon={<Icon name="arrow-right" />}
            className="w-full"
          >
            Invia magic link
          </Button>

          {sent && (
            <p className="text-sm text-emerald-200 border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 rounded-xl">
              Link inviato. Controlla la mail.
            </p>
          )}
          {error && (
            <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
              {error}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
