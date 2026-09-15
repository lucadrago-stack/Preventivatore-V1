"use client";

import { useState } from "react";
import AutosaveStatusIndicator from "@/components/AutosaveStatusIndicator";
import { Button, Card, Input } from "@/components/ui";
import {
  autosaveInputHandlers,
  useAutosaveController,
} from "@/hooks/useAutosave";
import { createSupabaseClient } from "@/lib/supabase";
import {
  mapConvenzioneRow,
  titoloConvenzione,
} from "@/lib/finanziamento";

export type ConfigFinanziamentoRow = {
  chiave: string;
  valore: number;
  descrizione: string | null;
};

export type ConvenzioneRow = {
  id: number;
  durata_mesi: number;
  tan: number;
  tipo: string;
  regola_maggiorazione: string;
  famiglia: string | null;
  doppio_piano: boolean;
  attivo: boolean;
  ordine: number;
  tan_prima_meta: number | null;
};

type Props = {
  initialConfig: ConfigFinanziamentoRow[];
  initialConvenzioni: ConvenzioneRow[];
};

export default function TabFinanziamento({
  initialConfig,
  initialConvenzioni,
}: Props) {
  const [config, setConfig] = useState(initialConfig);
  const [convenzioni, setConvenzioni] = useState(initialConvenzioni);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const autosave = useAutosaveController();

  async function salvaConfig(chiave: string, valoreRaw: string) {
    const valore = Number(valoreRaw);
    if (!Number.isFinite(valore)) {
      throw new Error(`Valore non valido per ${chiave}`);
    }
    const supabase = createSupabaseClient();
    const { error: updateError } = await supabase
      .from("config_finanziamento")
      .update({ valore })
      .eq("chiave", chiave);
    if (updateError) throw new Error(updateError.message);
    setConfig((prev) =>
      prev.map((row) => (row.chiave === chiave ? { ...row, valore } : row)),
    );
  }

  function triggerConfig(chiave: string, valoreRaw: string) {
    void autosave.run(async () => {
      setError(null);
      try {
        await salvaConfig(chiave, valoreRaw);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore");
        throw err;
      }
    });
  }

  async function patchConvenzione(
    id: number,
    patch: Partial<ConvenzioneRow>,
  ) {
    const supabase = createSupabaseClient();
    const { data, error: updateError } = await supabase
      .from("convenzioni_finanziamento")
      .update(patch)
      .eq("id", id)
      .select(
        "id, durata_mesi, tan, tipo, regola_maggiorazione, famiglia, doppio_piano, attivo, ordine, tan_prima_meta",
      )
      .single();
    if (updateError || !data) {
      throw new Error(updateError?.message ?? "Aggiornamento fallito");
    }
    setConvenzioni((prev) =>
      prev.map((c) => (c.id === id ? (data as ConvenzioneRow) : c)),
    );
  }

  function triggerConv(id: number, patch: Partial<ConvenzioneRow>) {
    void autosave.run(async () => {
      setError(null);
      try {
        await patchConvenzione(id, patch);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore");
        throw err;
      }
    });
  }

  async function aggiungiConvenzione() {
    setAdding(true);
    setError(null);
    try {
      const ordine =
        convenzioni.reduce((max, c) => Math.max(max, c.ordine ?? 0), 0) + 1;
      const supabase = createSupabaseClient();
      const { data, error: insertError } = await supabase
        .from("convenzioni_finanziamento")
        .insert({
          durata_mesi: 12,
          tan: 0,
          tipo: "rate_lunghe",
          regola_maggiorazione: "sempre",
          famiglia: "base",
          doppio_piano: false,
          attivo: true,
          ordine,
        })
        .select(
          "id, durata_mesi, tan, tipo, regola_maggiorazione, famiglia, doppio_piano, attivo, ordine, tan_prima_meta",
        )
        .single();
      if (insertError || !data) {
        throw new Error(insertError?.message ?? "Creazione fallita");
      }
      setConvenzioni((prev) => [...prev, data as ConvenzioneRow]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-brand-navy">
          Configurazione generale
        </h3>
        <AutosaveStatusIndicator
          status={autosave.status}
          onRetry={autosave.retry}
        />
      </div>

      <Card className="space-y-3">
        {config.map((row) => (
          <ConfigRow
            key={row.chiave}
            row={row}
            onSave={(val) => triggerConfig(row.chiave, val)}
          />
        ))}
        {config.length === 0 && (
          <p className="text-sm text-brand-muted">
            Nessuna riga in config_finanziamento.
          </p>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-brand-navy">Convenzioni</h3>
        <Button
          type="button"
          variant="primary"
          onClick={() => void aggiungiConvenzione()}
          disabled={adding}
        >
          {adding ? "Creazione..." : "Aggiungi convenzione"}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-brand-danger" role="alert">
          {error}
        </p>
      )}

      <Card compact className="overflow-x-auto p-0 sm:p-0">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-brand-border bg-brand-surface text-xs uppercase tracking-wide text-brand-muted">
            <tr>
              <th className="px-2 py-3 font-medium">Titolo</th>
              <th className="px-2 py-3 font-medium">Durata</th>
              <th className="px-2 py-3 font-medium normal-case">
                <span className="block uppercase tracking-wide">
                  TAN prima metà
                </span>
                <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-brand-muted">
                  solo doppio piano
                </span>
              </th>
              <th className="px-2 py-3 font-medium normal-case">
                <span className="block uppercase tracking-wide">TAN</span>
                <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-brand-muted">
                  quota agevolata / 2ª metà se doppio piano
                </span>
              </th>
              <th className="px-2 py-3 font-medium">Tipo</th>
              <th className="px-2 py-3 font-medium">Famiglia</th>
              <th className="px-2 py-3 font-medium">Doppio piano</th>
              <th className="px-2 py-3 font-medium">Attivo</th>
              <th className="px-2 py-3 font-medium">Ordine</th>
            </tr>
          </thead>
          <tbody>
            {convenzioni
              .slice()
              .sort((a, b) => a.ordine - b.ordine || a.id - b.id)
              .map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-brand-border/70 last:border-0"
                >
                  <td className="px-2 py-2 text-brand-muted whitespace-nowrap">
                    {titoloConvenzione(
                      mapConvenzioneRow(
                        c as unknown as Record<string, unknown>,
                      ),
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      className="w-16 rounded border border-brand-input-border px-2 py-1"
                      defaultValue={c.durata_mesi}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== c.durata_mesi) {
                          triggerConv(c.id, { durata_mesi: v });
                        }
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.01"
                      title={
                        c.doppio_piano
                          ? "TAN applicato alla prima metà del capitale"
                          : "Rilevante solo con doppio piano"
                      }
                      className="w-20 rounded border border-brand-input-border px-2 py-1 disabled:bg-brand-surface disabled:text-brand-muted"
                      defaultValue={c.tan_prima_meta ?? ""}
                      disabled={!c.doppio_piano}
                      onBlur={(e) => {
                        if (!c.doppio_piano) return;
                        const raw = e.target.value.trim();
                        const v = raw === "" ? null : Number(raw);
                        if (raw !== "" && !Number.isFinite(v)) return;
                        if (v !== c.tan_prima_meta) {
                          triggerConv(c.id, { tan_prima_meta: v });
                        }
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.01"
                      title={
                        c.doppio_piano
                          ? "TAN della seconda metà / quota agevolata"
                          : "TAN della convenzione"
                      }
                      className="w-20 rounded border border-brand-input-border px-2 py-1"
                      defaultValue={c.tan}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== c.tan) {
                          triggerConv(c.id, { tan: v });
                        }
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="rounded border border-brand-input-border px-2 py-1"
                      value={c.tipo}
                      onChange={(e) =>
                        triggerConv(c.id, { tipo: e.target.value })
                      }
                    >
                      <option value="tasso_zero">tasso_zero</option>
                      <option value="rate_lunghe">rate_lunghe</option>
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="rounded border border-brand-input-border px-2 py-1"
                      value={c.famiglia ?? "base"}
                      onChange={(e) =>
                        triggerConv(c.id, { famiglia: e.target.value })
                      }
                    >
                      <option value="base">base</option>
                      <option value="tasso_zero">tasso_zero</option>
                      <option value="doppio_piano">doppio_piano</option>
                    </select>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={c.doppio_piano}
                      onChange={(e) =>
                        triggerConv(c.id, { doppio_piano: e.target.checked })
                      }
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={c.attivo}
                      onChange={(e) =>
                        triggerConv(c.id, { attivo: e.target.checked })
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      className="w-14 rounded border border-brand-input-border px-2 py-1"
                      defaultValue={c.ordine}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== c.ordine) {
                          triggerConv(c.id, { ordine: v });
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ConfigRow({
  row,
  onSave,
}: {
  row: ConfigFinanziamentoRow;
  onSave: (valore: string) => void;
}) {
  const [valore, setValore] = useState(String(row.valore));
  const field = autosaveInputHandlers(() => onSave(valore));

  return (
    <div className="grid gap-2 border-b border-brand-border/60 pb-3 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_8rem]">
      <div>
        <p className="text-sm font-medium text-brand-text">{row.chiave}</p>
        {row.descrizione && (
          <p className="text-xs text-brand-muted">{row.descrizione}</p>
        )}
      </div>
      <Input
        label="Valore"
        type="number"
        step="any"
        value={valore}
        onChange={(e) => setValore(e.target.value)}
        {...field}
      />
    </div>
  );
}
