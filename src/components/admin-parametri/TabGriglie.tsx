"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { createSupabaseClient } from "@/lib/supabase";
import { formatEuro } from "@/lib/format";
import {
  TIPOLOGIE_APERTURA_GRIGLIA,
  etichettaTipologiaApertura,
  type TipologiaAperturaGriglia,
} from "@/lib/griglia-prezzo";

export type GrigliaAdmin = {
  id: number;
  nome: string;
  attivo: boolean | null;
};

type CellaAdmin = {
  id: number;
  griglia_id: number;
  tipologia_apertura: string;
  larghezza: number;
  altezza: number;
  prezzo: number;
};

type Props = {
  initialGriglie: GrigliaAdmin[];
  tableMissing?: boolean;
};

function arrotondaPrezzo(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatPrezzoCampo(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(arrotondaPrezzo(n));
}

async function aggiornaPrezziBatch(
  updates: Array<{ id: number; prezzo: number }>,
): Promise<void> {
  const supabase = createSupabaseClient();
  const CHUNK = 40;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK);
    const results = await Promise.all(
      slice.map((u) =>
        supabase
          .from("griglie_prezzo_celle")
          .update({ prezzo: u.prezzo })
          .eq("id", u.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
  }
}

export default function TabGriglie({
  initialGriglie,
  tableMissing = false,
}: Props) {
  const [griglie, setGriglie] = useState(initialGriglie);
  const [selectedId, setSelectedId] = useState<number | null>(
    initialGriglie[0]?.id ?? null,
  );
  const [tipologia, setTipologia] = useState<TipologiaAperturaGriglia>(
    "finestra_1anta",
  );
  const [celle, setCelle] = useState<CellaAdmin[]>([]);
  const [loadingCelle, setLoadingCelle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [percentuale, setPercentuale] = useState("");
  const [ambitoPercentuale, setAmbitoPercentuale] = useState<
    "tipologia" | "griglia"
  >("tipologia");
  const [applyingPercentuale, setApplyingPercentuale] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const grigliaSelezionata = useMemo(
    () => griglie.find((g) => g.id === selectedId) ?? null,
    [griglie, selectedId],
  );

  const caricaCelle = useCallback(async (grigliaId: number) => {
    setLoadingCelle(true);
    setError(null);
    setFeedback(null);
    try {
      const supabase = createSupabaseClient();
      const { data, error: loadError } = await supabase
        .from("griglie_prezzo_celle")
        .select("id, griglia_id, tipologia_apertura, larghezza, altezza, prezzo")
        .eq("griglia_id", grigliaId)
        .order("altezza")
        .order("larghezza");
      if (loadError) throw new Error(loadError.message);
      setCelle((data ?? []) as CellaAdmin[]);
      setDrafts({});
    } catch (err) {
      setCelle([]);
      setError(err instanceof Error ? err.message : "Errore caricamento celle");
    } finally {
      setLoadingCelle(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId == null) return;
    void caricaCelle(selectedId);
  }, [selectedId, caricaCelle]);

  const celleTipologia = useMemo(
    () => celle.filter((c) => c.tipologia_apertura === tipologia),
    [celle, tipologia],
  );

  const assi = useMemo(() => {
    const Ls = [
      ...new Set(celleTipologia.map((c) => Number(c.larghezza))),
    ].sort((a, b) => a - b);
    const Hs = [
      ...new Set(celleTipologia.map((c) => Number(c.altezza))),
    ].sort((a, b) => a - b);
    const byKey = new Map<string, CellaAdmin>();
    for (const c of celleTipologia) {
      byKey.set(`${c.larghezza}x${c.altezza}`, c);
    }
    return { Ls, Hs, byKey };
  }, [celleTipologia]);

  const conteggi = useMemo(() => {
    const perTip = new Map<string, number>();
    for (const c of celle) {
      perTip.set(
        c.tipologia_apertura,
        (perTip.get(c.tipologia_apertura) ?? 0) + 1,
      );
    }
    return {
      totale: celle.length,
      tipologia: celleTipologia.length,
      perTip,
    };
  }, [celle, celleTipologia]);

  async function salvaCella(cella: CellaAdmin, raw: string) {
    const n = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      setError("Prezzo non valido");
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[cella.id];
        return next;
      });
      return;
    }
    const prezzo = arrotondaPrezzo(n);
    if (prezzo === arrotondaPrezzo(Number(cella.prezzo))) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[cella.id];
        return next;
      });
      return;
    }

    setSavingId(cella.id);
    setError(null);
    setFeedback(null);
    try {
      const supabase = createSupabaseClient();
      const { error: updateError } = await supabase
        .from("griglie_prezzo_celle")
        .update({ prezzo })
        .eq("id", cella.id);
      if (updateError) throw new Error(updateError.message);
      setCelle((prev) =>
        prev.map((c) => (c.id === cella.id ? { ...c, prezzo } : c)),
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[cella.id];
        return next;
      });
      setFeedback(`Cella ${cella.larghezza}×${cella.altezza} mm aggiornata`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSavingId(null);
    }
  }

  async function applicaPercentuale() {
    const perc = Number(String(percentuale).replace(",", "."));
    if (!Number.isFinite(perc)) {
      setError("Inserisci una percentuale valida (es. 5 o -3)");
      return;
    }
    if (perc === 0) {
      setError("La percentuale 0 non cambia i prezzi");
      return;
    }

    const target =
      ambitoPercentuale === "tipologia"
        ? celleTipologia
        : celle;
    if (target.length === 0) {
      setError("Nessuna cella su cui applicare la variazione");
      return;
    }

    const fattore = 1 + perc / 100;
    const labelAmbito =
      ambitoPercentuale === "tipologia"
        ? etichettaTipologiaApertura(tipologia)
        : "tutta la griglia";
    const ok = window.confirm(
      `Applicare ${perc > 0 ? "+" : ""}${perc}% a ${target.length} celle (${labelAmbito})?\n` +
        `Esempio: ${formatEuro(Number(target[0].prezzo))} → ${formatEuro(arrotondaPrezzo(Number(target[0].prezzo) * fattore))}`,
    );
    if (!ok) return;

    setApplyingPercentuale(true);
    setError(null);
    setFeedback(null);
    try {
      const updates = target.map((c) => ({
        id: c.id,
        prezzo: arrotondaPrezzo(Number(c.prezzo) * fattore),
      }));
      await aggiornaPrezziBatch(updates);
      const byId = new Map(updates.map((u) => [u.id, u.prezzo]));
      setCelle((prev) =>
        prev.map((c) =>
          byId.has(c.id) ? { ...c, prezzo: byId.get(c.id)! } : c,
        ),
      );
      setDrafts({});
      setFeedback(
        `Applicato ${perc > 0 ? "+" : ""}${perc}% a ${updates.length} celle (${labelAmbito})`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore aggiornamento");
    } finally {
      setApplyingPercentuale(false);
    }
  }

  async function toggleAttivo(griglia: GrigliaAdmin) {
    setError(null);
    try {
      const supabase = createSupabaseClient();
      const next = !griglia.attivo;
      const { error: updateError } = await supabase
        .from("griglie_prezzo")
        .update({ attivo: next })
        .eq("id", griglia.id);
      if (updateError) throw new Error(updateError.message);
      setGriglie((prev) =>
        prev.map((g) => (g.id === griglia.id ? { ...g, attivo: next } : g)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore aggiornamento");
    }
  }

  if (tableMissing) {
    return (
      <Card>
        <p className="text-sm text-brand-muted">
          Tabelle griglia non trovate. Verifica che esistano{" "}
          <code className="text-xs">griglie_prezzo</code> e{" "}
          <code className="text-xs">griglie_prezzo_celle</code>, e le policy RLS
          admin.
        </p>
      </Card>
    );
  }

  if (griglie.length === 0) {
    return (
      <Card>
        <p className="text-sm text-brand-muted">
          Nessuna griglia listino presente.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {griglie.map((g) => {
          const active = g.id === selectedId;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedId(g.id)}
              className={[
                "rounded-lg border px-4 py-3 text-left transition",
                active
                  ? "border-brand-accent bg-brand-accent/5 ring-1 ring-brand-accent/30"
                  : "border-brand-border bg-white hover:border-brand-navy/40",
              ].join(" ")}
            >
              <p className="font-semibold text-brand-navy">{g.nome}</p>
              <p className="mt-1 text-xs text-brand-muted">
                {g.attivo ? "Attiva" : "Non attiva"} · id {g.id}
              </p>
            </button>
          );
        })}
      </div>

      {grigliaSelezionata && (
        <Card className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-brand-navy">
                {grigliaSelezionata.nome}
              </h2>
              <p className="mt-1 text-sm text-brand-muted">
                {conteggi.totale} celle totali · {conteggi.tipologia} nella
                tipologia selezionata
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => toggleAttivo(grigliaSelezionata)}
            >
              {grigliaSelezionata.attivo ? "Disattiva" : "Attiva"}
            </Button>
          </div>

          <div>
            <p className="mb-2 text-sm text-brand-label">Tipologia apertura</p>
            <div className="flex flex-wrap gap-1">
              {TIPOLOGIE_APERTURA_GRIGLIA.map((t) => {
                const n = conteggi.perTip.get(t.value) ?? 0;
                const selected = tipologia === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTipologia(t.value)}
                    className={[
                      "min-h-[40px] rounded-md px-3 text-xs font-medium",
                      selected
                        ? "bg-brand-navy text-white"
                        : "border border-brand-border bg-white text-brand-text hover:border-brand-navy/40",
                    ].join(" ")}
                  >
                    {t.label}
                    <span className="ml-1 opacity-70">({n})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-md border border-brand-border bg-brand-surface/40 p-4">
            <p className="mb-3 text-sm font-medium text-brand-navy">
              Variazione % su più celle
            </p>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_1fr_auto] sm:items-end">
              <Input
                label="Percentuale"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={percentuale}
                onChange={(e) => setPercentuale(e.target.value)}
                hint="Es. 5 = +5%, -3 = −3%"
              />
              <div>
                <span className="mb-1.5 block text-sm text-brand-label">
                  Ambito
                </span>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex min-h-[44px] items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="ambito-perc"
                      checked={ambitoPercentuale === "tipologia"}
                      onChange={() => setAmbitoPercentuale("tipologia")}
                    />
                    Solo {etichettaTipologiaApertura(tipologia)} (
                    {conteggi.tipologia})
                  </label>
                  <label className="inline-flex min-h-[44px] items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="ambito-perc"
                      checked={ambitoPercentuale === "griglia"}
                      onChange={() => setAmbitoPercentuale("griglia")}
                    />
                    Tutta la griglia ({conteggi.totale})
                  </label>
                </div>
              </div>
              <Button
                variant="primary"
                onClick={() => void applicaPercentuale()}
                disabled={applyingPercentuale || percentuale.trim() === ""}
              >
                {applyingPercentuale ? "Applicazione..." : "Applica %"}
              </Button>
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-brand-danger">
              {error}
            </p>
          )}
          {feedback && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {feedback}
            </p>
          )}

          {loadingCelle ? (
            <p className="text-sm text-brand-muted">Caricamento celle...</p>
          ) : celleTipologia.length === 0 ? (
            <p className="text-sm text-brand-muted">
              Nessuna cella per questa tipologia.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 border border-brand-border bg-brand-surface px-2 py-2 text-left font-medium text-brand-muted">
                      H \ L (mm)
                    </th>
                    {assi.Ls.map((L) => (
                      <th
                        key={L}
                        className="border border-brand-border bg-brand-surface px-2 py-2 text-center font-medium text-brand-muted"
                      >
                        {L}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assi.Hs.map((H) => (
                    <tr key={H}>
                      <th className="sticky left-0 z-10 border border-brand-border bg-brand-surface px-2 py-1.5 text-left font-medium text-brand-muted">
                        {H}
                      </th>
                      {assi.Ls.map((L) => {
                        const cella = assi.byKey.get(`${L}x${H}`);
                        if (!cella) {
                          return (
                            <td
                              key={`${L}-${H}`}
                              className="border border-brand-border bg-zinc-50 px-1 py-1 text-center text-brand-muted"
                            >
                              —
                            </td>
                          );
                        }
                        const value =
                          drafts[cella.id] ?? formatPrezzoCampo(cella.prezzo);
                        const saving = savingId === cella.id;
                        return (
                          <td
                            key={cella.id}
                            className="border border-brand-border p-1"
                          >
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              disabled={saving || applyingPercentuale}
                              value={value}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [cella.id]: e.target.value,
                                }))
                              }
                              onBlur={() =>
                                void salvaCella(
                                  cella,
                                  drafts[cella.id] ??
                                    formatPrezzoCampo(cella.prezzo),
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              aria-label={`Prezzo L ${L} H ${H}`}
                              className="min-h-[40px] w-full min-w-[5.5rem] rounded border border-transparent bg-white px-1.5 text-right tabular-nums outline-none focus:border-brand-accent disabled:opacity-50"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-brand-muted">
                Modifica una cella e premi Invio o esci dal campo per salvare.
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
