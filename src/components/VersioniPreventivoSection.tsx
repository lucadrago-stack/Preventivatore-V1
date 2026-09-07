"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import {
  caricaVersioniPreventivo,
  creaSignedUrlVersione,
  eliminaVersionePreventivo,
  type VersionePreventivo,
} from "@/lib/versioni-preventivo";
import { formatEuro, formatDataOra } from "@/lib/format";

type VersioniPreventivoSectionProps = {
  preventivoId: string;
  refreshKey?: number;
  /** Se passato, evita il fetch iniziale (già caricato in parallelo dalla pagina). */
  initialVersioni?: VersionePreventivo[];
};

export default function VersioniPreventivoSection({
  preventivoId,
  refreshKey = 0,
  initialVersioni,
}: VersioniPreventivoSectionProps) {
  const [versioni, setVersioni] = useState<VersionePreventivo[]>(
    initialVersioni ?? [],
  );
  const [loading, setLoading] = useState(initialVersioni == null);
  const [error, setError] = useState<string | null>(null);
  const [aprendoId, setAprendoId] = useState<number | null>(null);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const lastRefreshKey = useRef(refreshKey);
  const skipInitialFetch = useRef(initialVersioni != null);

  const loadVersioni = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseClient();
      const data = await caricaVersioniPreventivo(supabase, preventivoId);
      setVersioni(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore nel caricamento versioni",
      );
    } finally {
      setLoading(false);
    }
  }, [preventivoId]);

  useEffect(() => {
    const refreshChanged = lastRefreshKey.current !== refreshKey;
    lastRefreshKey.current = refreshKey;

    if (skipInitialFetch.current && !refreshChanged) {
      skipInitialFetch.current = false;
      return;
    }
    skipInitialFetch.current = false;
    loadVersioni();
  }, [loadVersioni, refreshKey]);

  async function handleApri(versione: VersionePreventivo) {
    setAprendoId(versione.id);
    setError(null);

    try {
      const supabase = createSupabaseClient();
      const signedUrl = await creaSignedUrlVersione(supabase, versione.file_path);
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore nell'apertura del PDF",
      );
    } finally {
      setAprendoId(null);
    }
  }

  async function handleElimina(versione: VersionePreventivo) {
    const confermato = window.confirm(
      `Eliminare la versione ${versione.numero_versione}? Il file PDF verrà rimosso definitivamente.`,
    );
    if (!confermato) return;

    setEliminandoId(versione.id);
    setError(null);

    try {
      const supabase = createSupabaseClient();
      await eliminaVersionePreventivo(supabase, versione);
      setVersioni((prev) => prev.filter((v) => v.id !== versione.id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore nell'eliminazione",
      );
    } finally {
      setEliminandoId(null);
    }
  }

  return (
    <section className="mt-10 rounded-lg border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-zinc-900">Versioni salvate</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Snapshot PDF del preventivo, salvati manualmente da questa pagina.
      </p>

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-zinc-600">Caricamento versioni...</p>
      ) : versioni.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">
          Nessuna versione salvata. Usa &quot;Salva versione&quot; per creare la
          prima.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-200">
          {versioni.map((versione) => (
            <li
              key={versione.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
            >
              <div>
                <p className="font-medium text-zinc-900">
                  Rev. {versione.numero_versione}
                </p>
                <p className="text-sm text-zinc-500">
                  {formatDataOra(versione.created_at)} ·{" "}
                  {formatEuro(versione.totale)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleApri(versione)}
                  disabled={aprendoId === versione.id || eliminandoId !== null}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {aprendoId === versione.id ? "Apertura..." : "Scarica/Visualizza"}
                </button>
                <button
                  type="button"
                  onClick={() => handleElimina(versione)}
                  disabled={eliminandoId === versione.id || aprendoId !== null}
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                >
                  {eliminandoId === versione.id ? "Eliminazione..." : "Elimina"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
