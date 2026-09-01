"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import NuovoPreventivoModal from "@/components/NuovoPreventivoModal";
import { createSupabaseClient } from "@/lib/supabase";

const POSIZIONE_LIBERA_LABEL = "Posizione libera";

type RigaPreventivo = {
  prezzo_riga: number | null;
  prodotti: {
    categoria_id: number;
    categorie: { nome: string } | { nome: string }[];
  } | null;
};

type PreventivoConDettagli = {
  id: number;
  riferimento: string;
  created_at: string;
  righe: RigaPreventivo[];
};

function formatData(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function normalizzaRelazione<T>(val: T | T[]): T {
  return Array.isArray(val) ? val[0] : val;
}

function calcolaTotale(righe: RigaPreventivo[]) {
  return righe.reduce((sum, riga) => sum + (riga.prezzo_riga ?? 0), 0);
}

function calcolaCategorie(righe: RigaPreventivo[]) {
  const nomi = new Set<string>();

  for (const riga of righe) {
    if (!riga.prodotti) {
      nomi.add(POSIZIONE_LIBERA_LABEL);
      continue;
    }
    const prodotto = normalizzaRelazione(riga.prodotti);
    if (prodotto.categorie) {
      nomi.add(normalizzaRelazione(prodotto.categorie).nome);
    }
  }

  return Array.from(nomi)
    .sort((a, b) => a.localeCompare(b, "it"))
    .join(", ");
}

export default function Home() {
  const [preventivi, setPreventivi] = useState<PreventivoConDettagli[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);

  const loadPreventivi = useCallback(async () => {
    const supabase = createSupabaseClient();
    const { data, error: loadError } = await supabase
      .from("preventivi")
      .select(
        `id, riferimento, created_at, righe(prezzo_riga, prodotti(categoria_id, categorie(nome)))`,
      )
      .order("created_at", { ascending: false });

    if (loadError) throw new Error(loadError.message);

    const preventiviNormalizzati: PreventivoConDettagli[] = (data ?? []).map(
      (preventivo) => ({
        ...preventivo,
        righe: (preventivo.righe ?? []).map((riga) => ({
          prezzo_riga: riga.prezzo_riga,
          prodotti: riga.prodotti
            ? normalizzaRelazione(riga.prodotti)
            : null,
        })),
      }),
    );

    setPreventivi(preventiviNormalizzati);
  }, []);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        await loadPreventivi();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore sconosciuto");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [loadPreventivi]);

  async function handleElimina(
    e: React.MouseEvent,
    preventivo: PreventivoConDettagli,
  ) {
    e.preventDefault();
    e.stopPropagation();

    const confermato = window.confirm(
      `Eliminare il preventivo "${preventivo.riferimento}"? L'operazione è irreversibile.`,
    );
    if (!confermato) return;

    setDeletingId(preventivo.id);
    setError(null);

    const supabase = createSupabaseClient();
    const { error: deleteError } = await supabase
      .from("preventivi")
      .delete()
      .eq("id", preventivo.id);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingId(null);
      return;
    }

    await loadPreventivi();
    setDeletingId(null);
  }

  async function handleDuplica(
    e: React.MouseEvent,
    preventivo: PreventivoConDettagli,
  ) {
    e.preventDefault();
    e.stopPropagation();

    setDuplicatingId(preventivo.id);
    setError(null);

    const supabase = createSupabaseClient();

    const { data: nuovoPreventivo, error: createError } = await supabase
      .from("preventivi")
      .insert({ riferimento: `${preventivo.riferimento} (copia)` })
      .select("id")
      .single();

    if (createError || !nuovoPreventivo) {
      setError(createError?.message ?? "Errore nella duplicazione del preventivo");
      setDuplicatingId(null);
      return;
    }

    const { data: righeOriginali, error: righeError } = await supabase
      .from("righe")
      .select(
        `id, prodotto_id, larghezza_cm, altezza_cm, lunghezza_cm, quantita, posa, prezzo_riga,
        descrizione_libera, prezzo_libero, righe_flag(flag_id)`,
      )
      .eq("preventivo_id", preventivo.id);

    if (righeError) {
      setError(righeError.message);
      setDuplicatingId(null);
      return;
    }

    for (const riga of righeOriginali ?? []) {
      const { data: nuovaRiga, error: insertRigaError } = await supabase
        .from("righe")
        .insert({
          preventivo_id: nuovoPreventivo.id,
          prodotto_id: riga.prodotto_id,
          larghezza_cm: riga.larghezza_cm,
          altezza_cm: riga.altezza_cm,
          lunghezza_cm: riga.lunghezza_cm,
          quantita: riga.quantita,
          posa: riga.posa,
          prezzo_riga: riga.prezzo_riga,
          descrizione_libera: riga.descrizione_libera,
          prezzo_libero: riga.prezzo_libero,
        })
        .select("id")
        .single();

      if (insertRigaError || !nuovaRiga) {
        setError(insertRigaError?.message ?? "Errore nella copia delle righe");
        setDuplicatingId(null);
        return;
      }

      const flagIds = (riga.righe_flag ?? []).map(
        (rf: { flag_id: number }) => rf.flag_id,
      );

      if (flagIds.length > 0) {
        const { error: flagError } = await supabase.from("righe_flag").insert(
          flagIds.map((flag_id: number) => ({
            riga_id: nuovaRiga.id,
            flag_id,
          })),
        );

        if (flagError) {
          setError(flagError.message);
          setDuplicatingId(null);
          return;
        }
      }
    }

    await loadPreventivi();
    setDuplicatingId(null);
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <p className="text-zinc-600">Caricamento...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-8">
        <div className="mb-4">
          <NuovoPreventivoModal />
        </div>
        <h1 className="text-2xl font-semibold">Preventivatore</h1>
        <p className="mt-1 text-sm text-zinc-600">
          I tuoi preventivi salvati.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {preventivi.length > 0 ? (
        <ul className="space-y-2">
          {preventivi.map((preventivo) => {
            const totale = calcolaTotale(preventivo.righe ?? []);
            const categorie = calcolaCategorie(preventivo.righe ?? []);

            return (
              <li
                key={preventivo.id}
                className="flex items-stretch overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300"
              >
                <Link
                  href={`/preventivo/${preventivo.id}`}
                  className="flex flex-1 items-center justify-between gap-4 px-4 py-4 hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{preventivo.riferimento}</p>
                    {categorie && (
                      <p className="mt-0.5 truncate text-sm text-zinc-500">
                        {categorie}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium">{formatEuro(totale)}</p>
                    <p className="text-sm text-zinc-500">
                      {formatData(preventivo.created_at)}
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={(e) => handleDuplica(e, preventivo)}
                  disabled={duplicatingId === preventivo.id}
                  className="border-l border-zinc-200 px-4 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {duplicatingId === preventivo.id ? "..." : "Duplica"}
                </button>
                <button
                  type="button"
                  onClick={(e) => handleElimina(e, preventivo)}
                  disabled={deletingId === preventivo.id}
                  className="border-l border-zinc-200 px-4 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {deletingId === preventivo.id ? "..." : "Elimina"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-zinc-600">
          Nessun preventivo. Creane uno nuovo per iniziare.
        </p>
      )}
    </main>
  );
}
