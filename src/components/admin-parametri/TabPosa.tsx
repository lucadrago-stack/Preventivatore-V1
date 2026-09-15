"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import {
  CHIAVE_DESCRIZIONE_POSA,
  DESCRIZIONE_POSA_DEFAULT_FALLBACK,
} from "@/lib/riga-posa";
import { createSupabaseClient } from "@/lib/supabase";

type Props = {
  initialDescrizione: string;
  tableMissing?: boolean;
};

export default function TabPosa({
  initialDescrizione,
  tableMissing = false,
}: Props) {
  const [descrizione, setDescrizione] = useState(initialDescrizione);
  const [saved, setSaved] = useState(initialDescrizione);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (tableMissing) {
    return (
      <Card>
        <p className="text-sm text-brand-danger">
          Tabella <code>config_sistema</code> non trovata. Esegui lo script{" "}
          <code>src/scripts/add-riga-posa.sql</code> su Supabase, poi ricarica
          questa pagina.
        </p>
      </Card>
    );
  }

  const dirty = descrizione !== saved;

  async function salva() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const valore = descrizione.trim()
        ? descrizione.replace(/\r\n/g, "\n").trimEnd()
        : DESCRIZIONE_POSA_DEFAULT_FALLBACK;

      const supabase = createSupabaseClient();
      const { error: upsertError } = await supabase.from("config_sistema").upsert(
        {
          chiave: CHIAVE_DESCRIZIONE_POSA,
          valore,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "chiave" },
      );
      if (upsertError) throw new Error(upsertError.message);

      setDescrizione(valore);
      setSaved(valore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-brand-navy">
          Descrizione posa in opera
        </h3>
        <p className="mt-1 text-sm text-brand-muted">
          Testo usato sulle nuove righe posa separate. Non aggiorna le posa già
          presenti nei preventivi.
        </p>
      </div>

      <Card className="max-w-2xl space-y-4">
        <Input
          as="textarea"
          label="Descrizione commerciale"
          rows={6}
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
          hint="Una riga per paragrafo. Vuoto = ripristina il testo di sistema."
        />

        {error && (
          <p className="text-sm text-brand-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!dirty || saving}
            onClick={() => {
              setDescrizione(saved);
              setError(null);
            }}
          >
            Annulla
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!dirty || saving}
            onClick={() => void salva()}
          >
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
