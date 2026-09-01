"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseClient } from "@/lib/supabase";

export default function NuovoPreventivoModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [riferimento, setRiferimento] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setOpen(false);
    setRiferimento("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = riferimento.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    const supabase = createSupabaseClient();
    const { data, error: insertError } = await supabase
      .from("preventivi")
      .insert({ riferimento: trimmed })
      .select("id")
      .single();

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push(`/preventivo/${data.id}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Nuovo preventivo
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Nuovo preventivo</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Inserisci un riferimento (es. nome cliente o commessa).
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-zinc-600">Riferimento</span>
                <input
                  type="text"
                  value={riferimento}
                  onChange={(e) => setRiferimento(e.target.value)}
                  placeholder="Es. Rossi - Via Roma 12"
                  autoFocus
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>

              {error && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={loading || !riferimento.trim()}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Creazione..." : "Crea preventivo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
