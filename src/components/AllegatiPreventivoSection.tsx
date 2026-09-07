"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import {
  caricaAllegatiPreventivo,
  eliminaAllegatoPreventivo,
  isTipoAllegatoAccettato,
  salvaAllegatoPreventivo,
  type AllegatoPreventivo,
} from "@/lib/allegati-preventivo";
import { formatDataOra } from "@/lib/format";

type AllegatiPreventivoSectionProps = {
  preventivoId: string;
  /** Se passato, evita il fetch iniziale (già caricato in parallelo dalla pagina). */
  initialAllegati?: AllegatoPreventivo[];
};

export default function AllegatiPreventivoSection({
  preventivoId,
  initialAllegati,
}: AllegatiPreventivoSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [allegati, setAllegati] = useState<AllegatoPreventivo[]>(
    initialAllegati ?? [],
  );
  const [loading, setLoading] = useState(initialAllegati == null);
  const [uploading, setUploading] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const skipInitialFetch = useRef(initialAllegati != null);

  const loadAllegati = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseClient();
      const data = await caricaAllegatiPreventivo(supabase, preventivoId);
      setAllegati(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore nel caricamento allegati",
      );
    } finally {
      setLoading(false);
    }
  }, [preventivoId]);

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    loadAllegati();
  }, [loadAllegati]);

  function mostraFeedback(messaggio: string) {
    setFeedback(messaggio);
    window.setTimeout(() => setFeedback(null), 2500);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    const supabase = createSupabaseClient();
    let caricati = 0;

    try {
      for (const file of Array.from(files)) {
        if (!isTipoAllegatoAccettato(file)) {
          throw new Error(
            `"${file.name}" non supportato. Usa PDF, JPG o PNG.`,
          );
        }

        const nuovo = await salvaAllegatoPreventivo(supabase, {
          preventivoId,
          file,
        });
        setAllegati((prev) => [...prev, nuovo]);
        caricati += 1;
      }

      if (caricati > 0) {
        mostraFeedback(
          caricati === 1 ? "Allegato caricato" : `${caricati} allegati caricati`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento");
      await loadAllegati();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleElimina(allegato: AllegatoPreventivo) {
    const confermato = window.confirm(
      `Eliminare l'allegato "${allegato.nome}"?`,
    );
    if (!confermato) return;

    setEliminandoId(allegato.id);
    setError(null);

    try {
      const supabase = createSupabaseClient();
      await eliminaAllegatoPreventivo(supabase, allegato);
      setAllegati((prev) => prev.filter((a) => a.id !== allegato.id));
      mostraFeedback("Allegato eliminato");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'eliminazione");
    } finally {
      setEliminandoId(null);
    }
  }

  return (
    <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-zinc-900">Allegati</h2>
      <p className="mt-1 text-sm text-zinc-500">
        PDF e immagini (JPG, PNG) inclusi nel preventivo finale, prima delle
        condizioni.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          multiple
          onChange={handleFileChange}
          disabled={uploading}
          className="block max-w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800 disabled:opacity-50"
        />
        {uploading && (
          <span className="text-sm text-zinc-600">Caricamento...</span>
        )}
        {feedback && (
          <span className="text-sm font-medium text-green-700">{feedback}</span>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-zinc-600">Caricamento allegati...</p>
      ) : allegati.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">Nessun allegato caricato.</p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-200">
          {allegati.map((allegato) => (
            <li
              key={allegato.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
            >
              <div>
                <p className="font-medium text-zinc-900">{allegato.nome}</p>
                <p className="text-sm text-zinc-500">
                  {formatDataOra(allegato.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleElimina(allegato)}
                disabled={eliminandoId === allegato.id || uploading}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
              >
                {eliminandoId === allegato.id ? "Eliminazione..." : "Elimina"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
