"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input, inputControlClass, PageTitle } from "@/components/ui";
import { formatEuro } from "@/lib/format";
import { createSupabaseClient } from "@/lib/supabase";
import { IVA_ALIQUOTE, type IvaAliquota } from "@/lib/totali-preventivo";
import {
  DEFAULT_FAMIGLIA_ALTERNATIVA,
  anticipoDefaultPerConvenzione,
  mapConvenzioneRow,
  mappaAnticipiDefault,
  parseConfigFinanziamento,
  simulaTutteLeConvenzioni,
  titoloConvenzione,
  type ConfigFinanziamento,
  type ConvenzioneFinanziamento,
  type FamigliaAlternativa,
  type SimulazioneConvenzione,
} from "@/lib/finanziamento";

type BaseMode = "ivato" | "imponibile";

function formatTan(tan: number): string {
  if (tan === 0) return "0%";
  return `${tan.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`;
}

function parseImporto(raw: string): number {
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function SimulatorePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigFinanziamento | null>(null);
  const [convenzioni, setConvenzioni] = useState<ConvenzioneFinanziamento[]>(
    [],
  );

  const [importoRaw, setImportoRaw] = useState("");
  const [baseMode, setBaseMode] = useState<BaseMode>("ivato");
  const [iva, setIva] = useState<IvaAliquota>(10);
  const [anticipoRaw, setAnticipoRaw] = useState("0");
  const [famiglia, setFamiglia] = useState<FamigliaAlternativa>(
    DEFAULT_FAMIGLIA_ALTERNATIVA,
  );
  const [anticipiRaw, setAnticipiRaw] = useState<Record<number, string>>({});
  const [defaultsAnticipoPronti, setDefaultsAnticipoPronti] = useState(false);

  const importo = parseImporto(importoRaw);

  const baseIvato = useMemo(() => {
    if (baseMode === "ivato") return importo;
    return Math.round(importo * (1 + iva / 100) * 100) / 100;
  }, [baseMode, importo, iva]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseClient();
    try {
      const [configResult, convResult] = await Promise.all([
        supabase.from("config_finanziamento").select("chiave, valore"),
        supabase
          .from("convenzioni_finanziamento")
          .select(
            `id, durata_mesi, tan, tipo, regola_maggiorazione, attivo, ordine,
            doppio_piano, tan_prima_meta, famiglia`,
          )
          .eq("attivo", true)
          .order("ordine"),
      ]);
      if (configResult.error) throw new Error(configResult.error.message);
      if (convResult.error) throw new Error(convResult.error.message);

      setConfig(parseConfigFinanziamento(configResult.data ?? []));
      setConvenzioni(
        (convResult.data ?? []).map((row) =>
          mapConvenzioneRow(row as Record<string, unknown>),
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Errore nel caricamento configurazione",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // Anticipi default quando cambiano base/config
  useEffect(() => {
    if (!config || convenzioni.length === 0) return;
    const defaults = mappaAnticipiDefault(baseIvato, convenzioni, config);
    const next: Record<number, string> = {};
    for (const [id, v] of Object.entries(defaults)) {
      next[Number(id)] = String(v);
    }
    setAnticipiRaw(next);
    setAnticipoRaw("0");
    setDefaultsAnticipoPronti(true);
  }, [baseIvato, config, convenzioni]);

  const anticipiPerId = useMemo(() => {
    const out: Record<number, number> = {};
    for (const [id, raw] of Object.entries(anticipiRaw)) {
      out[Number(id)] = parseImporto(raw);
    }
    if (config) {
      for (const c of convenzioni) {
        if (!c.attivo) continue;
        if (out[c.id] === undefined) {
          out[c.id] = anticipoDefaultPerConvenzione(baseIvato, c, config);
        }
      }
    }
    return out;
  }, [anticipiRaw, baseIvato, config, convenzioni]);

  const simulazioni = useMemo(() => {
    if (!config || !defaultsAnticipoPronti) return [] as SimulazioneConvenzione[];
    return simulaTutteLeConvenzioni({
      baseIvato,
      anticipiPerId,
      convenzioni,
      config,
      famigliaAlternativa: famiglia,
    });
  }, [
    anticipiPerId,
    baseIvato,
    config,
    convenzioni,
    defaultsAnticipoPronti,
    famiglia,
  ]);

  function applicaAnticipoATutte(raw: string) {
    setAnticipoRaw(raw);
    const value = String(parseImporto(raw));
    setAnticipiRaw((prev) => {
      const next = { ...prev };
      for (const c of convenzioni) {
        if (!c.attivo) continue;
        next[c.id] = value;
      }
      return next;
    });
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-brand-muted">Caricamento simulatore...</p>
      </main>
    );
  }

  if (error || !config) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-brand-danger">
          {error ?? "Configurazione non disponibile"}
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-brand-accent">
          ← Torna alla home
        </Link>
      </main>
    );
  }

  const haTassoZero = convenzioni.some(
    (c) => c.attivo && c.famiglia === "tasso_zero",
  );
  const haDoppioPiano = convenzioni.some(
    (c) => c.attivo && c.famiglia === "doppio_piano",
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm font-medium text-brand-accent hover:underline"
        >
          ← Home
        </Link>
      </div>

      <PageTitle meta="Calcolo al volo, senza salvataggio su preventivo.">
        Simulatore finanziamento
      </PageTitle>

      <section className="mb-6 rounded-md border border-brand-border bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBaseMode("ivato")}
            className={`min-h-[40px] rounded-md border px-3 text-sm font-medium ${
              baseMode === "ivato"
                ? "border-brand-navy bg-brand-navy text-white"
                : "border-brand-border bg-white text-brand-text"
            }`}
          >
            IVA inclusa
          </button>
          <button
            type="button"
            onClick={() => setBaseMode("imponibile")}
            className={`min-h-[40px] rounded-md border px-3 text-sm font-medium ${
              baseMode === "imponibile"
                ? "border-brand-navy bg-brand-navy text-white"
                : "border-brand-border bg-white text-brand-text"
            }`}
          >
            Imponibile
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={
              baseMode === "ivato"
                ? "Importo IVA inclusa (€)"
                : "Importo imponibile (€)"
            }
            type="number"
            min={0}
            step={0.01}
            inputMode="decimal"
            value={importoRaw}
            onChange={(e) => setImportoRaw(e.target.value)}
            placeholder="0"
          />
          {baseMode === "imponibile" && (
            <Input
              as="select"
              label="Aliquota IVA"
              value={String(iva)}
              onChange={(e) => setIva(Number(e.target.value) as IvaAliquota)}
            >
              {IVA_ALIQUOTE.map((a) => (
                <option key={a} value={a}>
                  {a}%
                </option>
              ))}
            </Input>
          )}
        </div>

        <p className="mt-3 text-sm text-brand-muted">
          Base IVATO per il calcolo:{" "}
          <span className="font-semibold tabular-nums text-brand-navy">
            {formatEuro(baseIvato)}
          </span>
        </p>

        <div className="mt-4 max-w-xs">
          <Input
            label="Anticipo (€, IVA inclusa)"
            type="number"
            min={0}
            step={0.01}
            inputMode="decimal"
            value={anticipoRaw}
            onChange={(e) => applicaAnticipoATutte(e.target.value)}
            hint="Applica a tutte le durate; puoi ritoccare singolarmente sotto."
          />
        </div>

        {(haTassoZero || haDoppioPiano) && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-brand-muted">
              Famiglia rate (il 20 mesi resta sempre visibile)
            </p>
            <div className="inline-flex flex-wrap rounded-md border border-brand-border bg-brand-surface/50 p-1">
              {haTassoZero && (
                <button
                  type="button"
                  onClick={() => setFamiglia("tasso_zero")}
                  className={`min-h-[40px] rounded px-3 text-sm font-medium ${
                    famiglia === "tasso_zero"
                      ? "bg-white text-brand-navy shadow-sm"
                      : "text-brand-muted hover:text-brand-text"
                  }`}
                >
                  Agevolato 36-60
                </button>
              )}
              {haDoppioPiano && (
                <button
                  type="button"
                  onClick={() => setFamiglia("doppio_piano")}
                  className={`min-h-[40px] rounded px-3 text-sm font-medium ${
                    famiglia === "doppio_piano"
                      ? "bg-white text-brand-navy shadow-sm"
                      : "text-brand-muted hover:text-brand-text"
                  }`}
                >
                  Doppio piano 60-120
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="space-y-3">
        {simulazioni.map((sim) => {
          const titolo = titoloConvenzione(sim.convenzione);
          const isPromo =
            sim.convenzione.famiglia === "base" ||
            (sim.durataMesi === 20 && !sim.convenzione.doppio_piano);
          const anticipoCampo =
            anticipiRaw[sim.convenzione.id] ?? String(sim.anticipo);

          return (
            <div
              key={sim.convenzione.id}
              className={`rounded-md border p-4 ${
                isPromo
                  ? "border-emerald-700/40 bg-emerald-50/40"
                  : "border-brand-border bg-white"
              } ${!sim.possibile ? "opacity-75" : ""}`}
            >
              <p className="mb-3 text-sm font-semibold text-brand-navy">
                {titolo}
                {isPromo && (
                  <span className="ml-2 rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                    Promo
                  </span>
                )}
              </p>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2 rounded-md border-2 border-brand-navy bg-white px-3 py-2 sm:col-span-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy">
                    Importo contrattuale
                  </p>
                  <p className="text-lg font-bold tabular-nums text-brand-navy">
                    {formatEuro(sim.importoFatturato)}
                  </p>
                  <p className="text-[10px] text-brand-muted">
                    {sim.maggiorazioneApplicata
                      ? `+${config.maggiorazione_perc}% maggiorazione`
                      : "senza maggiorazione"}
                  </p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-brand-muted">
                    Anticipo (€)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    inputMode="decimal"
                    value={anticipoCampo}
                    onChange={(e) =>
                      setAnticipiRaw((prev) => ({
                        ...prev,
                        [sim.convenzione.id]: e.target.value,
                      }))
                    }
                    className={`${inputControlClass} mt-0.5`}
                  />
                  {sim.anticipoMinimo > 0 && (
                    <p className="mt-0.5 text-[10px] text-amber-700">
                      Min. {formatEuro(sim.anticipoMinimo)}
                    </p>
                  )}
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[10px] uppercase tracking-wide text-brand-muted">
                    Rata mensile
                  </p>
                  <p className="text-base font-bold tabular-nums text-brand-accent">
                    {sim.possibile ? formatEuro(sim.rataMensile) : "—"}
                  </p>
                  <p className="text-[10px] text-brand-muted">
                    {sim.durataMesi} rate
                    {sim.doppioPiano
                      ? " · doppio piano"
                      : ` · TAN ${formatTan(sim.tan)}`}
                  </p>
                  {sim.possibile && sim.istruttoria > 0 && (
                    <p className="mt-1 text-[10px] leading-snug text-brand-muted">
                      Incl. {formatEuro(sim.istruttoria)} istruttoria (non
                      fatturata BDS)
                    </p>
                  )}
                </div>
              </div>

              {sim.messaggio && (
                <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {sim.messaggio}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {importo === 0 && (
        <p className="mt-4 text-sm text-brand-muted">
          Inserisci un importo per vedere le rate.
        </p>
      )}
    </main>
  );
}
