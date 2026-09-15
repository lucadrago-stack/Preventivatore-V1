"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseClient } from "@/lib/supabase";

type Props = {
  displayName: string;
  isAdmin?: boolean;
};

export default function AppTopbar({ displayName, isAdmin = false }: Props) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const supabase = createSupabaseClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="border-b border-brand-border bg-brand-navy text-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/"
            className="shrink-0 text-sm font-semibold tracking-wide text-white hover:text-white/90"
          >
            Preventivatore
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="inline-flex items-center rounded-md bg-brand-accent px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-accent-hover"
            >
              Amministrazione
            </Link>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <span
            className="truncate text-sm text-white/90"
            title={displayName}
          >
            {displayName}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="inline-flex min-h-[36px] items-center justify-center rounded-md border border-white/40 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loggingOut ? "Uscita..." : "Esci"}
          </button>
        </div>
      </div>
    </header>
  );
}
