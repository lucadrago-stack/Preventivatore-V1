"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { createSupabaseClient } from "@/lib/supabase";

const MSG_DISATTIVATO =
  "Account disattivato, contatta l'amministratore";

/** Dimensioni native di public/logo.png (1271×607). */
const LOGO_NATIVE_W = 1271;
const LOGO_NATIVE_H = 607;
const LOGO_HEIGHT = 56;
const LOGO_WIDTH = Math.round((LOGO_HEIGHT * LOGO_NATIVE_W) / LOGO_NATIVE_H);

export default function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("error") === "disattivato") {
      setError(MSG_DISATTIVATO);
    }
  }, [searchParams]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createSupabaseClient();
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (signInError || !data.user) {
        setError("Email o password non corretti");
        setLoading(false);
        return;
      }

      const { data: profilo } = await supabase
        .from("commerciali")
        .select("attivo")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profilo && profilo.attivo === false) {
        await supabase.auth.signOut();
        setError(MSG_DISATTIVATO);
        setLoading(false);
        return;
      }

      // Navigazione full-page: i password manager (Chrome/Edge) possono
      // proporre "Salva password" anche su localhost; router.replace SPA no.
      const next = searchParams.get("next");
      const destinazione =
        next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      window.location.assign(destinazione);
    } catch {
      setError("Email o password non corretti");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-6 flex justify-center">
          <Image
            src="/logo.png"
            alt="Bruno Drago"
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            className="h-14 w-auto"
            priority
          />
        </div>
        <h1 className="text-2xl font-semibold text-brand-navy">Accedi</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Preventivatore — accesso riservato
        </p>
      </div>

      <form
        method="post"
        action="/login"
        onSubmit={handleSubmit}
        className="rounded-lg border border-brand-border bg-white p-5 shadow-sm sm:p-6"
        autoComplete="on"
      >
        <div className="space-y-4">
          <Input
            label="Email"
            type="email"
            name="username"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@azienda.it"
          />
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-brand-danger"
            role="alert"
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={loading}
          className="mt-6"
        >
          {loading ? "Accesso..." : "Accedi"}
        </Button>
      </form>
    </main>
  );
}
