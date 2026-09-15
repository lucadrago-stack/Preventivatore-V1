"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import DescrizioneCommercialeEditor from "@/components/DescrizioneCommercialeEditor";
import { createSupabaseClient } from "@/lib/supabase";
import { formatEuro, normalizzaRelazione } from "@/lib/format";
import { sanitizeDescrizioneHtml } from "@/lib/descrizione-formattata";
import {
  etichettaValoreRegola,
  normalizzaRegolaPrezzo,
  type RegolaPrezzo,
} from "@/lib/regola-prezzo";

export type ProdottoAdmin = {
  id: number;
  nome: string;
  prezzo_unitario: number | null;
  regola_prezzo: string | null;
  regola_valore: number | null;
  ha_vetro: boolean | null;
  descrizione_cliente: string | null;
  categorie: { id: number; nome: string } | { id: number; nome: string }[] | null;
};

type Props = {
  initialProdotti: ProdottoAdmin[];
};

function badgeRegola(regola: string | null): string {
  if ((regola ?? "").trim() === "griglia") return "Griglia + sconto";
  const r = normalizzaRegolaPrezzo(regola);
  if (r === "sconto_listino") return "Sconto listino";
  if (r === "moltiplicatore") return "Moltiplicatore";
  return "Diretto";
}

function hasDescrizione(html: string | null | undefined): boolean {
  const plain = (html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  return plain.length > 0;
}

export default function TabProdotti({ initialProdotti }: Props) {
  const [prodotti, setProdotti] = useState(initialProdotti);
  const [ricerca, setRicerca] = useState("");
  const [editing, setEditing] = useState<ProdottoAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [nome, setNome] = useState("");
  const [categoriaNome, setCategoriaNome] = useState("");
  const [regola, setRegola] = useState<RegolaPrezzo>("diretto");
  /** regola_prezzo grezza dal DB (es. griglia), non normalizzata. */
  const [regolaRaw, setRegolaRaw] = useState<string | null>(null);
  const [prezzo, setPrezzo] = useState("");
  const [regolaValore, setRegolaValore] = useState("");
  const [haVetro, setHaVetro] = useState(false);
  const [descrizione, setDescrizione] = useState("");

  const filtrati = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    if (!q) return prodotti;
    return prodotti.filter((p) => p.nome.toLowerCase().includes(q));
  }, [prodotti, ricerca]);

  function apriModifica(p: ProdottoAdmin) {
    const cat = normalizzaRelazione(p.categorie);
    setEditing(p);
    setNome(p.nome);
    setCategoriaNome(cat?.nome ?? "—");
    setRegolaRaw(p.regola_prezzo);
    setRegola(normalizzaRegolaPrezzo(p.regola_prezzo));
    setPrezzo(
      p.prezzo_unitario != null && Number.isFinite(Number(p.prezzo_unitario))
        ? String(p.prezzo_unitario)
        : "",
    );
    setRegolaValore(
      p.regola_valore != null && Number.isFinite(Number(p.regola_valore))
        ? String(p.regola_valore)
        : "",
    );
    setHaVetro(Boolean(p.ha_vetro));
    setDescrizione(
      sanitizeDescrizioneHtml(p.descrizione_cliente ?? ""),
    );
    setError(null);
    setSaving(false);
  }

  function chiudi() {
    setEditing(null);
    setError(null);
    setSaving(false);
  }

  async function salvaEChiudi() {
    if (!editing || saving) return;
    setSaving(true);
    setError(null);

    try {
      const prezzoNum = prezzo === "" ? null : Number(prezzo);
      const valoreNum = regolaValore === "" ? null : Number(regolaValore);
      const isGriglia = (regolaRaw ?? "").trim() === "griglia";
      const usaSconto =
        isGriglia ||
        regola === "sconto_listino" ||
        regola === "moltiplicatore";

      if (prezzoNum != null && !Number.isFinite(prezzoNum)) {
        throw new Error("Prezzo listino non valido");
      }
      if (
        usaSconto &&
        regolaValore !== "" &&
        !Number.isFinite(Number(regolaValore))
      ) {
        throw new Error("Valore regola non valido");
      }

      const patch: Record<string, unknown> = {
        regola_valore: usaSconto
          ? valoreNum != null && Number.isFinite(valoreNum)
            ? valoreNum
            : null
          : null,
        descrizione_cliente: descrizione.trim()
          ? sanitizeDescrizioneHtml(descrizione)
          : null,
      };
      if (regola === "diretto" && !isGriglia) {
        patch.prezzo_unitario = prezzoNum;
      }

      const supabase = createSupabaseClient();
      const { data, error: updateError } = await supabase
        .from("prodotti")
        .update(patch)
        .eq("id", editing.id)
        .select(
          "id, nome, prezzo_unitario, regola_prezzo, regola_valore, ha_vetro, descrizione_cliente, categorie(id, nome)",
        )
        .single();

      if (updateError || !data) {
        throw new Error(updateError?.message ?? "Salvataggio fallito");
      }

      const updated = data as ProdottoAdmin;
      setProdotti((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );
      chiudi();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Input
        label="Cerca prodotto"
        type="search"
        value={ricerca}
        onChange={(e) => setRicerca(e.target.value)}
        placeholder="Nome prodotto..."
        wrapperClassName="max-w-md"
      />

      <Card compact className="overflow-x-auto p-0 sm:p-0">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-brand-border bg-brand-surface text-xs uppercase tracking-wide text-brand-muted">
            <tr>
              <th className="px-3 py-3 font-medium">Nome</th>
              <th className="px-3 py-3 font-medium">Categoria</th>
              <th className="px-3 py-3 font-medium">Prezzo listino</th>
              <th className="px-3 py-3 font-medium">Regola prezzo</th>
              <th className="px-3 py-3 font-medium">Descrizione</th>
              <th className="px-3 py-3 font-medium">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filtrati.map((p) => {
              const cat = normalizzaRelazione(p.categorie);
              const okDesc = hasDescrizione(p.descrizione_cliente);
              return (
                <tr
                  key={p.id}
                  className="border-b border-brand-border/70 last:border-0"
                >
                  <td className="px-3 py-3 font-medium text-brand-text">
                    {p.nome}
                  </td>
                  <td className="px-3 py-3 text-brand-muted">
                    {cat?.nome ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-brand-muted">
                    {p.prezzo_unitario != null
                      ? formatEuro(Number(p.prezzo_unitario))
                      : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700">
                      {badgeRegola(p.regola_prezzo)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        okDesc
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {okDesc ? "Compilata" : "Mancante"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-[36px] px-2.5 py-1 text-xs"
                      onClick={() => apriModifica(p)}
                    >
                      Modifica
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-brand-border bg-white p-5 shadow-lg">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-brand-navy">
                Modifica prodotto
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Nome" value={nome} disabled />
              <Input label="Categoria" value={categoriaNome} disabled />

              <div>
                <span className="mb-1.5 block text-sm text-brand-label">
                  Regola prezzo
                </span>
                <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                  {badgeRegola(regolaRaw ?? regola)}
                </span>
              </div>

              <div>
                <span className="mb-1.5 block text-sm text-brand-label">
                  Ha vetro
                </span>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                    haVetro
                      ? "bg-sky-100 text-sky-800"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {haVetro ? "Sì" : "No"}
                </span>
              </div>

              {(regolaRaw ?? "").trim() === "griglia" ? (
                <>
                  <Input
                    label="Prezzo listino"
                    value="Da griglia (interpolazione)"
                    disabled
                  />
                  <Input
                    label="Sconto listino %"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={regolaValore}
                    onChange={(e) => setRegolaValore(e.target.value)}
                    hint="Applicato sul prezzo calcolato dalla griglia (+ extra colore)"
                  />
                </>
              ) : regola === "diretto" ? (
                <Input
                  label="Prezzo listino"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={prezzo}
                  onChange={(e) => setPrezzo(e.target.value)}
                />
              ) : (
                <Input
                  label="Prezzo listino"
                  value={
                    prezzo === "" || Number(prezzo) === 0
                      ? "0 (non usato — prezzo digitato in riga)"
                      : prezzo
                  }
                  disabled
                />
              )}

              {regola === "sconto_listino" &&
                (regolaRaw ?? "").trim() !== "griglia" && (
                <Input
                  label="Sconto listino %"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={regolaValore}
                  onChange={(e) => setRegolaValore(e.target.value)}
                />
              )}
              {regola === "moltiplicatore" && (
                <Input
                  label={etichettaValoreRegola("moltiplicatore")}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={regolaValore}
                  onChange={(e) => setRegolaValore(e.target.value)}
                />
              )}

              <div className="sm:col-span-2">
                <span className="mb-1.5 block text-sm text-brand-label">
                  Descrizione commerciale
                </span>
                <DescrizioneCommercialeEditor
                  value={descrizione}
                  onChange={setDescrizione}
                  rigaKey={`prodotto-${editing.id}`}
                />
              </div>
            </div>

            {error && (
              <p className="mt-3 text-sm text-brand-danger" role="alert">
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={chiudi}>
                Chiudi
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void salvaEChiudi()}
                disabled={saving}
              >
                {saving ? "Salvataggio..." : "Salva"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
