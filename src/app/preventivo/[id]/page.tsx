"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase";

const POSIZIONE_LIBERA_LABEL = "Posizione libera";

type TipoPrezzo = "mq" | "pezzo" | "ml";

type Categoria = {
  id: number;
  nome: string;
  ordine: number;
};

type RigaRiepilogo = {
  id: number;
  preventivo_id: number;
  prodotto_id: number | null;
  descrizione_libera: string | null;
  prezzo_libero: number | null;
  larghezza_cm: number | null;
  altezza_cm: number | null;
  lunghezza_cm: number | null;
  quantita: number;
  posa: boolean;
  prezzo_riga: number | null;
  prodotti: {
    id: number;
    nome: string;
    categoria_id: number;
    tipo_prezzo: TipoPrezzo;
    categorie: {
      id: number;
      nome: string;
    };
  } | null;
};

type GruppoRighe = {
  key: string;
  categoriaNome: string;
  categoriaId: number | null;
  righe: RigaRiepilogo[];
};

function formatEuro(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function normalizzaRelazione<T>(val: T | T[]): T {
  return Array.isArray(val) ? val[0] : val;
}

function nomeRiga(riga: RigaRiepilogo) {
  if (riga.prodotto_id === null) {
    return riga.descrizione_libera ?? "—";
  }
  return riga.prodotti?.nome ?? "—";
}

function formatMisure(riga: RigaRiepilogo) {
  if (riga.prodotto_id === null) {
    return "—";
  }
  if (riga.prodotti?.tipo_prezzo === "mq" && riga.larghezza_cm && riga.altezza_cm) {
    return `${riga.larghezza_cm} × ${riga.altezza_cm} cm`;
  }
  if (riga.prodotti?.tipo_prezzo === "ml" && riga.lunghezza_cm) {
    return `${riga.lunghezza_cm} cm`;
  }
  return "—";
}

function calcolaSubtotale(righeGruppo: RigaRiepilogo[]) {
  return righeGruppo.reduce((sum, riga) => sum + (riga.prezzo_riga ?? 0), 0);
}

export default function PreventivoPage() {
  const params = useParams<{ id: string }>();
  const preventivoId = params.id;

  const [riferimento, setRiferimento] = useState<string | null>(null);
  const [categorie, setCategorie] = useState<Categoria[]>([]);
  const [righe, setRighe] = useState<RigaRiepilogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadRighe = useCallback(async () => {
    const supabase = createSupabaseClient();
    const { data, error: righeError } = await supabase
      .from("righe")
      .select(
        `id, preventivo_id, prodotto_id, descrizione_libera, prezzo_libero, larghezza_cm, altezza_cm, lunghezza_cm, quantita, posa, prezzo_riga,
        prodotti(id, nome, categoria_id, tipo_prezzo, categorie(id, nome))`,
      )
      .eq("preventivo_id", preventivoId);

    if (righeError) throw new Error(righeError.message);

    const righeNormalizzate: RigaRiepilogo[] = (data ?? []).map((riga) => {
      const prodotto = riga.prodotti
        ? normalizzaRelazione(riga.prodotti)
        : null;

      return {
        ...riga,
        prodotti: prodotto
          ? {
              ...prodotto,
              categorie: normalizzaRelazione(prodotto.categorie),
            }
          : null,
      };
    });

    setRighe(righeNormalizzate);
  }, [preventivoId]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      const supabase = createSupabaseClient();

      try {
        const [preventivoResult, categorieResult] = await Promise.all([
          supabase
            .from("preventivi")
            .select("id, riferimento")
            .eq("id", preventivoId)
            .single(),
          supabase
            .from("categorie")
            .select("id, nome, ordine")
            .order("ordine"),
        ]);

        if (preventivoResult.error) throw new Error(preventivoResult.error.message);
        if (categorieResult.error) throw new Error(categorieResult.error.message);

        setRiferimento(preventivoResult.data.riferimento);
        setCategorie(categorieResult.data as Categoria[]);
        await loadRighe();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore sconosciuto");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [preventivoId, loadRighe]);

  const gruppiRighe = useMemo(() => {
    const gruppi = new Map<number, GruppoRighe>();
    const righeLibere: RigaRiepilogo[] = [];

    for (const riga of righe) {
      if (riga.prodotto_id === null) {
        righeLibere.push(riga);
        continue;
      }

      if (!riga.prodotti) continue;

      const catId = riga.prodotti.categoria_id;
      const catNome = riga.prodotti.categorie.nome;

      if (!gruppi.has(catId)) {
        gruppi.set(catId, {
          key: `cat-${catId}`,
          categoriaId: catId,
          categoriaNome: catNome,
          righe: [],
        });
      }
      gruppi.get(catId)!.righe.push(riga);
    }

    const ordineCategorie = new Map(
      categorie.map((c, index) => [c.id, index]),
    );

    const risultato = Array.from(gruppi.values()).sort((a, b) => {
      const ordA = ordineCategorie.get(a.categoriaId!) ?? 999;
      const ordB = ordineCategorie.get(b.categoriaId!) ?? 999;
      return ordA - ordB;
    });

    if (righeLibere.length > 0) {
      risultato.push({
        key: "libera",
        categoriaId: null,
        categoriaNome: POSIZIONE_LIBERA_LABEL,
        righe: righeLibere,
      });
    }

    return risultato;
  }, [righe, categorie]);

  const totaleGenerale = useMemo(
    () => righe.reduce((sum, riga) => sum + (riga.prezzo_riga ?? 0), 0),
    [righe],
  );

  async function handleEliminaRiga(rigaId: number) {
    setError(null);
    setDeletingId(rigaId);

    const supabase = createSupabaseClient();

    const { error: flagDeleteError } = await supabase
      .from("righe_flag")
      .delete()
      .eq("riga_id", rigaId);

    if (flagDeleteError) {
      setError(flagDeleteError.message);
      setDeletingId(null);
      return;
    }

    const { error: deleteError } = await supabase
      .from("righe")
      .delete()
      .eq("id", rigaId);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingId(null);
      return;
    }

    await loadRighe();
    setDeletingId(null);
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <p className="text-zinc-600">Caricamento...</p>
      </main>
    );
  }

  if (error && !riferimento) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          Errore: {error}
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          Torna alla home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          ← Torna alla home
        </Link>
      </div>

      <header className="mb-8">
        <p className="text-sm text-zinc-500">Preventivo #{preventivoId}</p>
        <h1 className="text-2xl font-semibold">{riferimento}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Seleziona una categoria per aggiungere prodotti.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <section className="mb-10">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categorie.map((categoria) => (
            <li key={categoria.id}>
              <Link
                href={`/preventivo/${preventivoId}/categoria/${categoria.id}`}
                className="block rounded-lg border border-zinc-200 bg-white px-4 py-5 text-center font-medium shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                {categoria.nome}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href={`/preventivo/${preventivoId}/libera`}
              className="block rounded-lg border border-dashed border-amber-400 bg-amber-50 px-4 py-5 text-center font-medium text-amber-900 shadow-sm transition hover:border-amber-500 hover:bg-amber-100"
            >
              Posizione libera
            </Link>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Riepilogo preventivo</h2>

        {righe.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
            Nessun prodotto aggiunto ancora.
          </p>
        ) : (
          <div className="space-y-6">
            {gruppiRighe.map((gruppo) => {
              const subtotale = calcolaSubtotale(gruppo.righe);

              return (
              <div
                key={gruppo.key}
                className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
              >
                <h3 className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-700">
                  {gruppo.categoriaNome}
                </h3>
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-100 text-zinc-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Prodotto</th>
                      <th className="px-4 py-2 font-medium">Misure</th>
                      <th className="px-4 py-2 font-medium">Qtà</th>
                      <th className="px-4 py-2 font-medium text-right">Prezzo</th>
                      <th className="px-4 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {gruppo.righe.map((riga) => (
                      <tr
                        key={riga.id}
                        className="border-b border-zinc-100"
                      >
                        <td className="px-4 py-3">{nomeRiga(riga)}</td>
                        <td className="px-4 py-3">{formatMisure(riga)}</td>
                        <td className="px-4 py-3">{riga.quantita}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          {riga.prezzo_riga != null
                            ? formatEuro(riga.prezzo_riga)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {riga.prodotto_id !== null && gruppo.categoriaId !== null && (
                            <Link
                              href={`/preventivo/${preventivoId}/categoria/${gruppo.categoriaId}?riga=${riga.id}`}
                              className="mr-3 text-sm text-zinc-600 underline hover:text-zinc-900"
                            >
                              Modifica
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEliminaRiga(riga.id)}
                            disabled={deletingId === riga.id}
                            className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            {deletingId === riga.id ? "Eliminazione..." : "Elimina"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-zinc-200 bg-zinc-50 font-semibold">
                      <td className="px-4 py-3" colSpan={3}>
                        Subtotale {gruppo.categoriaNome}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatEuro(subtotale)}
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              );
            })}

            <p className="text-right text-lg font-semibold">
              Totale generale: {formatEuro(totaleGenerale)}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
