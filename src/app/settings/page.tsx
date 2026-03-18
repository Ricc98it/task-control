"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import Nav from "@/components/Nav";
import PageHeader from "@/components/PageHeader";
import SectionHeader from "@/components/SectionHeader";
import { ensureSession } from "@/lib/autoSession";

type GoogleStatus = {
  connected: boolean;
  provider: "GOOGLE";
  providerAccountEmail?: string | null;
  calendarId?: string | null;
  connectionStatus?: string | null;
  tokenExpiresAt?: string | null;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
};

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

async function getAccessTokenOrRedirect(router: ReturnType<typeof useRouter>) {
  const session = await ensureSession();
  if (!session?.access_token) {
    router.replace("/login");
    return null;
  }
  return session.access_token;
}

export default function SettingsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<
    null | "connect" | "sync" | "disconnect"
  >(null);
  const [err, setErr] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);

  const isConnected = useMemo(() => status?.connected === true, [status]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const accessToken = await getAccessTokenOrRedirect(router);
      if (!accessToken) return;

      const response = await fetch("/api/integrations/google/status", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = (await response.json()) as GoogleStatus & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Errore stato integrazione.");
      }
      setStatus(payload);
    } catch (error) {
      setStatus(null);
      setErr(error instanceof Error ? error.message : "Errore imprevisto.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleConnect() {
    setBusyAction("connect");
    setErr(null);
    try {
      const accessToken = await getAccessTokenOrRedirect(router);
      if (!accessToken) return;

      const response = await fetch("/api/integrations/google/connect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = (await response.json()) as {
        authorizationUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.authorizationUrl) {
        throw new Error(payload.error ?? "Impossibile avviare il collegamento.");
      }
      window.location.href = payload.authorizationUrl;
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Errore collegamento.");
      setBusyAction(null);
    }
  }

  async function handleSync(forceFullSync = false) {
    setBusyAction("sync");
    setErr(null);
    setSyncInfo(null);
    try {
      const accessToken = await getAccessTokenOrRedirect(router);
      if (!accessToken) return;

      const response = await fetch("/api/integrations/google/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ forceFullSync }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        upsertedCount?: number;
        cancelledCount?: number;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Sync non riuscita.");
      }
      setSyncInfo(
        `Sync completata: ${payload.upsertedCount ?? 0} eventi aggiornati, ${payload.cancelledCount ?? 0} cancellati.`
      );
      await loadStatus();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Errore durante la sync.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnettere Google Calendar da questo account?")) return;
    setBusyAction("disconnect");
    setErr(null);
    setSyncInfo(null);
    try {
      const accessToken = await getAccessTokenOrRedirect(router);
      if (!accessToken) return;

      const response = await fetch("/api/integrations/google/disconnect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Disconnessione non riuscita.");
      }
      setStatus({
        connected: false,
        provider: "GOOGLE",
      });
      setSyncInfo("Integrazione Google disconnessa.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Errore disconnessione.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <Nav />
      <main className="min-h-screen px-6 py-10 app-page">
        <div className="app-shell max-w-5xl mx-auto p-6 sm:p-8">
          <PageHeader
            title="Impostazioni"
            subtitle="Collega Google Calendar e gestisci la sincronizzazione."
          />

          <section className="mt-6 glass-panel p-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">
                ⚙️
              </span>
              <div>
                <p className="text-slate-100 font-semibold">Integrazioni</p>
                <p className="meta-line">Configura connessioni esterne e sync automatica.</p>
              </div>
            </div>
          </section>

          <section className="mt-6">
            <SectionHeader
              title="Google Calendar"
              subtitle={loading ? "Caricamento stato..." : "Stato connessione"}
            />
            <div className="mt-4 glass-panel p-5 space-y-3">
              <p className="meta-line">
                Stato:{" "}
                <span className="text-slate-100 font-medium">
                  {loading
                    ? "Caricamento..."
                    : isConnected
                    ? status?.connectionStatus ?? "ACTIVE"
                    : "Non collegato"}
                </span>
              </p>
              <p className="meta-line">
                Account: <span className="text-slate-100">{status?.providerAccountEmail ?? "-"}</span>
              </p>
              <p className="meta-line">
                Calendario: <span className="text-slate-100">{status?.calendarId ?? "-"}</span>
              </p>
              <p className="meta-line">
                Ultima sync: <span className="text-slate-100">{formatDateTime(status?.lastSyncAt)}</span>
              </p>
              <p className="meta-line">
                Token scade:{" "}
                <span className="text-slate-100">{formatDateTime(status?.tokenExpiresAt)}</span>
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                {!isConnected ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleConnect}
                    disabled={busyAction !== null}
                  >
                    {busyAction === "connect" ? "Apro..." : "Collega Google"}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleSync(false)}
                      disabled={busyAction !== null}
                    >
                      {busyAction === "sync" ? "Sincronizzo..." : "Sincronizza ora"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleSync(true)}
                      disabled={busyAction !== null}
                    >
                      Sync completa
                    </Button>
                    <Button
                      variant="tertiary"
                      size="sm"
                      onClick={() => void handleDisconnect()}
                      disabled={busyAction !== null}
                    >
                      {busyAction === "disconnect" ? "Disconnetto..." : "Disconnetti"}
                    </Button>
                  </>
                )}
              </div>

              {syncInfo ? (
                <p className="text-sm text-emerald-200 border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 rounded-xl">
                  {syncInfo}
                </p>
              ) : null}
              {status?.lastSyncError ? (
                <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
                  Errore sync: {status.lastSyncError}
                </p>
              ) : null}
              {err ? (
                <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
                  {err}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

