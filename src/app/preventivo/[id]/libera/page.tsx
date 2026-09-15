"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { prossimoNumeroPosizione } from "@/lib/righe-posizione";
import { createSupabaseClient } from "@/lib/supabase";
import { formatEuro, titoloPreventivo } from "@/lib/format";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

type RigaLibera = {
  id: number;
  descrizione_libera: string;
  nota: string | null;
  prezzo_libero: number;
  quantita: number;
  prezzo_riga: number | null;
};

const SELECT_RIGHE_LIBERE =
  "id, descrizione_libera, nota, prezzo_libero, quantita, prezzo_riga";

export default function PosizioneLiberaPage() {
  const params = useParams<{ id: string }>();
  const preventivoId = params.id;

  const [riferimento, setRiferimento] = useState<string | null>(null);
  const [clienteNome, setClienteNome] = useState<string | null>(null);
  const [righe, setRighe] = useState<RigaLibera[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [descrizione, setDescrizione] = useState("");
  const [nota, setNota] = useState("");
  const [quantita, setQuantita] = useState("1");
  const [prezzoUnitario, setPrezzoUnitario] = useState("");

  const formSporco =
    descrizione.trim() !== "" ||
    nota.trim() !== "" ||
    prezzoUnitario.trim() !== "" ||
    (quantita.trim() !== "" && quantita.trim() !== "1");
  useUnsavedChanges(formSporco && !saving);

  const loadRighe = useCallback(async () => {
    const supabase = createSupabaseClient();
    const { data, error: righeError } = await supabase
      .from("righe")
      .select(SELECT_RIGHE_LIBERE)
      .eq("preventivo_id", preventivoId)
      .is("prodotto_id", null)
      // Solo voci libere: esclude testo e righe posa (tipo_riga = posa).
      .or("tipo_riga.is.null,tipo_riga.eq.prodotto")
      .order("id");

    if (righeError) throw new Error(righeError.message);
    setRighe((data ?? []) as RigaLibera[]);
  }, [preventivoId]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      const supabase = createSupabaseClient();

      try {
        const [preventivoResult, righeResult] = await Promise.all([
          supabase
            .from("preventivi")
            .select("riferimento, cliente_nome")
            .eq("id", preventivoId)
            .single(),
          supabase
            .from("righe")
            .select(SELECT_RIGHE_LIBERE)
            .eq("preventivo_id", preventivoId)
            .is("prodotto_id", null)
            .or("tipo_riga.is.null,tipo_riga.eq.prodotto")
            .order("id"),
        ]);

        if (preventivoResult.error) throw new Error(preventivoResult.error.message);
        if (righeResult.error) throw new Error(righeResult.error.message);

        setRiferimento(preventivoResult.data.riferimento);
        setClienteNome(preventivoResult.data.cliente_nome ?? null);
        setRighe((righeResult.data ?? []) as RigaLibera[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore sconosciuto");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [preventivoId]);

  function resetForm() {
    setDescrizione("");
    setNota("");
    setQuantita("1");
    setPrezzoUnitario("");
  }

  async function handleAggiungi() {
    const descrizioneTrim = descrizione.trim();
    const notaTrim = nota.trim();
    const quantitaNum = Number(quantita);
    const prezzoNum = Number(prezzoUnitario);

    if (!descrizioneTrim) return;
    if (!Number.isFinite(quantitaNum) || quantitaNum <= 0) return;
    if (!Number.isFinite(prezzoNum) || prezzoNum < 0) return;

    setSaving(true);
    setError(null);

    const supabase = createSupabaseClient();
    let numeroPosizione: number;
    try {
      numeroPosizione = await prossimoNumeroPosizione(supabase, preventivoId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore numerazione");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("righe").insert({
      preventivo_id: Number(preventivoId),
      prodotto_id: null,
      descrizione_libera: descrizioneTrim,
      descrizione_cliente: descrizioneTrim,
      descrizione_tecnica: "Riga libera",
      nota: notaTrim || null,
      prezzo_libero: prezzoNum,
      quantita: quantitaNum,
      prezzo_riga: prezzoNum * quantitaNum,
      larghezza_cm: null,
      altezza_cm: null,
      lunghezza_cm: null,
      posa: false,
      tipo_riga: "prodotto",
      numero_posizione: numeroPosizione,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    await loadRighe();
    resetForm();
    setSaving(false);
  }

  async function handleElimina(rigaId: number) {
    setError(null);
    setDeletingId(rigaId);

    const supabase = createSupabaseClient();
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

  const prezzoAnteprima = (() => {
    const quantitaNum = Number(quantita);
    const prezzoNum = Number(prezzoUnitario);
    if (!Number.isFinite(quantitaNum) || quantitaNum <= 0) return null;
    if (!Number.isFinite(prezzoNum) || prezzoNum < 0) return null;
    return prezzoNum * quantitaNum;
  })();

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <p className="text-zinc-600">Caricamento...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6">
        <Link
          href={`/preventivo/${preventivoId}`}
          className="text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          ← Torna al preventivo
        </Link>
      </div>

      <header className="mb-8">
        <p className="text-sm text-zinc-500">
          {titoloPreventivo(clienteNome, riferimento)}
        </p>
        <h1 className="text-2xl font-semibold">Posizione libera</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Inserisci una voce non presente a listino.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <section className="mb-8 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-4">
        <h2 className="mb-4 text-sm font-medium text-zinc-700">Nuova voce</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600">Descrizione</span>
            <input
              type="text"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Es. Trasporto speciale, manodopera extra..."
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600">Note</span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              placeholder="Nota libera (opzionale)"
              className="min-h-[42px] rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600">Quantità</span>
            <input
              type="number"
              min="1"
              step="1"
              value={quantita}
              onChange={(e) => setQuantita(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600">Prezzo unitario (€)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={prezzoUnitario}
              onChange={(e) => setPrezzoUnitario(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>

        {prezzoAnteprima !== null && (
          <p className="mt-4 text-sm text-zinc-600">
            Totale riga:{" "}
            <span className="font-medium text-zinc-900">
              {formatEuro(prezzoAnteprima)}
            </span>
          </p>
        )}

        <button
          type="button"
          onClick={handleAggiungi}
          disabled={
            saving ||
            !descrizione.trim() ||
            prezzoAnteprima === null
          }
          className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Salvataggio..." : "Aggiungi al preventivo"}
        </button>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-700">
          Posizioni libere ({righe.length})
        </h2>

        {righe.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
            Nessuna posizione libera inserita.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Descrizione</th>
                  <th className="px-4 py-2 font-medium">Note</th>
                  <th className="px-4 py-2 font-medium">Qtà</th>
                  <th className="px-4 py-2 font-medium">Prezzo unit.</th>
                  <th className="px-4 py-2 font-medium text-right">Totale</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {righe.map((riga) => (
                  <tr
                    key={riga.id}
                    className="border-b border-zinc-100 last:border-0"
                  >
                    <td className="px-4 py-3">{riga.descrizione_libera}</td>
                    <td className="px-4 py-3 text-zinc-600 whitespace-pre-wrap">
                      {riga.nota?.trim() ? riga.nota : "—"}
                    </td>
                    <td className="px-4 py-3">{riga.quantita}</td>
                    <td className="px-4 py-3">
                      {formatEuro(riga.prezzo_libero)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {riga.prezzo_riga != null
                        ? formatEuro(riga.prezzo_riga)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleElimina(riga.id)}
                        disabled={deletingId === riga.id}
                        className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {deletingId === riga.id ? "..." : "Elimina"}
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
