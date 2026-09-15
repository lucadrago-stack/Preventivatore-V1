"use client";

import { useState } from "react";
import AutosaveStatusIndicator from "@/components/AutosaveStatusIndicator";
import { Button, Card } from "@/components/ui";
import { useAutosaveController } from "@/hooks/useAutosave";
import { createSupabaseClient } from "@/lib/supabase";

export type ServizioDefault = {
  id: number;
  descrizione: string;
  nota: string;
  importo: number;
  ordine: number;
};

type Props = {
  initialServizi: ServizioDefault[];
  tableMissing?: boolean;
};

export default function TabServizi({
  initialServizi,
  tableMissing = false,
}: Props) {
  const [servizi, setServizi] = useState(initialServizi);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const autosave = useAutosaveController();

  if (tableMissing) {
    return (
      <Card>
        <p className="text-sm text-brand-danger">
          Tabella <code>servizi_complementari_default</code> non trovata.
          Esegui lo script{" "}
          <code>src/scripts/add-servizi-complementari-default.sql</code> su
          Supabase, poi ricarica questa pagina.
        </p>
      </Card>
    );
  }

  async function patch(id: number, body: Partial<ServizioDefault>) {
    const supabase = createSupabaseClient();
    const { data, error: updateError } = await supabase
      .from("servizi_complementari_default")
      .update(body)
      .eq("id", id)
      .select("id, descrizione, nota, importo, ordine")
      .single();
    if (updateError || !data) {
      throw new Error(updateError?.message ?? "Salvataggio fallito");
    }
    setServizi((prev) =>
      prev.map((s) => (s.id === id ? (data as ServizioDefault) : s)),
    );
  }

  function trigger(id: number, body: Partial<ServizioDefault>) {
    void autosave.run(async () => {
      setError(null);
      try {
        await patch(id, body);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore");
        throw err;
      }
    });
  }

  async function aggiungi() {
    setAdding(true);
    setError(null);
    try {
      const ordine =
        servizi.reduce((max, s) => Math.max(max, s.ordine ?? 0), 0) + 1;
      const supabase = createSupabaseClient();
      const { data, error: insertError } = await supabase
        .from("servizi_complementari_default")
        .insert({
          descrizione: "Nuovo servizio",
          nota: "Non previsto",
          importo: 0,
          ordine,
        })
        .select("id, descrizione, nota, importo, ordine")
        .single();
      if (insertError || !data) {
        throw new Error(insertError?.message ?? "Creazione fallita");
      }
      setServizi((prev) => [...prev, data as ServizioDefault]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setAdding(false);
    }
  }

  async function elimina(id: number) {
    setError(null);
    try {
      const supabase = createSupabaseClient();
      const { error: deleteError } = await supabase
        .from("servizi_complementari_default")
        .delete()
        .eq("id", id);
      if (deleteError) throw new Error(deleteError.message);
      setServizi((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-brand-navy">
            Servizi complementari standard
          </h3>
          <p className="text-sm text-brand-muted">
            Default usati alla creazione di un nuovo preventivo (tabella{" "}
            <code>servizi_complementari_default</code>).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AutosaveStatusIndicator
            status={autosave.status}
            onRetry={autosave.retry}
          />
          <Button
            type="button"
            variant="primary"
            disabled={adding}
            onClick={() => void aggiungi()}
          >
            {adding ? "..." : "Aggiungi servizio"}
          </Button>
        </div>
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
              <th className="px-3 py-3 font-medium">Nome servizio</th>
              <th className="px-3 py-3 font-medium">Nota default</th>
              <th className="px-3 py-3 font-medium">Importo default</th>
              <th className="px-3 py-3 font-medium">Ordine</th>
              <th className="px-3 py-3 font-medium">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {servizi
              .slice()
              .sort((a, b) => a.ordine - b.ordine || a.id - b.id)
              .map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-brand-border/70 last:border-0"
                >
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      className="w-full min-w-[12rem] rounded border border-brand-input-border px-2 py-1"
                      defaultValue={s.descrizione}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== s.descrizione) {
                          trigger(s.id, { descrizione: v });
                        }
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      className="w-full min-w-[8rem] rounded border border-brand-input-border px-2 py-1"
                      defaultValue={s.nota}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== s.nota) {
                          trigger(s.id, { nota: v });
                        }
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      className="w-24 rounded border border-brand-input-border px-2 py-1"
                      defaultValue={s.importo}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== s.importo) {
                          trigger(s.id, { importo: v });
                        }
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      className="w-16 rounded border border-brand-input-border px-2 py-1"
                      defaultValue={s.ordine}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== s.ordine) {
                          trigger(s.id, { ordine: v });
                        }
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="danger"
                      className="min-h-[32px] px-2 py-1 text-xs"
                      onClick={() => void elimina(s.id)}
                    >
                      Elimina
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
