"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase";

type TipoPrezzo = "mq" | "pezzo" | "ml";

type Prodotto = {
  id: number;
  categoria_id: number;
  nome: string;
  tipo_prezzo: TipoPrezzo;
  prezzo_unitario: number;
  minimo: number | null;
  posa_prezzo: number | null;
};

type RigaPreventivo = {
  id: string;
  prodotto: Prodotto;
  larghezza?: number;
  altezza?: number;
  lunghezza?: number;
  quantita: number;
  posa: boolean;
};

export default function CategoriaPage() {
  const params = useParams<{ id: string }>();
  const categoriaId = params.id;

  const [nomeCategoria, setNomeCategoria] = useState<string | null>(null);
  const [prodotti, setProdotti] = useState<Prodotto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [prodottoId, setProdottoId] = useState("");
  const [larghezza, setLarghezza] = useState("");
  const [altezza, setAltezza] = useState("");
  const [lunghezza, setLunghezza] = useState("");
  const [quantita, setQuantita] = useState("1");
  const [posa, setPosa] = useState(false);

  const [righe, setRighe] = useState<RigaPreventivo[]>([]);

  const prodottoSelezionato = useMemo(
    () => prodotti.find((p) => String(p.id) === prodottoId),
    [prodotti, prodottoId],
  );

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      const supabase = createSupabaseClient();

      const [categoriaResult, prodottiResult] = await Promise.all([
        supabase.from("categorie").select("nome").eq("id", categoriaId).single(),
        supabase
          .from("prodotti")
          .select(
            "id, categoria_id, nome, tipo_prezzo, prezzo_unitario, minimo, posa_prezzo",
          )
          .eq("categoria_id", categoriaId)
          .order("nome"),
      ]);

      if (categoriaResult.error) {
        setError(categoriaResult.error.message);
        setLoading(false);
        return;
      }

      if (prodottiResult.error) {
        setError(prodottiResult.error.message);
        setLoading(false);
        return;
      }

      setNomeCategoria(categoriaResult.data.nome);
      setProdotti(prodottiResult.data as Prodotto[]);
      setLoading(false);
    }

    loadData();
  }, [categoriaId]);

  useEffect(() => {
    setLarghezza("");
    setAltezza("");
    setLunghezza("");
    setPosa(false);
  }, [prodottoId]);

  function resetForm() {
    setProdottoId("");
    setLarghezza("");
    setAltezza("");
    setLunghezza("");
    setQuantita("1");
    setPosa(false);
  }

  function handleAggiungiRiga() {
    if (!prodottoSelezionato) return;

    const quantitaNum = Number(quantita);
    if (!Number.isFinite(quantitaNum) || quantitaNum <= 0) return;

    const nuovaRiga: RigaPreventivo = {
      id: crypto.randomUUID(),
      prodotto: prodottoSelezionato,
      quantita: quantitaNum,
      posa,
    };

    if (prodottoSelezionato.tipo_prezzo === "mq") {
      const larghezzaNum = Number(larghezza);
      const altezzaNum = Number(altezza);
      if (
        !Number.isFinite(larghezzaNum) ||
        !Number.isFinite(altezzaNum) ||
        larghezzaNum <= 0 ||
        altezzaNum <= 0
      ) {
        return;
      }
      nuovaRiga.larghezza = larghezzaNum;
      nuovaRiga.altezza = altezzaNum;
    }

    if (prodottoSelezionato.tipo_prezzo === "ml") {
      const lunghezzaNum = Number(lunghezza);
      if (!Number.isFinite(lunghezzaNum) || lunghezzaNum <= 0) return;
      nuovaRiga.lunghezza = lunghezzaNum;
    }

    setRighe((prev) => [...prev, nuovaRiga]);
    resetForm();
  }

  function handleRimuoviRiga(id: string) {
    setRighe((prev) => prev.filter((riga) => riga.id !== id));
  }

  function formatMisure(riga: RigaPreventivo) {
    if (riga.prodotto.tipo_prezzo === "mq") {
      return `${riga.larghezza} × ${riga.altezza} cm`;
    }
    if (riga.prodotto.tipo_prezzo === "ml") {
      return `${riga.lunghezza} cm`;
    }
    return "—";
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <p className="text-zinc-600">Caricamento...</p>
      </main>
    );
  }

  if (error) {
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
        <h1 className="text-2xl font-semibold">{nomeCategoria}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Aggiungi prodotti al preventivo.
        </p>
      </header>

      <section className="mb-8 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-medium text-zinc-700">Nuova riga</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm text-zinc-600">Prodotto</span>
            <select
              value={prodottoId}
              onChange={(e) => setProdottoId(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">Seleziona un prodotto</option>
              {prodotti.map((prodotto) => (
                <option key={prodotto.id} value={prodotto.id}>
                  {prodotto.nome}
                </option>
              ))}
            </select>
          </label>

          {prodottoSelezionato?.tipo_prezzo === "mq" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-zinc-600">Larghezza (cm)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={larghezza}
                  onChange={(e) => setLarghezza(e.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-zinc-600">Altezza (cm)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={altezza}
                  onChange={(e) => setAltezza(e.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
            </>
          )}

          {prodottoSelezionato?.tipo_prezzo === "ml" && (
            <label className="flex flex-col gap-1">
              <span className="text-sm text-zinc-600">Lunghezza (cm)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={lunghezza}
                onChange={(e) => setLunghezza(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600">Quantità</span>
            <input
              type="number"
              min="1"
              step="1"
              value={quantita}
              onChange={(e) => setQuantita(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>

          {prodottoSelezionato?.posa_prezzo != null && (
            <label className="flex items-center gap-2 self-end pb-2">
              <input
                type="checkbox"
                checked={posa}
                onChange={(e) => setPosa(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <span className="text-sm text-zinc-700">Posa</span>
            </label>
          )}
        </div>

        <button
          type="button"
          onClick={handleAggiungiRiga}
          disabled={!prodottoSelezionato}
          className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Aggiungi riga
        </button>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-700">
          Righe preventivo ({righe.length})
        </h2>

        {righe.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
            Nessuna riga aggiunta.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Prodotto</th>
                  <th className="px-4 py-2 font-medium">Misure</th>
                  <th className="px-4 py-2 font-medium">Quantità</th>
                  <th className="px-4 py-2 font-medium">Posa</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {righe.map((riga) => (
                  <tr key={riga.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-3">{riga.prodotto.nome}</td>
                    <td className="px-4 py-3">{formatMisure(riga)}</td>
                    <td className="px-4 py-3">{riga.quantita}</td>
                    <td className="px-4 py-3">{riga.posa ? "Sì" : "No"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRimuoviRiga(riga.id)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Rimuovi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
