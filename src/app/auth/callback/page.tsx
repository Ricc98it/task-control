"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ensureSession } from "@/lib/autoSession";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    ensureSession()
      .then(() => router.replace("/"))
      .catch(() => router.replace("/"));
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="app-shell px-6 py-4">
        <p className="text-slate-200">Accesso in corso...</p>
      </div>
    </main>
  );
}
