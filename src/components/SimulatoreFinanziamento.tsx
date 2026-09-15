"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AutosaveStatusIndicator from "@/components/AutosaveStatusIndicator";
import { Input, inputControlClass } from "@/components/ui";
import type { AutosaveStatus } from "@/hooks/useAutosave";
import { formatEuro } from "@/lib/format";
import { createSupabaseClient } from "@/lib/supabase";
import {
  DEFAULT_FAMIGLIA_ALTERNATIVA,
  anticipoDefaultPerConvenzione,
  defaultDurateMostrate,
  mapConvenzioneRow,
  mappaAnticipiDefault,
  parseConfigFinanziamento,
  parseDurateMostrate,
  parseFamigliaAlternativa,
  serializzaDurateMostrate,
  simulaTutteLeConvenzioni,
  titoloConvenzione,
  type ConfigFinanziamento,
  type ConvenzioneFinanziamento,
  type FamigliaAlternativa,
  type SimulazioneConvenzione,
} from "@/lib/finanziamento";

type Props = {
  preventivoId: string;
  /** Totale IVATO (imponibile + IVA) — base del calcolo. */
  baseIvato: number;
  onFeedback?: (msg: string) => void;
  /** Anticipo generale (campo default) aggiornato — per precompilare condizioni. */
  onAnticipoGeneraleChange?: (anticipo: number) => void;
};

function formatTan(tan: number): string {
  if (tan === 0) return "0%";
  return `${tan.toLocaleString("it-IT", {
    maximumFractionDigits: 2,
  })}%`;
}

function parseAnticipo(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toRawMap(values: Record<number, number>): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [id, v] of Object.entries(values)) {
    out[Number(id)] = String(v);
  }
  return out;
}

