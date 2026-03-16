"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import Icon from "@/components/Icon";
import { supabase } from "@/lib/supabaseClient";

type Step = "email" | "code";

function normalizeCode(raw: string) {
  return raw.replace(/\s+/g, "").slice(0, 6);
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("email");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  async function requestCode() {
    if (!normalizedEmail || sending) return;

    setError(null);
    setInfo(null);
    setSending(true);

    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
      },
    });

    setSending(false);
    if (sendError) {
      setError(sendError.message);
      return false;
    }

    setCode("");
    setStep("code");
    setInfo(`Codice inviato a ${normalizedEmail}`);
    return true;
  }

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    await requestCode();
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    const token = normalizeCode(code);
    if (!normalizedEmail || token.length !== 6 || verifying) return;

    setError(null);
    setInfo(null);
    setVerifying(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token,
      type: "email",
    });

    setVerifying(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    router.replace("/auth/callback");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="app-shell auth-card-shell w-full p-6 sm:p-7">
        <div className="text-center">
          <h1 className="page-title">Accedi</h1>
          <p className="page-subtitle">
            {step === "email"
              ? "Ricevi un codice via email."
              : "Inserisci il codice ricevuto."}
          </p>
        </div>

        {step === "email" ? (
          <form onSubmit={sendCode} className="mt-6 space-y-3">
            <input
              className="glass-input px-4 py-2"
              type="email"
              placeholder="La tua email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <Button
              variant="primary"
              size="md"
              type="submit"
              icon={<Icon name="arrow-right" />}
              className="w-full"
              disabled={sending}
            >
              {sending ? "Invio..." : "Invia codice"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-6 space-y-3">
            <input
              className="glass-input px-4 py-2 text-center tracking-[0.35em]"
              type="text"
              inputMode="numeric"
              placeholder="Codice a 6 cifre"
              value={code}
              onChange={(event) => setCode(normalizeCode(event.target.value))}
              minLength={6}
              maxLength={6}
              required
            />

            <Button
              variant="primary"
              size="md"
              type="submit"
              icon={<Icon name="check" />}
              className="w-full"
              disabled={verifying || code.length !== 6}
            >
              {verifying ? "Verifica..." : "Verifica codice"}
            </Button>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="wizard-cancel-link"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                  setInfo(null);
                }}
                disabled={verifying}
              >
                Cambia email
              </button>
              <button
                type="button"
                className="wizard-cancel-link"
                onClick={(event) => {
                  event.preventDefault();
                  void requestCode();
                }}
                disabled={sending || verifying}
              >
                {sending ? "Invio..." : "Reinvia codice"}
              </button>
            </div>
          </form>
        )}

        {info ? (
          <p className="mt-3 text-sm text-emerald-200 border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 rounded-xl">
            {info}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