export default function SimulatoreFinanziamento({
  preventivoId,
  baseIvato,
  onAnticipoGeneraleChange,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigFinanziamento | null>(null);
  const [convenzioni, setConvenzioni] = useState<ConvenzioneFinanziamento[]>(
    [],
  );

  /** Default: incluso nel preventivo. */
  const [attivo, setAttivo] = useState(true);
  const [anticipoDefaultRaw, setAnticipoDefaultRaw] = useState("0");
  const [anticipiRaw, setAnticipiRaw] = useState<Record<number, string>>({});
  const [famiglia, setFamiglia] = useState<FamigliaAlternativa>(
    DEFAULT_FAMIGLIA_ALTERNATIVA,
  );
  const [durateMostrate, setDurateMostrate] = useState<number[]>([]);
  const [durataScelta, setDurataScelta] = useState<number | null>(null);
  /** PDF: solo l'opzione radio, senza confronto "mostra al cliente". */
  const [soloScelta, setSoloScelta] = useState(false);
  /** Contratto = Totale IVATO (niente +3,5%). */
  const [assorbiMaggiorazione, setAssorbiMaggiorazione] = useState(false);
  const [defaultsApplicati, setDefaultsApplicati] = useState(false);
  const [avevaDurataScelta, setAvevaDurataScelta] = useState(false);
  const [avevaFamigliaSalvata, setAvevaFamigliaSalvata] = useState(false);
  const [anticipoSceltaSalvato, setAnticipoSceltaSalvato] = useState<
    number | null
  >(null);
  /** Anticipo generale ripristinato dal DB (campo default + tutte le opzioni). */
  const [anticipoGeneraleSalvato, setAnticipoGeneraleSalvato] = useState<
    number | null
  >(null);
  const [durateSalvateDalDb, setDurateSalvateDalDb] = useState<number[] | null>(
    null,
  );

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutosaveRef = useRef(true);
  const hydratedRef = useRef(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    skipAutosaveRef.current = true;
    hydratedRef.current = false;
    setDefaultsApplicati(false);
    setAnticipoGeneraleSalvato(null);
    setAnticipoSceltaSalvato(null);
    setDurateSalvateDalDb(null);
    setAvevaDurataScelta(false);
    setAvevaFamigliaSalvata(false);

    const supabase = createSupabaseClient();
    try {
      const [configResult, convResult, prevResult] = await Promise.all([
        supabase.from("config_finanziamento").select("chiave, valore"),
        supabase
          .from("convenzioni_finanziamento")
          .select(
            `id, durata_mesi, tan, tipo, regola_maggiorazione, attivo, ordine,
            doppio_piano, tan_prima_meta, famiglia`,
          )
          .eq("attivo", true)
          .order("ordine"),
        supabase
          .from("preventivi")
          .select(
            `finanziamento_attivo, finanziamento_anticipo, finanziamento_durate_mostrate,
            fin_famiglia, fin_durata_scelta, fin_pdf_solo_scelta, fin_assorbi_maggiorazione,
            fin_importo_fatturato, fin_importo_finanziato, fin_rata, fin_tan`,
          )
          .eq("id", preventivoId)
          .single(),
      ]);
      if (configResult.error) throw new Error(configResult.error.message);
      if (convResult.error) throw new Error(convResult.error.message);

      setConfig(parseConfigFinanziamento(configResult.data ?? []));
      setConvenzioni(
        (convResult.data ?? []).map((row) =>
          mapConvenzioneRow(row as Record<string, unknown>),
        ),
      );

      if (!prevResult.error && prevResult.data) {
        const p = prevResult.data;
        // Default prodotto: incluso. Solo false esplicitamente salvato resta off.
        setAttivo(
          p.finanziamento_attivo == null
            ? true
            : Boolean(p.finanziamento_attivo),
        );
        const solo = Boolean(p.fin_pdf_solo_scelta);
        setSoloScelta(solo);
        setAssorbiMaggiorazione(Boolean(p.fin_assorbi_maggiorazione));
        const salvate = parseDurateMostrate(p.finanziamento_durate_mostrate);
        const sceltaSalvata = p.fin_durata_scelta ?? null;
        setDurataScelta(sceltaSalvata);
        setAvevaDurataScelta(sceltaSalvata != null);
        // In modalità solo scelta il PDF ha una sola durata: allinea lo stato.
        if (solo && sceltaSalvata != null) {
          setDurateMostrate([sceltaSalvata]);
          setDurateSalvateDalDb([sceltaSalvata]);
        } else {
          setDurateSalvateDalDb(salvate.length > 0 ? salvate : null);
          if (salvate.length > 0) {
            setDurateMostrate(salvate);
          }
        }
        if (p.fin_famiglia != null && String(p.fin_famiglia).trim() !== "") {
          setFamiglia(parseFamigliaAlternativa(p.fin_famiglia));
          setAvevaFamigliaSalvata(true);
        }
        const ant = Number(p.finanziamento_anticipo);
        if (Number.isFinite(ant) && ant >= 0) {
          setAnticipoGeneraleSalvato(ant);
          setAnticipoSceltaSalvato(ant);
          setAnticipoDefaultRaw(String(ant));
          onAnticipoGeneraleChange?.(ant);
        } else {
          setAnticipoGeneraleSalvato(null);
          setAnticipoSceltaSalvato(null);
          setAnticipoDefaultRaw("0");
        }
      } else {
        setAttivo(true);
        setSoloScelta(false);
        setAssorbiMaggiorazione(false);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Errore nel caricamento configurazione finanziamento",
      );
    } finally {
      setLoading(false);
    }
  }, [onAnticipoGeneraleChange, preventivoId]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (defaultsApplicati || !config || convenzioni.length === 0) return;
    const soglia = config.soglia_tasso_zero_gratis;
    const fam = avevaFamigliaSalvata ? famiglia : DEFAULT_FAMIGLIA_ALTERNATIVA;
    if (!avevaFamigliaSalvata) {
      setFamiglia(DEFAULT_FAMIGLIA_ALTERNATIVA);
    }

    // Non sovrascrivere le durate già caricate dal DB.
    if (durateSalvateDalDb == null) {
      setDurateMostrate(
        defaultDurateMostrate(baseIvato, convenzioni, soglia, fam),
      );
    }
    if (!avevaDurataScelta) {
      // Solo scelta: il commerciale sceglie col radio. Confronta: prima durata mostrata.
      setDurataScelta(null);
    }

    const defaults = mappaAnticipiDefault(
      baseIvato,
      convenzioni,
      config,
      assorbiMaggiorazione,
    );
    const anticipoRipristino = anticipoGeneraleSalvato ?? anticipoSceltaSalvato;
    if (anticipoRipristino != null) {
      for (const c of convenzioni) {
        if (!c.attivo) continue;
        defaults[c.id] = anticipoRipristino;
      }
      setAnticipoDefaultRaw(String(anticipoRipristino));
    } else {
      setAnticipoDefaultRaw("0");
    }

    setAnticipiRaw(toRawMap(defaults));
    setDefaultsApplicati(true);
  }, [
    anticipoGeneraleSalvato,
    anticipoSceltaSalvato,
    avevaDurataScelta,
    avevaFamigliaSalvata,
    baseIvato,
    config,
    convenzioni,
    defaultsApplicati,
    durateSalvateDalDb,
    famiglia,
    assorbiMaggiorazione,
  ]);

  const anticipiPerId = useMemo(() => {
    const out: Record<number, number> = {};
    for (const [id, raw] of Object.entries(anticipiRaw)) {
      out[Number(id)] = parseAnticipo(raw);
    }
    if (config) {
      for (const c of convenzioni) {
        if (!c.attivo) continue;
        if (out[c.id] === undefined) {
          out[c.id] = anticipoDefaultPerConvenzione(
            baseIvato,
            c,
            config,
            assorbiMaggiorazione,
          );
        }
      }
    }
    return out;
  }, [anticipiRaw, assorbiMaggiorazione, baseIvato, config, convenzioni]);

  const simulazioni = useMemo(() => {
    if (!config) return [] as SimulazioneConvenzione[];
    return simulaTutteLeConvenzioni({
      baseIvato,
      anticipiPerId,
      convenzioni,
      config,
      famigliaAlternativa: famiglia,
      assorbiMaggiorazione,
    });
  }, [
    anticipiPerId,
    assorbiMaggiorazione,
    baseIvato,
    config,
    convenzioni,
    famiglia,
  ]);

  /** In Confronta il riferimento è la prima durata visibile (niente radio). */
  const durataRiferimento = useMemo(() => {
    if (soloScelta) return durataScelta;
    if (durataScelta != null && durateMostrate.includes(durataScelta)) {
      return durataScelta;
    }
    return durateMostrate[0] ?? null;
  }, [durataScelta, durateMostrate, soloScelta]);

  const salvaFinanziamento = useCallback(async () => {
    setAutosaveStatus("saving");
    setError(null);
    const supabase = createSupabaseClient();

    const scelta = simulazioni.find(
      (s) => s.durataMesi === durataRiferimento && s.possibile,
    );

    let anticipoDaSalvare = scelta?.anticipo;
    if (anticipoDaSalvare == null) {
      if (anticipoDefaultRaw.trim() !== "") {
        anticipoDaSalvare = parseAnticipo(anticipoDefaultRaw);
      } else if (anticipoGeneraleSalvato != null) {
        anticipoDaSalvare = anticipoGeneraleSalvato;
      } else {
        anticipoDaSalvare = 0;
      }
    }

    const durateDaSalvare =
      soloScelta && (scelta?.durataMesi ?? durataRiferimento) != null
        ? [scelta?.durataMesi ?? durataRiferimento!]
        : durateMostrate;

    const payload: Record<string, unknown> = {
      finanziamento_attivo: attivo,
      finanziamento_anticipo: anticipoDaSalvare,
      finanziamento_durate_mostrate: serializzaDurateMostrate(durateDaSalvare),
      fin_famiglia: famiglia,
      fin_durata_scelta: scelta?.durataMesi ?? durataRiferimento,
      fin_pdf_solo_scelta: soloScelta,
      fin_assorbi_maggiorazione: assorbiMaggiorazione,
      fin_importo_fatturato: scelta?.importoFatturato ?? null,
      fin_importo_finanziato: scelta?.importoFinanziato ?? null,
      fin_rata: scelta?.rataMensile ?? null,
      fin_tan: scelta?.tan ?? null,
    };

    const { error: updateError } = await supabase
      .from("preventivi")
      .update(payload)
      .eq("id", preventivoId);

    if (updateError) {
      setError(updateError.message);
      setAutosaveStatus("error");
      return;
    }

    setAnticipoGeneraleSalvato(anticipoDaSalvare);
    setAutosaveStatus("saved");
    window.setTimeout(() => {
      setAutosaveStatus((prev) => (prev === "saved" ? "idle" : prev));
    }, 2000);
  }, [
    anticipoDefaultRaw,
    anticipoGeneraleSalvato,
    assorbiMaggiorazione,
    attivo,
    durataRiferimento,
    durateMostrate,
    famiglia,
    preventivoId,
    simulazioni,
    soloScelta,
  ]);

  // Autosave debounce dopo i default; al primo tick post-load non riscrivere
  // (evita di azzerare l'anticipo con uno snapshot ancora incompleto).
  useEffect(() => {
    if (loading || !defaultsApplicati || !config) return;

    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      hydratedRef.current = true;
      return;
    }

    if (!hydratedRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void salvaFinanziamento();
    }, 450);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [
    attivo,
    famiglia,
    durateMostrate,
    durataScelta,
    soloScelta,
    assorbiMaggiorazione,
    anticipiRaw,
    baseIvato,
    loading,
    defaultsApplicati,
    config,
    salvaFinanziamento,
  ]);

  function applicaAnticipoATutte(raw: string) {
    setAnticipoDefaultRaw(raw);
    const valueNum = parseAnticipo(raw);
    const value = String(valueNum);
    setAnticipiRaw((prev) => {
      const next = { ...prev };
      for (const c of convenzioni) {
        if (!c.attivo) continue;
        next[c.id] = value;
      }
      return next;
    });
    onAnticipoGeneraleChange?.(valueNum);
  }

  function setAnticipoOpzione(convenzioneId: number, raw: string) {
    setAnticipiRaw((prev) => ({ ...prev, [convenzioneId]: raw }));
  }

  function cambiaFamiglia(next: FamigliaAlternativa) {
    if (next === famiglia) return;
    setFamiglia(next);
    // Non resettare "mostra al cliente": le durate selezionate restano
    // (20 mesi sempre, e quelle dell'altra famiglia tornano quando ci si ripassa).
    let nextDurata = durataScelta;
    if (durataScelta != null) {
      const ancoraValida = convenzioni.some(
        (c) =>
          c.attivo &&
          c.durata_mesi === durataScelta &&
          (c.famiglia === "base" || c.famiglia === next),
      );
      if (!ancoraValida) {
        nextDurata =
          durateMostrate.find((mesi) =>
            convenzioni.some(
              (c) =>
                c.attivo &&
                c.durata_mesi === mesi &&
                (c.famiglia === "base" || c.famiglia === next),
            ),
          ) ?? null;
      }
    }
    setDurataScelta(nextDurata);
    if (soloScelta && nextDurata != null) {
      setDurateMostrate([nextDurata]);
    }
  }

  function toggleDurataMostrata(durata: number) {
    if (soloScelta) return;
    setDurateMostrate((prev) => {
      const next = prev.includes(durata)
        ? prev.filter((d) => d !== durata)
        : [...prev, durata].sort((a, b) => a - b);
      return next;
    });
    setDurataScelta((prev) => {
      if (prev === durata) {
        // Se nascondo l'opzione usata per i totali, passa alla prima ancora visibile.
        const altre = durateMostrate.filter((d) => d !== durata);
        return altre[0] ?? null;
      }
      // Mostrando un'opzione: usala come riferimento se non ce n'è già una.
      if (prev == null && !durateMostrate.includes(durata)) {
        return durata;
      }
      return prev;
    });
  }

  function scegliOpzione(durata: number) {
    setDurataScelta(durata);
    if (soloScelta) {
      setDurateMostrate([durata]);
    }
  }

  function cambiaModalitaPdf(nextSolo: boolean) {
    if (nextSolo === soloScelta) return;
    setSoloScelta(nextSolo);
    if (nextSolo) {
      if (durataScelta != null) {
        setDurateMostrate([durataScelta]);
      }
      return;
    }
    // Torna al confronto: ripristina le durate tipiche se ne restava una sola.
    if (config && (durateMostrate.length <= 1 || durataScelta != null)) {
      const defaults = defaultDurateMostrate(
        baseIvato,
        convenzioni,
        config.soglia_tasso_zero_gratis,
        famiglia,
      );
      if (durataScelta != null && !defaults.includes(durataScelta)) {
        setDurateMostrate([...defaults, durataScelta].sort((a, b) => a - b));
      } else {
        setDurateMostrate(defaults);
      }
    }
  }

  if (loading) {
    return (
      <section className="mb-8 rounded-md border border-brand-border bg-white p-4">
        <p className="text-sm text-brand-muted">
          Caricamento simulatore finanziamento...
        </p>
      </section>
    );
  }

  if (error && !config) {
    return (
      <section className="mb-8 rounded-md border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-brand-danger">{error}</p>
        <p className="mt-2 text-xs text-brand-muted">
          Verifica che le tabelle config_finanziamento / convenzioni_finanziamento
          e le colonne finanziamento_* / fin_* su preventivi siano accessibili.
        </p>
      </section>
    );
  }

  if (!config) return null;

  const haTassoZero = convenzioni.some(
    (c) => c.attivo && c.famiglia === "tasso_zero",
  );
  const haDoppioPiano = convenzioni.some(
    (c) => c.attivo && c.famiglia === "doppio_piano",
  );

  return (
    <section className="mb-8 rounded-md border border-brand-border bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-brand-navy">
            Simulatore finanziamento
          </h2>
          <p className="mt-1 text-xs text-brand-muted">
            Base IVATO:{" "}
            <span className="font-semibold tabular-nums text-brand-text">
              {formatEuro(baseIvato)}
            </span>
            {" · "}Soglia tasso zero senza maggiorazione:{" "}
            {formatEuro(config.soglia_tasso_zero_gratis)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-brand-text">
            <input
              type="checkbox"
              checked={attivo}
              onChange={(e) => setAttivo(e.target.checked)}
              className="h-4 w-4"
            />
            Includi finanziamento nel preventivo
          </label>
          <AutosaveStatusIndicator
            status={autosaveStatus}
            onRetry={() => {
              void salvaFinanziamento();
            }}
          />
        </div>
      </div>

      {attivo && (
        <div className="mb-4 rounded-md border border-brand-border bg-brand-surface/40 px-3 py-3">
          <p className="mb-2 text-xs font-medium text-brand-muted">
            Cosa vede il cliente nel PDF
          </p>
          <div className="inline-flex flex-wrap rounded-md border border-brand-border bg-white p-1">
            <button
              type="button"
              onClick={() => cambiaModalitaPdf(false)}
              className={`min-h-[40px] rounded px-3 text-sm font-medium ${
                !soloScelta
                  ? "bg-brand-navy text-white shadow-sm"
                  : "text-brand-muted hover:text-brand-text"
              }`}
            >
              Confronta opzioni
            </button>
            <button
              type="button"
              onClick={() => cambiaModalitaPdf(true)}
              className={`min-h-[40px] rounded px-3 text-sm font-medium ${
                soloScelta
                  ? "bg-brand-navy text-white shadow-sm"
                  : "text-brand-muted hover:text-brand-text"
              }`}
            >
              Solo opzione scelta
            </button>
          </div>
          <p className="mt-2 text-xs text-brand-muted">
            {soloScelta
              ? "Nel PDF compare solo la rata selezionata col radio — utile se proponi un finanziamento già incluso nel prezzo."
              : "Scegli quali durate confrontare con «Mostra al cliente». Il cliente segna sul PDF l’opzione preferita."}
          </p>
        </div>
      )}

      <div className="mb-4 max-w-xs">
        <Input
          label="Anticipo di default (€, IVA inclusa)"
          type="number"
          min={0}
          step={0.01}
          inputMode="decimal"
          value={anticipoDefaultRaw}
          onChange={(e) => applicaAnticipoATutte(e.target.value)}
          hint="Imposta lo stesso anticipo su tutte le opzioni; poi puoi ritoccare ogni durata."
        />
      </div>

      {(haTassoZero || haDoppioPiano) && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-brand-muted">
            Famiglia rate (il 20 mesi resta sempre visibile)
          </p>
          <div className="inline-flex flex-wrap rounded-md border border-brand-border bg-brand-surface/50 p-1">
            {haTassoZero && (
              <button
                type="button"
                onClick={() => cambiaFamiglia("tasso_zero")}
                className={`min-h-[40px] rounded px-3 text-sm font-medium ${
                  famiglia === "tasso_zero"
                    ? "bg-white text-brand-navy shadow-sm"
                    : "text-brand-muted hover:text-brand-text"
                }`}
              >
                36-60 Agevolato
              </button>
            )}
            {haDoppioPiano && (
              <button
                type="button"
                onClick={() => cambiaFamiglia("doppio_piano")}
                className={`min-h-[40px] rounded px-3 text-sm font-medium ${
                  famiglia === "doppio_piano"
                    ? "bg-white text-brand-navy shadow-sm"
                    : "text-brand-muted hover:text-brand-text"
                }`}
              >
                60-120 Doppio piano
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-brand-danger">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {simulazioni.map((sim) => {
          const mostrata = durateMostrate.includes(sim.durataMesi);
          const titolo = titoloConvenzione(sim.convenzione);
          const anticipoCampo =
            anticipiRaw[sim.convenzione.id] ??
            String(anticipiPerId[sim.convenzione.id] ?? 0);

          return (
            <div
              key={sim.convenzione.id}
              className={`rounded-md border p-4 ${
                soloScelta && durataScelta === sim.durataMesi
                  ? "border-brand-navy bg-brand-navy/5 ring-1 ring-brand-navy/20"
                  : mostrata
                    ? "border-brand-accent bg-brand-accent/5"
                    : "border-brand-border bg-brand-surface/40"
              } ${!sim.possibile ? "opacity-75" : ""}`}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-h-[36px] items-center gap-2">
                  {soloScelta ? (
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name={`fin-opzione-${preventivoId}`}
                        checked={durataScelta === sim.durataMesi}
                        disabled={!sim.possibile}
                        onChange={() => scegliOpzione(sim.durataMesi)}
                        className="h-4 w-4 accent-brand-accent"
                      />
                      <p className="text-sm font-semibold text-brand-navy">
                        {titolo}
                      </p>
                    </label>
                  ) : (
                    <p className="text-sm font-semibold text-brand-navy">
                      {titolo}
                    </p>
                  )}
                  {soloScelta && durataScelta === sim.durataMesi && (
                    <span className="rounded bg-brand-navy/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-navy">
                      Nel PDF
                    </span>
                  )}
                </div>
                {!soloScelta && (
                  <button
                    type="button"
                    disabled={!sim.possibile && !mostrata}
                    onClick={() => toggleDurataMostrata(sim.durataMesi)}
                    className={`min-h-[36px] rounded-md border px-3 text-xs font-semibold disabled:opacity-40 ${
                      mostrata
                        ? "border-brand-accent bg-brand-accent text-white"
                        : "border-brand-border bg-white text-brand-text hover:bg-brand-surface"
                    }`}
                  >
                    {mostrata ? "Visibile al cliente" : "Mostra al cliente"}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <div className="col-span-2 rounded-md border-2 border-brand-navy bg-white px-3 py-2 sm:col-span-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-navy">
                    Importo contratto
                  </p>
                  <p className="text-lg font-bold tabular-nums text-brand-navy">
                    {formatEuro(sim.importoFatturato)}
                  </p>
                  <p className="text-[10px] text-brand-muted">
                    {sim.maggiorazioneApplicata
                      ? `+${config.maggiorazione_perc}% maggiorazione`
                      : assorbiMaggiorazione && !sim.doppioPiano
                        ? "senza maggiorazione · assorbita"
                        : "senza maggiorazione"}
                    {" · "}fatturato BDS
                  </p>
                  {!sim.doppioPiano && (
                    <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-brand-text">
                      <input
                        type="checkbox"
                        checked={assorbiMaggiorazione}
                        onChange={(e) =>
                          setAssorbiMaggiorazione(e.target.checked)
                        }
                        className="h-3.5 w-3.5"
                      />
                      <span>
                        Assorbi +{config.maggiorazione_perc}%
                        <span className="text-brand-muted">
                          {" "}
                          (a carico BDS)
                        </span>
                      </span>
                    </label>
                  )}
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
                      setAnticipoOpzione(sim.convenzione.id, e.target.value)
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
                      Rata comprensiva di {formatEuro(sim.istruttoria)} di spese
                      istruttoria, non fatturate da Bruno Drago
                    </p>
                  )}
                </div>
              </div>

              {sim.doppioPiano && (
                <div className="mt-3 rounded-md border border-dashed border-brand-border bg-white/70 px-3 py-2 text-xs text-brand-muted">
                  <p className="font-medium text-brand-text">
                    Dettaglio doppio piano (interno)
                  </p>
                  <p className="mt-1 tabular-nums">
                    Capitale rata {formatEuro(sim.capitaleRata)} (di cui
                    istruttoria {formatEuro(sim.istruttoria)}) → metà{" "}
                    {formatEuro(sim.doppioPiano.capitaleMeta)}: rata{" "}
                    {formatEuro(sim.doppioPiano.rataPrimaMeta)} (TAN{" "}
                    {formatTan(sim.doppioPiano.tanPrimaMeta)}) + rata{" "}
                    {formatEuro(sim.doppioPiano.rataSecondaMeta)} (TAN{" "}
                    {formatTan(sim.doppioPiano.tanSecondaMeta)})
                  </p>
                </div>
              )}

              {sim.messaggio && (
                <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {sim.messaggio}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-brand-muted">
        {soloScelta
          ? "Seleziona un’unica opzione col radio: è quella che finisce nel PDF. L’anticipo riduce solo il capitale/rata, non l’importo contrattuale. Le modifiche si salvano da sole."
          : "«Mostra al cliente» decide quali durate compaiono nel PDF. L’anticipo riduce solo il capitale/rata, non l’importo contrattuale. Le modifiche si salvano da sole."}
      </p>
      {attivo && soloScelta && durataScelta == null && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Seleziona un&apos;opzione di pagamento per continuare (PDF /
          salvataggio completo).
        </p>
      )}
      {attivo && !soloScelta && durateMostrate.length === 0 && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Mostra almeno una durata al cliente per il PDF.
        </p>
      )}
    </section>
  );
}
