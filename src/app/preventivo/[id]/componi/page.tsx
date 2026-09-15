"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PreventivoPdfDocument from "@/components/PreventivoPdfDocument";
import DescrizioneCommercialeEditor from "@/components/DescrizioneCommercialeEditor";
import VersioniPreventivoSection from "@/components/VersioniPreventivoSection";
import SimulatoreFinanziamento from "@/components/SimulatoreFinanziamento";
import AutosaveStatusIndicator from "@/components/AutosaveStatusIndicator";
import { Button } from "@/components/ui";
import {
  bytesToPdfBlob,
  estraiSchedheTecnicheUniche,
  generaPdfCompletoBytes,
  type ParametriPdfCompleto,
  scaricaPdf,
} from "@/lib/genera-preventivo-pdf";
import { caricaAllegatiBytesPerPdf } from "@/lib/allegati-preventivo";
import {
  espandiRighePdfCartaceo,
  importoVisualizzatoRiga,
  totaleImportoRigheVisibili,
} from "@/lib/posa-categorie";
import { raggruppaRigheComponi } from "@/lib/raggruppa-righe-componi";
import { ensureRigaPosaSeparata } from "@/lib/riga-posa";
import {
  composiNotaConCaratteristiche,
  isPosaCertificataInclusaSuRiga,
  righeAutomaticheNota,
} from "@/lib/caratteristiche-riga";
import {
  CONDIZIONI_PAGAMENTO_DEFAULT,
  CONDIZIONI_PAGAMENTO_OPZIONI,
  generaTestoCondizioniPagamento,
  normalizzaTipoCondizioniPagamento,
  type CondizioniPagamentoTipo,
} from "@/lib/condizioni-pagamento";
import {
  autosaveInputHandlers,
  useAutosaveController,
  useFlushBeforeNavigate,
} from "@/hooks/useAutosave";
import { createSupabaseClient } from "@/lib/supabase";
import { formatEuro, formatDataPerInput, normalizzaRelazione, titoloPreventivo } from "@/lib/format";
import {
  defaultDurateMostrate,
  mapConvenzioneRow,
  parseConfigFinanziamento,
} from "@/lib/finanziamento";
import {
  parseFinanziamentoDaPreventivo,
  type DatiFinanziamentoPdfInput,
} from "@/lib/banner-finanziamento-pdf";
import {
  caricaVersioniPreventivo,
  salvaVersionePreventivo,
  type VersionePreventivo,
} from "@/lib/versioni-preventivo";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcolaTotaliPreventivo,
  IVA_ALIQUOTE,
  isIvaAliquota,
  parsePercentuale,
  ricalcolaSconto1DaNetto,
  round2,
  type IvaAliquota,
} from "@/lib/totali-preventivo";
import {
  normalizeDescrizioneToHtml,
  sanitizeDescrizioneHtml,
} from "@/lib/descrizione-formattata";
import { prossimoNumeroPosizione } from "@/lib/righe-posizione";

type Sede = {
  id: number;
  nome: string;
  indirizzo: string | null;
  cap: string | null;
  telefono: string | null;
  email: string | null;
  orari: string | null;
};

type CommercialeConSede = {
  id: number;
  nome: string;
  telefono: string | null;
  email: string | null;
  riferimento_aziendale: string | null;
  sede_id: number | null;
  sedi: Sede | Sede[] | null;
};

type PreventivoComponi = {
  id: number;
  riferimento: string;
  cliente_nome: string | null;
  cliente_cantiere: string | null;
  cliente_telefono: string | null;
  cliente_email: string | null;
  numero_preventivo: string | null;
  data_preventivo: string | null;
  validita_giorni: number | null;
  revisione: number | null;
  commerciale_id: number | null;
  sconto_percentuale: number | null;
  sconto_percentuale_2: number | null;
  iva_percentuale: number | null;
  prezzo_netto_target: number | null;
  note_preventivo: string | null;
  condizioni_pagamento_tipo: string | null;
  condizioni_pagamento_acconto: number | null;
  condizioni_pagamento_testo: string | null;
  commerciali: CommercialeConSede | CommercialeConSede[] | null;
};

type RigaDb = {
  id: number;
  quantita: number;
  prezzo_riga: number | null;
  posa_importo: number | null;
  posa: boolean | null;
  posa_riga_separata: boolean | null;
  descrizione_cliente: string | null;
  descrizione_libera: string | null;
  descrizione_tecnica: string | null;
  nota: string | null;
  colore: string | null;
  colore_interno: string | null;
  colore_esterno: string | null;
  colore_ferramenta: string | null;
  vetro: string | null;
  prodotto_id: number | null;
  ordine: number | null;
  visibile_pdf: boolean | null;
  tipo_riga: string | null;
  testo_libero: string | null;
  prodotti:
    | {
        nome: string;
        descrizione_cliente: string | null;
        descrizione_tecnica: string | null;
        scheda_tecnica_path: string | null;
        tipo_prezzo: string | null;
        prezzo_unitario: number | null;
        ha_vetro: boolean | null;
        categorie: { nome: string } | { nome: string }[] | null;
      }
    | {
        nome: string;
        descrizione_cliente: string | null;
        descrizione_tecnica: string | null;
        scheda_tecnica_path: string | null;
        tipo_prezzo: string | null;
        prezzo_unitario: number | null;
        ha_vetro: boolean | null;
        categorie: { nome: string } | { nome: string }[] | null;
      }[]
    | null;
};

type RigaEditabile = {
  key: string;
  prodotto_id: number | null;
  righeIds: number[];
  quantita: number;
  prezzo_riga: number | null;
  posa_importo: number | null;
  posa_inclusa: boolean;
  posa_riga_separata: boolean;
  is_posa_avanzata: boolean;
  is_libera: boolean;
  /** Descrizione commerciale (PDF cliente). */
  descrizione: string;
  /** Descrizione tecnica (solo lavoro interno). */
  descrizione_tecnica: string;
  nota: string;
  colore: string;
  colore_interno: string;
  colore_esterno: string;
  colore_ferramenta: string;
  vetro: string;
  tipologia_apertura: string;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  extra_colore_nome: string;
  extra_colore_percentuale: number | null;
  nota_griglia: string;
  tipo_riga: "prodotto" | "testo" | "posa";
  testo_libero: string;
  visibile_pdf: boolean;
  ordine: number;
  scheda_tecnica_path: string | null;
  nome_prodotto: string | null;
};

type ServizioComplementare = {
  id: number;
  descrizione: string;
  nota: string;
  importo: number;
  ordine: number;
};

/** Template catalogo (admin → Parametri → Servizi). */
type ServizioCatalogo = {
  descrizione: string;
  nota: string;
  importo: number;
  ordine: number;
};

const SERVIZI_DEFAULT: ServizioCatalogo[] = [
  {
    descrizione: "Pratica ENEA per detrazione fiscale",
    nota: "Non previsto",
    importo: 0,
    ordine: 1,
  },
  {
    descrizione: "Pratica Finanziamento",
    nota: "Non previsto",
    importo: 0,
    ordine: 2,
  },
  {
    descrizione: "Trasporto e allestimento cantiere",
    nota: "PREVISTO",
    importo: 100,
    ordine: 3,
  },
  {
    descrizione: "Tiro al piano dei serramenti",
    nota: "SE PREVISTO",
    importo: 0,
    ordine: 4,
  },
];

function normalizzaDescrizioneServizio(valore: string): string {
  return valore.trim().toLowerCase();
}

async function caricaServiziCatalogo(
  supabase: SupabaseClient,
): Promise<ServizioCatalogo[]> {
  const { data, error } = await supabase
    .from("servizi_complementari_default")
    .select("descrizione, nota, importo, ordine")
    .order("ordine");

  if (error || !data || data.length === 0) {
    return SERVIZI_DEFAULT.map((s) => ({ ...s }));
  }

  return data.map((s, index) => ({
    descrizione: s.descrizione ?? "Servizio",
    nota: s.nota ?? "",
    importo: Number(s.importo ?? 0),
    ordine: Number(s.ordine ?? index + 1),
  }));
}

const serviziInsertLocks = new Map<string, Promise<ServizioDb[]>>();

type ServizioDb = {
  id: number;
  descrizione: string | null;
  nota: string | null;
  importo: number | null;
  ordine: number | null;
};

function chiaveServizio(servizio: ServizioDb): string {
  const descrizione = (servizio.descrizione ?? "").trim().toLowerCase();
  const nota = (servizio.nota ?? "").trim().toLowerCase();
  const importo = servizio.importo ?? 0;
  return `${descrizione}|${nota}|${importo}`;
}

async function caricaServiziComplementari(
  supabase: SupabaseClient,
  preventivoId: string,
): Promise<ServizioDb[]> {
  const { data, error } = await supabase
    .from("servizi_complementari")
    .select("id, descrizione, nota, importo, ordine")
    .eq("preventivo_id", preventivoId)
    .order("ordine")
    .order("id");

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Rimuove duplicati (stessa descrizione+nota+importo), mantiene il record con id minore. */
async function pulisciServiziDuplicati(
  supabase: SupabaseClient,
  preventivoId: string,
): Promise<ServizioDb[]> {
  const servizi = await caricaServiziComplementari(supabase, preventivoId);
  if (servizi.length <= 1) return servizi;

  const idsDaTenere = new Set<number>();
  const idsDaEliminare: number[] = [];
  const chiaviViste = new Set<string>();

  for (const servizio of [...servizi].sort((a, b) => a.id - b.id)) {
    const chiave = chiaveServizio(servizio);
    if (chiaviViste.has(chiave)) {
      idsDaEliminare.push(servizio.id);
    } else {
      chiaviViste.add(chiave);
      idsDaTenere.add(servizio.id);
    }
  }

  if (idsDaEliminare.length === 0) return servizi;

  const { error: deleteError } = await supabase
    .from("servizi_complementari")
    .delete()
    .in("id", idsDaEliminare);

  if (deleteError) throw new Error(deleteError.message);

  return caricaServiziComplementari(supabase, preventivoId);
}

async function ensureServiziComplementari(
  supabase: SupabaseClient,
  preventivoId: string,
): Promise<ServizioDb[]> {
  // Registra il lock in modo sincrono (prima di qualsiasi await) per evitare race
  if (!serviziInsertLocks.has(preventivoId)) {
    const promessa = (async () => {
      const servizi = await pulisciServiziDuplicati(supabase, preventivoId);
      if (servizi.length > 0) return servizi;

      const ricontrollo = await caricaServiziComplementari(
        supabase,
        preventivoId,
      );
      if (ricontrollo.length > 0) return ricontrollo;

      // Preferisci template da DB; fallback a costanti codice.
      const defaults: ServizioCatalogo[] = await caricaServiziCatalogo(supabase);

      const { data: serviziInseriti, error: insertError } = await supabase
        .from("servizi_complementari")
        .insert(
          defaults.map((servizio) => ({
            preventivo_id: Number(preventivoId),
            descrizione: servizio.descrizione,
            nota: servizio.nota,
            importo: servizio.importo,
            ordine: servizio.ordine,
          })),
        )
        .select("id, descrizione, nota, importo, ordine");

      if (insertError) {
        const dopoErrore = await caricaServiziComplementari(
          supabase,
          preventivoId,
        );
        if (dopoErrore.length > 0) return dopoErrore;
        throw new Error(insertError.message);
      }

      return serviziInseriti ?? [];
    })().finally(() => {
      serviziInsertLocks.delete(preventivoId);
    });

    serviziInsertLocks.set(preventivoId, promessa);
  }

  return serviziInsertLocks.get(preventivoId)!;
}


function dataOggiPerInput(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Snapshot totali per dirty/beforeunload.
 * Esclude `prezzoNetto` display: viene ricalcolato da solo e altrimenti
 * lascia isDirty=true anche dopo autosave / al solo caricamento pagina.
 */
function serializzaSnapTotali(t: {
  scontoPercentuale: string;
  scontoPercentuale2: string;
  ivaPercentuale: number;
  nettoOverride: number | null;
}): string {
  return JSON.stringify({
    scontoPercentuale: t.scontoPercentuale,
    scontoPercentuale2: t.scontoPercentuale2,
    ivaPercentuale: t.ivaPercentuale,
    nettoOverride: t.nettoOverride,
  });
}

function revisioneDaVersioni(
  versioni: { numero_versione: number }[],
): string {
  if (versioni.length === 0) return "0";
  const max = Math.max(...versioni.map((v) => v.numero_versione));
  return String(Number.isFinite(max) ? max : 0);
}

function sanitizeNomeFileParte(valore: string, maxLen = 40): string {
  return valore
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, maxLen);
}

/** Es. Preventivo_2026-001_Mario_Rossi_05-09-2026.pdf */
function nomeFilePdf(opts: {
  clienteNome: string;
  numeroPreventivo: string;
  riferimento: string;
  data: string | null;
}) {
  const numero = sanitizeNomeFileParte(
    opts.numeroPreventivo || opts.riferimento,
    24,
  );
  const cliente = sanitizeNomeFileParte(opts.clienteNome, 32);
  const rawData = opts.data?.slice(0, 10);
  let dataStr = new Date().toISOString().slice(0, 10);
  if (rawData && /^\d{4}-\d{2}-\d{2}$/.test(rawData)) {
    const [y, m, d] = rawData.split("-");
    dataStr = `${d}-${m}-${y}`;
  } else if (rawData) {
    dataStr = sanitizeNomeFileParte(rawData, 12) || dataStr;
  }

  const parti = ["Preventivo", numero || null, cliente || null, dataStr].filter(
    (p): p is string => Boolean(p),
  );
  return `${parti.join("_")}.pdf`;
}


function raggruppaRighe(righeDb: RigaDb[]): RigaEditabile[] {
  return raggruppaRigheComponi(righeDb, {
    normalizeDescrizioneHtml: normalizeDescrizioneToHtml,
  }) as RigaEditabile[];
}

function DragHandle({
  rigaKey,
  onDragStart,
  onDragEnd,
}: {
  rigaKey: string;
  onDragStart: (key: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", rigaKey);
        onDragStart(rigaKey);
      }}
      onDragEnd={onDragEnd}
      className="pdf-drag-handle flex h-11 w-11 min-h-[44px] min-w-[44px] cursor-grab items-center justify-center rounded border border-zinc-300 bg-zinc-100 text-base font-bold text-zinc-600 hover:bg-zinc-200 active:cursor-grabbing select-none"
      aria-label="Trascina per riordinare"
      title="Trascina per riordinare"
    >
      ↕
    </button>
  );
}

function RigaRow({
  riga,
  importoDisplay,
  isDragging,
  isDropTarget,
  onAggiornaDescrizione,
  onAggiornaTesto,
  onAggiornaNota,
  onAggiornaQuantita,
  onAggiornaPrezzo,
  onToggleVisibile,
  onRichiediAutosave,
  onDuplica,
  duplicating,
  onElimina,
  deleting,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  riga: RigaEditabile;
  importoDisplay: number | null;
  isDragging: boolean;
  isDropTarget: boolean;
  onAggiornaDescrizione: (key: string, valore: string) => void;
  onAggiornaTesto: (key: string, valore: string) => void;
  onAggiornaNota: (key: string, valore: string) => void;
  onAggiornaQuantita: (key: string, valore: string) => void;
  onAggiornaPrezzo: (key: string, valore: string) => void;
  onToggleVisibile: (key: string) => void;
  onRichiediAutosave: () => void;
  onDuplica: (riga: RigaEditabile) => void;
  duplicating: boolean;
  onElimina: (riga: RigaEditabile) => void;
  deleting: boolean;
  onDragStart: (key: string) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLTableRowElement>, key: string) => void;
  onDrop: (event: React.DragEvent<HTMLTableRowElement>, key: string) => void;
}) {
  const nascosta = !riga.visibile_pdf;
  const noteAutomatiche = righeAutomaticheNota({
    colore: riga.colore,
    coloreInterno: riga.colore_interno,
    coloreEsterno: riga.colore_esterno,
    coloreFerramenta: riga.colore_ferramenta,
    vetro: riga.vetro,
    posaCertificataInclusa: isPosaCertificataInclusaSuRiga(riga),
  });
  const rowClass = [
    "border-b border-brand-border/70 even:bg-brand-surface/70",
    nascosta ? "opacity-50" : "",
    isDragging ? "bg-zinc-100" : "",
    isDropTarget ? "outline outline-2 outline-zinc-400" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (riga.tipo_riga === "testo") {
    return (
      <tr
        className={rowClass}
        onDragOver={(event) => onDragOver(event, riga.key)}
        onDrop={(event) => onDrop(event, riga.key)}
      >
        <td className="px-2 py-2 align-middle">
          <DragHandle
            rigaKey={riga.key}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        </td>
        <td className="px-3 py-2 align-middle" colSpan={3}>
          <input
            type="text"
            value={riga.testo_libero}
            onChange={(e) => onAggiornaTesto(riga.key, e.target.value)}
            onBlur={() => onRichiediAutosave()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLElement).blur();
              }
            }}
            placeholder="— Titolo sezione —"
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm font-semibold"
          />
          {nascosta && (
          <span className="mt-1 block text-xs text-zinc-500">nascosta</span>
          )}
        </td>
        <td className="px-3 py-2 align-middle text-center">
          <button
            type="button"
            onClick={() => onToggleVisibile(riga.key)}
            title={riga.visibile_pdf ? "Nascondi dal PDF" : "Mostra nel PDF"}
            className="min-h-[44px] min-w-[44px] rounded-md border border-zinc-300 px-2 text-xs font-semibold"
          >
            {riga.visibile_pdf ? "Visibile" : "Nascosta"}
          </button>
        </td>
        <td className="px-2 py-2 align-middle">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => onDuplica(riga)}
              disabled={duplicating || deleting}
              className="min-h-[44px] rounded-md border border-zinc-300 px-3 text-xs font-semibold disabled:opacity-50"
            >
              {duplicating ? "..." : "Duplica"}
            </button>
            <button
              type="button"
              onClick={() => onElimina(riga)}
              disabled={duplicating || deleting}
              className="min-h-[44px] rounded-md border border-red-200 px-3 text-xs font-semibold text-brand-danger disabled:opacity-50"
            >
              {deleting ? "..." : "Elimina"}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr
      className={rowClass}
      onDragOver={(event) => onDragOver(event, riga.key)}
      onDrop={(event) => onDrop(event, riga.key)}
    >
      <td className="px-2 py-2 align-top">
        <DragHandle
          rigaKey={riga.key}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      </td>
      <td className="w-14 px-2 py-2 align-top">
        {riga.is_libera ? (
          <input
            type="number"
            min={1}
            step={1}
            value={riga.quantita}
            onChange={(e) => onAggiornaQuantita(riga.key, e.target.value)}
            onBlur={() => onRichiediAutosave()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLElement).blur();
              }
            }}
            className="w-full rounded border border-zinc-300 px-1 py-1 text-sm"
          />
        ) : (
          riga.quantita
        )}
      </td>
      <td className="px-3 py-2 align-top">
        {riga.descrizione_tecnica.trim() && (
          <p className="mb-1 text-xs text-zinc-400">
            {riga.descrizione_tecnica}
          </p>
        )}
        <DescrizioneCommercialeEditor
          value={riga.descrizione}
          rigaKey={riga.key}
          onChange={(valore) => onAggiornaDescrizione(riga.key, valore)}
          onBlurSave={(valore) => {
            onAggiornaDescrizione(riga.key, valore);
            onRichiediAutosave();
          }}
        />
        {nascosta && (
          <span className="mt-1 block text-xs text-zinc-500">nascosta</span>
        )}
      </td>
      <td className="w-44 px-3 py-2 align-top">
        <textarea
          value={riga.nota}
          onChange={(e) => onAggiornaNota(riga.key, e.target.value)}
          onBlur={() => onRichiediAutosave()}
          rows={2}
          placeholder="Nota libera (opzionale)"
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
        />
        {noteAutomatiche.length > 0 && (
          <div className="mt-1.5 space-y-0.5 rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs leading-snug text-zinc-600">
            {noteAutomatiche.map((rigaAuto) => (
              <p key={rigaAuto}>{rigaAuto}</p>
            ))}
            <p className="pt-0.5 text-[10px] text-zinc-400">
              Automatiche — nel PDF
            </p>
          </div>
        )}
      </td>
      <td className="w-28 px-3 py-2 text-right align-top font-medium whitespace-nowrap">
        {riga.is_libera ? (
          <input
            type="number"
            min={0}
            step={0.01}
            value={riga.prezzo_riga ?? ""}
            onChange={(e) => onAggiornaPrezzo(riga.key, e.target.value)}
            onBlur={() => onRichiediAutosave()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLElement).blur();
              }
            }}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-right text-sm"
          />
        ) : importoDisplay != null ? (
          formatEuro(importoDisplay)
        ) : (
          "—"
        )}
      </td>
      <td className="w-20 px-2 py-2 align-top text-center">
        <button
          type="button"
          onClick={() => onToggleVisibile(riga.key)}
            title={riga.visibile_pdf ? "Nascondi dal PDF" : "Mostra nel PDF"}
            className="min-h-[44px] min-w-[44px] rounded-md border border-zinc-300 px-2 text-xs font-semibold"
          >
            {riga.visibile_pdf ? "Visibile" : "Nascosta"}
        </button>
      </td>
        <td className="w-24 px-2 py-2 align-top">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => onDuplica(riga)}
              disabled={duplicating || deleting}
              className="min-h-[44px] rounded-md border border-zinc-300 px-2 text-xs font-semibold disabled:opacity-50"
            >
              {duplicating ? "..." : "Duplica"}
            </button>
            <button
              type="button"
              onClick={() => onElimina(riga)}
              disabled={duplicating || deleting}
              className="min-h-[44px] rounded-md border border-red-200 px-2 text-xs font-semibold text-brand-danger disabled:opacity-50"
            >
              {deleting ? "..." : "Elimina"}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  function RigaRowConPosa(
  props: {
    riga: RigaEditabile;
    importoDisplay: number | null;
    isDragging: boolean;
    isDropTarget: boolean;
    onAggiornaDescrizione: (key: string, valore: string) => void;
    onAggiornaTesto: (key: string, valore: string) => void;
    onAggiornaNota: (key: string, valore: string) => void;
    onAggiornaQuantita: (key: string, valore: string) => void;
    onAggiornaPrezzo: (key: string, valore: string) => void;
    onToggleVisibile: (key: string) => void;
    onRichiediAutosave: () => void;
    onDuplica: (riga: RigaEditabile) => void;
    duplicating: boolean;
    onElimina: (riga: RigaEditabile) => void;
    deleting: boolean;
    onDragStart: (key: string) => void;
    onDragEnd: () => void;
    onDragOver: (event: React.DragEvent<HTMLTableRowElement>, key: string) => void;
    onDrop: (event: React.DragEvent<HTMLTableRowElement>, key: string) => void;
  },
) {
  // Le righe posa sono righe DB indipendenti (tipo_riga='posa'), non più virtuali.
  return <RigaRow {...props} />;
}

export default function ComponiPreventivoPage() {
  const params = useParams<{ id: string }>();
  const preventivoId = params.id;

  const [preventivo, setPreventivo] = useState<PreventivoComponi | null>(null);
  const [righe, setRighe] = useState<RigaEditabile[]>([]);
  const [servizi, setServizi] = useState<ServizioComplementare[]>([]);
  const [serviziCatalogo, setServiziCatalogo] = useState<ServizioCatalogo[]>(
    () => SERVIZI_DEFAULT.map((s) => ({ ...s })),
  );
  const [menuServiziAperto, setMenuServiziAperto] = useState(false);
  const [addingServizio, setAddingServizio] = useState(false);
  const menuServiziRef = useRef<HTMLDivElement>(null);
  const [scontoPercentuale, setScontoPercentuale] = useState("10");
  const [scontoPercentuale2, setScontoPercentuale2] = useState("0");
  /** Sconto1 a piena precisione (da netto digitato); null = usa il valore del campo. */
  const [sconto1Preciso, setSconto1Preciso] = useState<number | null>(null);
  /** Netto prodotti bloccato sull'importo digitato. */
  const [nettoOverride, setNettoOverride] = useState<number | null>(null);
  const [ivaPercentuale, setIvaPercentuale] = useState<IvaAliquota>(10);
  const [prezzoNetto, setPrezzoNetto] = useState("");
  const [editingNetto, setEditingNetto] = useState(false);
  const [nettoNonRaggiungibile, setNettoNonRaggiungibile] = useState(false);
  const nettoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clienteNome, setClienteNome] = useState("");
  const [clienteCantiere, setClienteCantiere] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [numeroPreventivo, setNumeroPreventivo] = useState("");
  const [dataPreventivo, setDataPreventivo] = useState("");
  const [validitaGiorni, setValiditaGiorni] = useState("30");
  const [revisione, setRevisione] = useState("0");
  const [notePreventivo, setNotePreventivo] = useState("");
  const [condizioniTipo, setCondizioniTipo] =
    useState<CondizioniPagamentoTipo>(CONDIZIONI_PAGAMENTO_DEFAULT);
  const [condizioniAcconto, setCondizioniAcconto] = useState("");
  const [condizioniTestoLibero, setCondizioniTestoLibero] = useState("");
  const [anticipoFinanziamentoGenerale, setAnticipoFinanziamentoGenerale] =
    useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const testataAutosave = useAutosaveController();
  const descrizioniAutosave = useAutosaveController();
  const noteAutosave = useAutosaveController();
  const totaliAutosave = useAutosaveController();
  const serviziAutosave = useAutosaveController();
  const [addingTesto, setAddingTesto] = useState(false);
  const [addingLibera, setAddingLibera] = useState(false);
  const [deletingServizioId, setDeletingServizioId] = useState<number | null>(
    null,
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [savingVersione, setSavingVersione] = useState(false);
  const [versioniRefreshKey, setVersioniRefreshKey] = useState(0);
  const [versioniIniziali, setVersioniIniziali] = useState<
    VersionePreventivo[] | null
  >(null);
  const [pdfAnteprima, setPdfAnteprima] = useState<{
    url: string;
    bytes: Uint8Array;
    filename: string;
  } | null>(null);
  const pdfDocumentRef = useRef<HTMLDivElement>(null);
  const [descrizioniDirty, setDescrizioniDirty] = useState(false);
  const [snapTestata, setSnapTestata] = useState<string | null>(null);
  const [snapNote, setSnapNote] = useState<string | null>(null);
  const [snapTotali, setSnapTotali] = useState<string | null>(null);
  const [serviziDirty, setServiziDirty] = useState(false);
  const [duplicatingKey, setDuplicatingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const righeRef = useRef(righe);
  const descrizioniDirtyRef = useRef(descrizioniDirty);
  const serviziRef = useRef(servizi);
  const testataFormRef = useRef({
    clienteNome: "",
    clienteCantiere: "",
    clienteTelefono: "",
    clienteEmail: "",
    numeroPreventivo: "",
    dataPreventivo: "",
    validitaGiorni: "30",
    revisione: "0",
    condizioniTipo: CONDIZIONI_PAGAMENTO_DEFAULT as CondizioniPagamentoTipo,
    condizioniAcconto: "",
    condizioniTestoLibero: "",
  });
  const snapTestataRef = useRef<string | null>(null);
  const noteRef = useRef("");
  const snapNoteRef = useRef<string | null>(null);
  const serviziDirtyRef = useRef(false);
  const descrizioniDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const totaliFormRef = useRef({
    scontoPercentuale: "10",
    scontoPercentuale2: "0",
    ivaPercentuale: 10 as IvaAliquota,
    prezzoNetto: "",
    nettoOverride: null as number | null,
    scontoNum: 10,
    scontoNum2: 0,
    nettoProdotti: 0,
  });
  const snapTotaliRef = useRef<string | null>(null);

  useEffect(() => {
    righeRef.current = righe;
  }, [righe]);
  useEffect(() => {
    descrizioniDirtyRef.current = descrizioniDirty;
  }, [descrizioniDirty]);
  useEffect(() => {
    serviziRef.current = servizi;
  }, [servizi]);
  useEffect(() => {
    testataFormRef.current = {
      clienteNome,
      clienteCantiere,
      clienteTelefono,
      clienteEmail,
      numeroPreventivo,
      dataPreventivo,
      validitaGiorni,
      revisione,
      condizioniTipo,
      condizioniAcconto,
      condizioniTestoLibero,
    };
  }, [
    clienteNome,
    clienteCantiere,
    clienteTelefono,
    clienteEmail,
    numeroPreventivo,
    dataPreventivo,
    validitaGiorni,
    revisione,
    condizioniTipo,
    condizioniAcconto,
    condizioniTestoLibero,
  ]);
  useEffect(() => {
    snapTestataRef.current = snapTestata;
  }, [snapTestata]);
  useEffect(() => {
    noteRef.current = notePreventivo;
  }, [notePreventivo]);
  useEffect(() => {
    snapNoteRef.current = snapNote;
  }, [snapNote]);
  useEffect(() => {
    snapTotaliRef.current = snapTotali;
  }, [snapTotali]);

  function snapshotTestataDa(dati: {
    cliente_nome: string | null;
    cliente_cantiere: string | null;
    cliente_telefono: string | null;
    cliente_email: string | null;
    numero_preventivo: string | null;
    data_preventivo: string | null;
    validita_giorni: number | null;
    revisione: number | null;
    note_preventivo: string | null;
    condizioni_pagamento_tipo?: string | null;
    condizioni_pagamento_acconto?: number | null;
    condizioni_pagamento_testo?: string | null;
  }, overrides?: { dataPreventivo?: string; revisione?: string }) {
    const tipo = normalizzaTipoCondizioniPagamento(
      dati.condizioni_pagamento_tipo,
    );
    const dataVal =
      overrides?.dataPreventivo ??
      (formatDataPerInput(dati.data_preventivo) || dataOggiPerInput());
    return JSON.stringify({
      clienteNome: dati.cliente_nome ?? "",
      clienteCantiere: dati.cliente_cantiere ?? "",
      clienteTelefono: dati.cliente_telefono ?? "",
      clienteEmail: dati.cliente_email ?? "",
      numeroPreventivo: dati.numero_preventivo ?? "",
      dataPreventivo: dataVal,
      validitaGiorni: String(dati.validita_giorni ?? 30),
      revisione: overrides?.revisione ?? String(dati.revisione ?? 0),
      condizioniTipo: tipo,
      condizioniAcconto:
        dati.condizioni_pagamento_acconto != null
          ? String(dati.condizioni_pagamento_acconto)
          : "",
      condizioniTestoLibero: dati.condizioni_pagamento_testo ?? "",
    });
  }

  function popolaFormTestata(
    dati: PreventivoComponi,
    opts?: { revisioneDaVersioni?: string },
  ) {
    setClienteNome(dati.cliente_nome ?? "");
    setClienteCantiere(dati.cliente_cantiere ?? "");
    setClienteTelefono(dati.cliente_telefono ?? "");
    setClienteEmail(dati.cliente_email ?? "");
    setNumeroPreventivo(dati.numero_preventivo ?? "");
    const dataVal =
      formatDataPerInput(dati.data_preventivo) || dataOggiPerInput();
    setDataPreventivo(dataVal);
    setValiditaGiorni(String(dati.validita_giorni ?? 30));
    const revVal = opts?.revisioneDaVersioni ?? String(dati.revisione ?? 0);
    setRevisione(revVal);
    setNotePreventivo(dati.note_preventivo ?? "");
    const tipo = normalizzaTipoCondizioniPagamento(
      dati.condizioni_pagamento_tipo,
    );
    setCondizioniTipo(tipo);
    const accontoRaw =
      dati.condizioni_pagamento_acconto != null
        ? String(dati.condizioni_pagamento_acconto)
        : "";
    setCondizioniAcconto(accontoRaw);
    const testoSalvato = (dati.condizioni_pagamento_testo ?? "").trim();
    const testo =
      testoSalvato ||
      generaTestoCondizioniPagamento({
        tipo,
        acconto: accontoRaw.trim() === "" ? 0 : Number(accontoRaw),
        testoPersonalizzato: "",
      });
    setCondizioniTestoLibero(testo);
    testataFormRef.current = {
      ...testataFormRef.current,
      clienteNome: dati.cliente_nome ?? "",
      clienteCantiere: dati.cliente_cantiere ?? "",
      clienteTelefono: dati.cliente_telefono ?? "",
      clienteEmail: dati.cliente_email ?? "",
      numeroPreventivo: dati.numero_preventivo ?? "",
      dataPreventivo: dataVal,
      validitaGiorni: String(dati.validita_giorni ?? 30),
      revisione: revVal,
      condizioniTipo: tipo,
      condizioniAcconto: accontoRaw,
      condizioniTestoLibero: testo,
    };
  }

  const loadData = useCallback(async () => {
    const supabase = createSupabaseClient();

    const [preventivoResult, righeResult, serviziData, versioniData, catalogoData] =
      await Promise.all([
      supabase
        .from("preventivi")
        .select(
          `id, riferimento, cliente_nome, cliente_cantiere, cliente_telefono, cliente_email,
          numero_preventivo, data_preventivo, validita_giorni, revisione, commerciale_id,
          sconto_percentuale, sconto_percentuale_2, iva_percentuale, prezzo_netto_target, note_preventivo,
          condizioni_pagamento_tipo, condizioni_pagamento_acconto, condizioni_pagamento_testo,
          commerciali(id, nome, telefono, email, riferimento_aziendale, sede_id, sedi(id, nome, indirizzo, cap, telefono, email, orari))`,
        )
        .eq("id", preventivoId)
        .single(),
      supabase
        .from("righe")
        .select(
          `id, quantita, prezzo_riga, posa_importo, posa, posa_riga_separata, descrizione_cliente, descrizione_libera,
          descrizione_tecnica, nota, colore, colore_interno, colore_esterno, colore_ferramenta, vetro, prodotto_id,
          ordine, visibile_pdf, tipo_riga, testo_libero,
          tipologia_apertura, larghezza_mm, altezza_mm, extra_colore_nome, extra_colore_percentuale,
          prodotti(nome, descrizione_cliente, descrizione_tecnica, scheda_tecnica_path, tipo_prezzo, prezzo_unitario, ha_vetro, regola_prezzo, categorie(nome))`,
        )
        .eq("preventivo_id", preventivoId)
        .order("ordine", { ascending: true })
        .order("id", { ascending: true }),
      ensureServiziComplementari(supabase, preventivoId),
      caricaVersioniPreventivo(supabase, preventivoId),
      caricaServiziCatalogo(supabase),
    ]);

    if (preventivoResult.error) throw new Error(preventivoResult.error.message);
    if (righeResult.error) throw new Error(righeResult.error.message);

    setPreventivo(preventivoResult.data as PreventivoComponi);
    const prevData = preventivoResult.data as PreventivoComponi;
    const revDaVersioni = revisioneDaVersioni(versioniData);
    const dataVal =
      formatDataPerInput(prevData.data_preventivo) || dataOggiPerInput();
    popolaFormTestata(prevData, { revisioneDaVersioni: revDaVersioni });
    setSnapTestata(
      snapshotTestataDa(prevData, {
        dataPreventivo: dataVal,
        revisione: revDaVersioni,
      }),
    );
    setVersioniIniziali(versioniData);
    setSnapNote(preventivoResult.data.note_preventivo ?? "");
    setDescrizioniDirty(false);
    const sconto1Load = String(preventivoResult.data.sconto_percentuale ?? 10);
    const sconto2Load = String(preventivoResult.data.sconto_percentuale_2 ?? 0);
    setScontoPercentuale(sconto1Load);
    setScontoPercentuale2(sconto2Load);
    setSconto1Preciso(null);
    const ivaCaricata = Number(preventivoResult.data.iva_percentuale ?? 10);
    const ivaLoad = isIvaAliquota(ivaCaricata) ? ivaCaricata : 10;
    setIvaPercentuale(ivaLoad);
    let prezzoNettoLoad = "";
    let nettoOverrideLoad: number | null = null;
    if (preventivoResult.data.prezzo_netto_target != null) {
      const target = Number(preventivoResult.data.prezzo_netto_target);
      // 0 (o non positivo) non è un target valido: tipicamente campo vuoto
      // persistito male, che azzererebbe i totali.
      if (Number.isFinite(target) && target > 0) {
        prezzoNettoLoad = String(preventivoResult.data.prezzo_netto_target);
        setPrezzoNetto(prezzoNettoLoad);
        nettoOverrideLoad = round2(target);
        setNettoOverride(nettoOverrideLoad);
      } else {
        setPrezzoNetto("");
        setNettoOverride(null);
      }
    } else {
      setPrezzoNetto("");
      setNettoOverride(null);
    }
    setSnapTotali(
      serializzaSnapTotali({
        scontoPercentuale: sconto1Load,
        scontoPercentuale2: sconto2Load,
        ivaPercentuale: ivaLoad,
        nettoOverride: nettoOverrideLoad,
      }),
    );

    setRighe(raggruppaRighe(righeResult.data as RigaDb[]));

    setServizi(
      serviziData.map((servizio) => ({
        id: servizio.id,
        descrizione: servizio.descrizione ?? "",
        nota: servizio.nota ?? "",
        importo: servizio.importo ?? 0,
        ordine: servizio.ordine ?? 0,
      })),
    );
    setServiziCatalogo(catalogoData);
  }, [preventivoId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      setError(null);

      try {
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore sconosciuto");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [loadData, preventivoId]);

  const handleAnticipoFinanziamentoChange = useCallback(
    (anticipo: number) => {
      setAnticipoFinanziamentoGenerale(anticipo);
      const tipoCorrente = testataFormRef.current.condizioniTipo;
      if (tipoCorrente !== "finanziamento_parziale") return;
      const valore = String(anticipo);
      setCondizioniAcconto(valore);
      testataFormRef.current = {
        ...testataFormRef.current,
        condizioniAcconto: valore,
      };
      const testo = generaTestoCondizioniPagamento({
        tipo: "finanziamento_parziale",
        acconto: anticipo,
        testoPersonalizzato: "",
      });
      setCondizioniTestoLibero(testo);
      testataFormRef.current = {
        ...testataFormRef.current,
        condizioniAcconto: valore,
        condizioniTestoLibero: testo,
      };
    },
    [],
  );

  const commerciale = normalizzaRelazione(preventivo?.commerciali ?? null);
  const sede = normalizzaRelazione(commerciale?.sedi ?? null);

  const importoTotale = useMemo(
    () =>
      totaleImportoRigheVisibili(
        righe.map((riga) => ({
          tipo_riga: riga.tipo_riga,
          visibile_pdf: riga.visibile_pdf,
          prezzo_riga: riga.prezzo_riga,
          posa_importo: riga.posa_inclusa ? riga.posa_importo : 0,
          posa_riga_separata: riga.posa_riga_separata,
        })),
      ),
    [righe],
  );

  const righePdfEspansa = useMemo(
    () =>
      espandiRighePdfCartaceo(
        righe
          .filter((riga) => riga.visibile_pdf)
          .map((riga) => ({
            key: riga.key,
            tipo_riga: riga.tipo_riga,
            visibile_pdf: riga.visibile_pdf,
            prezzo_riga: riga.prezzo_riga,
            posa_importo: riga.posa_importo,
            posa_inclusa: riga.posa_inclusa,
            posa_riga_separata: riga.posa_riga_separata,
            nome_prodotto: riga.nome_prodotto,
            quantita: riga.quantita,
            descrizione: riga.descrizione,
            nota: composiNotaConCaratteristiche(riga.nota, {
              colore: riga.colore,
              coloreInterno: riga.colore_interno,
              coloreEsterno: riga.colore_esterno,
              coloreFerramenta: riga.colore_ferramenta,
              vetro: riga.vetro,
              posaCertificataInclusa: isPosaCertificataInclusaSuRiga(riga),
            }),
            testo_libero: riga.testo_libero,
          })),
      ),
    [righe],
  );

  const scontoNum = useMemo(
    () => sconto1Preciso ?? parsePercentuale(scontoPercentuale),
    [sconto1Preciso, scontoPercentuale],
  );

  const scontoNum2 = useMemo(
    () => parsePercentuale(scontoPercentuale2),
    [scontoPercentuale2],
  );

  const totaleServizi = useMemo(
    () =>
      servizi.reduce((sum, servizio) => {
        const importo = Number(servizio.importo);
        return sum + (Number.isFinite(importo) ? importo : 0);
      }, 0),
    [servizi],
  );

  /** Standard non ancora presenti nel preventivo (match su descrizione). */
  const serviziCatalogoDisponibili = useMemo(() => {
    const usati = new Set(
      servizi
        .map((s) => normalizzaDescrizioneServizio(s.descrizione))
        .filter(Boolean),
    );
    return serviziCatalogo.filter(
      (s) => !usati.has(normalizzaDescrizioneServizio(s.descrizione)),
    );
  }, [servizi, serviziCatalogo]);

  useEffect(() => {
    if (!menuServiziAperto) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        menuServiziRef.current &&
        !menuServiziRef.current.contains(event.target as Node)
      ) {
        setMenuServiziAperto(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuServiziAperto]);

  const totali = useMemo(
    () =>
      calcolaTotaliPreventivo({
        prodottiLordi: importoTotale,
        sconto1: scontoNum,
        sconto2: scontoNum2,
        totaleServizi,
        ivaPercentuale,
        nettoProdottiOverride: nettoOverride,
      }),
    [
      importoTotale,
      scontoNum,
      scontoNum2,
      totaleServizi,
      ivaPercentuale,
      nettoOverride,
    ],
  );

  const importoScontato = totali.nettoProdotti;
  const totaleFinale = totali.imponibile;
  const importoScontiTotale = totali.importoSconto1 + totali.importoSconto2;

  useEffect(() => {
    totaliFormRef.current = {
      scontoPercentuale,
      scontoPercentuale2,
      ivaPercentuale,
      prezzoNetto,
      nettoOverride,
      scontoNum,
      scontoNum2,
      nettoProdotti: totali.nettoProdotti,
    };
  }, [
    scontoPercentuale,
    scontoPercentuale2,
    ivaPercentuale,
    prezzoNetto,
    nettoOverride,
    scontoNum,
    scontoNum2,
    totali.nettoProdotti,
  ]);

  // Se c'è un netto target salvato/digitato, ricalcola sconto1 a piena precisione
  // (es. al load, o quando cambia il lordo / sconto2).
  useEffect(() => {
    if (nettoOverride == null || !(importoTotale > 0)) return;
    const risultato = ricalcolaSconto1DaNetto({
      prodottiLordi: importoTotale,
      sconto2: scontoNum2,
      nettoTarget: nettoOverride,
    });
    if (!risultato.ok) {
      setNettoNonRaggiungibile(true);
      return;
    }
    setNettoNonRaggiungibile(false);
    setSconto1Preciso((prev) =>
      prev != null && Math.abs(prev - risultato.sconto1) < 1e-12
        ? prev
        : risultato.sconto1,
    );
    const display = round2(risultato.sconto1).toFixed(2);
    setScontoPercentuale((prev) => (prev === display ? prev : display));
    // Ricalcolo derivato dal netto target: aggiorna lo snapshot così
    // beforeunload non resta sporco senza modifiche utente.
    setSnapTotali((prev) => {
      if (prev == null) return prev;
      try {
        const parsed = JSON.parse(prev) as {
          scontoPercentuale: string;
          scontoPercentuale2: string;
          ivaPercentuale: number;
          nettoOverride: number | null;
        };
        const next = serializzaSnapTotali({
          ...parsed,
          scontoPercentuale: display,
          nettoOverride,
        });
        snapTotaliRef.current = next;
        return next;
      } catch {
        return prev;
      }
    });
  }, [nettoOverride, importoTotale, scontoNum2]);

  useEffect(() => {
    if (editingNetto || nettoNonRaggiungibile || nettoOverride != null) return;
    setPrezzoNetto(round2(totali.nettoProdotti).toFixed(2));
  }, [
    totali.nettoProdotti,
    editingNetto,
    nettoNonRaggiungibile,
    nettoOverride,
  ]);

  function applicaNettoTarget(raw: string) {
    if (raw.trim() === "" || Number(raw.replace(",", ".")) === 0) {
      // Campo svuotato / 0 → sconti di default 10% + 0%, nessun override
      setNettoNonRaggiungibile(false);
      setNettoOverride(null);
      setSconto1Preciso(null);
      setScontoPercentuale("10");
      setScontoPercentuale2("0");
      return;
    }
    const nettoTarget = Number(raw.replace(",", "."));
    if (!Number.isFinite(nettoTarget)) {
      return;
    }
    const risultato = ricalcolaSconto1DaNetto({
      prodottiLordi: importoTotale,
      sconto2: scontoNum2,
      nettoTarget,
    });
    if (!risultato.ok) {
      // Avviso senza applicare percentuali assurde: restano gli sconti precedenti.
      setNettoNonRaggiungibile(true);
      return;
    }
    setNettoNonRaggiungibile(false);
    setSconto1Preciso(risultato.sconto1);
    setScontoPercentuale(round2(risultato.sconto1).toFixed(2));
    setNettoOverride(round2(nettoTarget));
  }

  /** Commit immediato (blur / Invio): cancella eventuale debounce in corso. */
  function commitPrezzoNetto(raw: string) {
    if (nettoDebounceRef.current != null) {
      clearTimeout(nettoDebounceRef.current);
      nettoDebounceRef.current = null;
    }
    applicaNettoTarget(raw);
  }

  /** Mentre digita: nessun ricalcolo; dopo 800ms di pausa applica. */
  function scheduleCommitPrezzoNetto(raw: string) {
    if (nettoDebounceRef.current != null) {
      clearTimeout(nettoDebounceRef.current);
    }
    nettoDebounceRef.current = setTimeout(() => {
      nettoDebounceRef.current = null;
      applicaNettoTarget(raw);
    }, 800);
  }

  useEffect(() => {
    return () => {
      if (nettoDebounceRef.current != null) {
        clearTimeout(nettoDebounceRef.current);
      }
    };
  }, []);

  function formatPercentualeSchermo(n: number) {
    return round2(n).toLocaleString("it-IT", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  const righePdf = useMemo(
    () => righe.filter((riga) => riga.visibile_pdf),
    [righe],
  );

  const schedheTecnichePdf = useMemo(
    () => estraiSchedheTecnicheUniche(righePdf),
    [righePdf],
  );

  const condizioniPagamentoTesto = useMemo(() => {
    const libero = condizioniTestoLibero.trim();
    if (libero) return libero;
    return generaTestoCondizioniPagamento({
      tipo: condizioniTipo,
      acconto:
        condizioniAcconto.trim() === ""
          ? 0
          : Number(condizioniAcconto.replace(",", ".")),
      testoPersonalizzato: "",
    });
  }, [condizioniTipo, condizioniAcconto, condizioniTestoLibero]);

  function generaEImpostaTestoCondizioni(
    tipo: CondizioniPagamentoTipo,
    accontoRaw: string,
  ) {
    const testo = generaTestoCondizioniPagamento({
      tipo,
      acconto:
        accontoRaw.trim() === ""
          ? 0
          : Number(accontoRaw.replace(",", ".")),
      testoPersonalizzato: "",
    });
    setCondizioniTestoLibero(testo);
    testataFormRef.current = {
      ...testataFormRef.current,
      condizioniTestoLibero: testo,
    };
    return testo;
  }

  const buildParametriPdfCompleto = useCallback((): ParametriPdfCompleto => {
    if (!preventivo) {
      throw new Error("Preventivo non caricato");
    }

    return {
      paginaProdotti: {
        riferimento: preventivo.riferimento,
        clienteNome,
        clienteCantiere,
        clienteTelefono,
        clienteEmail,
        numeroPreventivo,
        dataPreventivo,
        revisione,
        validitaGiorni,
        commerciale: commerciale
          ? {
              nome: commerciale.nome,
              telefono: commerciale.telefono,
              email: commerciale.email,
              riferimento_aziendale: commerciale.riferimento_aziendale,
            }
          : null,
        sede: sede
          ? {
              nome: sede.nome,
              indirizzo: sede.indirizzo,
              cap: sede.cap,
              telefono: sede.telefono,
              email: sede.email,
              orari: sede.orari,
            }
          : null,
        righe: righePdfEspansa.map((riga) => ({
          key: riga.key,
          tipo_riga: riga.tipo_riga,
          quantita: riga.quantita,
          quantitaEtichetta: riga.quantitaEtichetta,
          descrizione: riga.descrizione,
          testo_libero: riga.testo_libero,
          nota: riga.nota,
          prezzo_riga: riga.prezzo_riga,
          importo_display: riga.importo_display,
          importoEtichetta: riga.importoEtichetta,
        })),
        importoTotale,
        scontoPercentuale: scontoNum,
        scontoPercentuale2: scontoNum2,
        importoSconto1: totali.importoSconto1,
        importoSconto2: totali.importoSconto2,
        importoScontato,
        servizi: servizi.map((servizio) => ({
          descrizione: servizio.descrizione,
          nota: servizio.nota,
          importo: servizio.importo,
        })),
        totaleServizi,
        totaleFinale,
        ivaPercentuale: totali.ivaPercentuale,
        importoIva: totali.importoIva,
        totaleIvato: totali.totaleIvato,
        notePreventivo,
      },
      schedheTecnichePaths: schedheTecnichePdf,
      datiCopertina: {
        clienteNome,
        numeroPreventivo,
        revisione,
        dataPreventivo,
        validitaGiorni,
        commercialeNome: commerciale?.nome ?? "",
        commercialeTelefono: commerciale?.telefono ?? "",
        commercialeEmail: commerciale?.email ?? "",
      },
      condizioniPagamentoTesto,
    };
  }, [
    preventivo,
    clienteNome,
    clienteCantiere,
    clienteTelefono,
    clienteEmail,
    numeroPreventivo,
    dataPreventivo,
    revisione,
    validitaGiorni,
    commerciale,
    sede,
    righePdfEspansa,
    importoTotale,
    scontoNum,
    scontoNum2,
    importoScontato,
    totali,
    servizi,
    totaleServizi,
    totaleFinale,
    notePreventivo,
    schedheTecnichePdf,
    condizioniPagamentoTesto,
  ]);

  function mostraFeedback(messaggio: string) {
    setFeedback(messaggio);
    window.setTimeout(() => setFeedback(null), 2500);
  }

  async function generaPdfConAllegati() {
    const supabase = createSupabaseClient();
    const allegati = await caricaAllegatiBytesPerPdf(supabase, preventivoId);

    const [finPrev, configResult, convResult] = await Promise.all([
      supabase
        .from("preventivi")
        .select(
          `finanziamento_attivo, finanziamento_anticipo, finanziamento_durate_mostrate,
          fin_famiglia, fin_durata_scelta, fin_pdf_solo_scelta, fin_assorbi_maggiorazione,
          detrazione_perc`,
        )
        .eq("id", preventivoId)
        .single(),
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

    let finanziamento: DatiFinanziamentoPdfInput | null = null;

    if (finPrev.error) {
      console.warn(
        "[PDF] Impossibile leggere i campi investimento/finanziamento:",
        finPrev.error.message,
      );
    } else if (finPrev.data) {
      const parsed = parseFinanziamentoDaPreventivo(finPrev.data);
      const detrazionePerc = parsed.detrazionePerc;
      const finanziamentoAttivo = parsed.attivo;

      if (detrazionePerc > 0 || finanziamentoAttivo) {
        let config = null;
        let convenzioni: ReturnType<typeof mapConvenzioneRow>[] = [];

        if (finanziamentoAttivo) {
          const durateRef =
            parsed.soloScelta && parsed.durataScelta != null
              ? [parsed.durataScelta]
              : parsed.durateMostrate;
          if (parsed.soloScelta && parsed.durataScelta == null) {
            throw new Error(
              "Seleziona un'opzione di pagamento per continuare",
            );
          }
          if (!parsed.soloScelta && durateRef.length === 0) {
            throw new Error(
              "Mostra almeno una durata al cliente per il PDF",
            );
          }
          if (configResult.error) {
            throw new Error(
              `Finanziamento attivo ma config non leggibile: ${configResult.error.message}`,
            );
          }
          if (convResult.error) {
            throw new Error(
              `Finanziamento attivo ma convenzioni non leggibili: ${convResult.error.message}`,
            );
          }
          config = parseConfigFinanziamento(configResult.data ?? []);
          convenzioni = (convResult.data ?? []).map((row) =>
            mapConvenzioneRow(row as Record<string, unknown>),
          );
        }

        const durateMostratePdf =
          parsed.soloScelta && parsed.durataScelta != null
            ? [parsed.durataScelta]
            : parsed.durateMostrate.length > 0
              ? parsed.durateMostrate
              : config
                ? defaultDurateMostrate(
                    totali.totaleIvato,
                    convenzioni,
                    config.soglia_tasso_zero_gratis,
                    parsed.famiglia,
                  )
                : [];

        finanziamento = {
          detrazionePerc,
          finanziamentoAttivo,
          totaleIvato: totali.totaleIvato,
          imponibile: totaleFinale,
          famiglia: parsed.famiglia,
          durateMostrate: durateMostratePdf,
          anticipoScelta: parsed.anticipoScelta,
          durataScelta:
            parsed.durataScelta ??
            (!parsed.soloScelta ? durateMostratePdf[0] ?? null : null),
          soloScelta: parsed.soloScelta,
          assorbiMaggiorazione: parsed.assorbiMaggiorazione,
          config,
          convenzioni,
        };
      }
    }

    const params = buildParametriPdfCompleto();
    return generaPdfCompletoBytes({
      ...params,
      paginaProdotti: {
        ...params.paginaProdotti,
        finanziamento,
      },
      allegati,
    });
  }

  async function handleAnteprimaPdf() {
    if (!preventivo) return;

    setGeneratingPdf(true);
    setError(null);

    try {
      const filename = nomeFilePdf({
        clienteNome,
        numeroPreventivo,
        riferimento: preventivo.riferimento,
        data: dataPreventivo || null,
      });

      const pdfCompleto = await generaPdfConAllegati();
      const bytes = new Uint8Array(pdfCompleto);
      const blob = bytesToPdfBlob(bytes);
      const url = URL.createObjectURL(blob);

      setPdfAnteprima((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url, bytes, filename };
      });
      mostraFeedback("Anteprima PDF pronta");
    } catch (err) {
      console.error("[PDF] Generazione fallita:", err);
      setError(
        err instanceof Error ? err.message : "Errore nella generazione del PDF",
      );
    } finally {
      setGeneratingPdf(false);
    }
  }

  function chiudiAnteprimaPdf() {
    setPdfAnteprima((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  function scaricaAnteprimaPdf() {
    if (!pdfAnteprima) return;
    scaricaPdf(pdfAnteprima.bytes, pdfAnteprima.filename);
    mostraFeedback("PDF scaricato");
  }

  const pdfAnteprimaUrlRef = useRef<string | null>(null);

  useEffect(() => {
    pdfAnteprimaUrlRef.current = pdfAnteprima?.url ?? null;
  }, [pdfAnteprima?.url]);

  useEffect(() => {
    return () => {
      if (pdfAnteprimaUrlRef.current) {
        URL.revokeObjectURL(pdfAnteprimaUrlRef.current);
      }
    };
  }, []);

  async function handleSalvaVersione() {
    if (!preventivo) return;

    setSavingVersione(true);
    setError(null);

    try {
      const supabase = createSupabaseClient();
      const pdfCompleto = await generaPdfConAllegati();

      const { numeroVersione } = await salvaVersionePreventivo(supabase, {
        preventivoId,
        pdfBytes: pdfCompleto,
        totale: totaleFinale,
      });

      const revStr = String(numeroVersione);
      setRevisione(revStr);
      testataFormRef.current = {
        ...testataFormRef.current,
        revisione: revStr,
      };
      setSnapTestata((prev) => {
        if (!prev) return prev;
        try {
          const parsed = JSON.parse(prev) as Record<string, unknown>;
          return JSON.stringify({ ...parsed, revisione: revStr });
        } catch {
          return prev;
        }
      });
      await supabase
        .from("preventivi")
        .update({ revisione: numeroVersione })
        .eq("id", preventivoId);

      setVersioniRefreshKey((prev) => prev + 1);
      mostraFeedback(`Versione ${numeroVersione} salvata`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore nel salvataggio versione",
      );
    } finally {
      setSavingVersione(false);
    }
  }

  async function salvaOrdineRighe(nuoveRighe: RigaEditabile[]) {
    const supabase = createSupabaseClient();
    const conOrdine = nuoveRighe.map((riga, index) => ({
      ...riga,
      ordine: index + 1,
    }));

    setRighe(conOrdine);

    let numeroPos = 0;
    for (const riga of conOrdine) {
      const assegnaNumero = riga.tipo_riga !== "testo";
      if (assegnaNumero) numeroPos += 1;
      const numero_posizione = assegnaNumero ? numeroPos : null;

      for (const rigaId of riga.righeIds) {
        const { error: updateError } = await supabase
          .from("righe")
          .update({
            ordine: riga.ordine,
            ...(assegnaNumero ? { numero_posizione } : {}),
          })
          .eq("id", rigaId);

        if (updateError) throw new Error(updateError.message);
      }
    }
  }

  async function handleDropRiga(
    event: React.DragEvent<HTMLTableRowElement>,
    targetKey: string,
  ) {
    event.preventDefault();
    setDropTargetKey(null);

    const sourceKey =
      event.dataTransfer.getData("text/plain") || dragKey || "";
    setDragKey(null);

    if (!sourceKey || sourceKey === targetKey) return;

    const oldIndex = righe.findIndex((riga) => riga.key === sourceKey);
    const newIndex = righe.findIndex((riga) => riga.key === targetKey);
    if (oldIndex < 0 || newIndex < 0) return;

    const riordinate = [...righe];
    const [spostata] = riordinate.splice(oldIndex, 1);
    riordinate.splice(newIndex, 0, spostata);

    try {
      setError(null);
      await salvaOrdineRighe(riordinate);
      mostraFeedback("Ordine salvato");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel riordino");
      await loadData();
    }
  }

  function handleDragOverRiga(
    event: React.DragEvent<HTMLTableRowElement>,
    targetKey: string,
  ) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetKey(targetKey);
  }

  function aggiornaRiga(
    key: string,
    campo: "descrizione" | "nota" | "testo_libero" | "quantita" | "prezzo_riga",
    valore: string,
  ) {
    setDescrizioniDirty(true);
    descrizioniDirtyRef.current = true;
    setRighe((prev) => {
      const next = prev.map((riga) => {
        if (riga.key !== key) return riga;
        if (campo === "quantita") {
          const n = Number(valore);
          return {
            ...riga,
            quantita: Number.isFinite(n) && n > 0 ? n : riga.quantita,
          };
        }
        if (campo === "prezzo_riga") {
          if (valore === "") return { ...riga, prezzo_riga: null };
          const n = Number(valore);
          return {
            ...riga,
            prezzo_riga: Number.isFinite(n) ? n : riga.prezzo_riga,
          };
        }
        return { ...riga, [campo]: valore };
      });
      righeRef.current = next;
      return next;
    });
    scheduleAutosaveDescrizioniDebounced();
  }

  async function handleToggleVisibile(key: string) {
    const riga = righe.find((item) => item.key === key);
    if (!riga) return;

    const nuovoValore = !riga.visibile_pdf;
    setRighe((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, visibile_pdf: nuovoValore } : item,
      ),
    );

    const supabase = createSupabaseClient();
    setError(null);

    for (const rigaId of riga.righeIds) {
      const { error: updateError } = await supabase
        .from("righe")
        .update({ visibile_pdf: nuovoValore })
        .eq("id", rigaId);

      if (updateError) {
        setError(updateError.message);
        await loadData();
        return;
      }
    }
  }

  function aggiornaServizio(
    id: number,
    campo: keyof Omit<ServizioComplementare, "id" | "ordine">,
    valore: string,
  ) {
    serviziDirtyRef.current = true;
    setServiziDirty(true);
    setServizi((prev) => {
      const next = prev.map((servizio) => {
        if (servizio.id !== id) return servizio;
        if (campo === "importo") {
          const importo = valore === "" ? 0 : Number(valore);
          return {
            ...servizio,
            importo: Number.isFinite(importo) ? importo : 0,
          };
        }
        return { ...servizio, [campo]: valore };
      });
      serviziRef.current = next;
      return next;
    });
  }

  /** Allinea lo stato righe con il DOM degli editor descrizione (prima di salvare/navigare). */
  function syncDescrizioniDaEditorDom() {
    const editors = document.querySelectorAll<HTMLElement>(
      "[data-descrizione-editor]",
    );
    if (editors.length === 0) return;
    let changed = false;
    let next = righeRef.current;
    for (const el of editors) {
      const key = el.getAttribute("data-descrizione-editor");
      if (!key || key === "1") continue;
      const cleaned = sanitizeDescrizioneHtml(el.innerHTML);
      const riga = next.find((r) => r.key === key);
      if (!riga || riga.descrizione === cleaned) continue;
      changed = true;
      next = next.map((r) =>
        r.key === key ? { ...r, descrizione: cleaned } : r,
      );
    }
    if (changed) {
      descrizioniDirtyRef.current = true;
      setDescrizioniDirty(true);
      righeRef.current = next;
      setRighe(next);
    }
  }

  async function persistTestata() {
    const f = testataFormRef.current;
    const validitaNum = Number(f.validitaGiorni);
    const revisioneNum = Number(f.revisione);

    if (!Number.isFinite(validitaNum) || validitaNum < 0) {
      throw new Error("La validità in giorni deve essere un numero valido.");
    }
    if (!Number.isFinite(revisioneNum) || revisioneNum < 0) {
      throw new Error("La revisione deve essere un numero valido.");
    }

    const supabase = createSupabaseClient();
    const accontoNum =
      f.condizioniTipo === "finanziamento_parziale"
        ? Number(String(f.condizioniAcconto).replace(",", "."))
        : null;
    if (
      f.condizioniTipo === "finanziamento_parziale" &&
      (!Number.isFinite(accontoNum) || (accontoNum as number) < 0)
    ) {
      throw new Error("Inserisci un acconto valido (≥ 0).");
    }

    const testoCondizioni = f.condizioniTestoLibero.trim()
      ? f.condizioniTestoLibero.trim()
      : generaTestoCondizioniPagamento({
          tipo: f.condizioniTipo,
          acconto:
            f.condizioniAcconto.trim() === ""
              ? 0
              : Number(f.condizioniAcconto.replace(",", ".")),
          testoPersonalizzato: "",
        });

    const { error: updateError } = await supabase
      .from("preventivi")
      .update({
        cliente_nome: f.clienteNome.trim() || null,
        cliente_cantiere: f.clienteCantiere.trim() || null,
        cliente_telefono: f.clienteTelefono.trim() || null,
        cliente_email: f.clienteEmail.trim() || null,
        numero_preventivo: f.numeroPreventivo.trim() || null,
        data_preventivo: f.dataPreventivo || null,
        validita_giorni: validitaNum,
        revisione: revisioneNum,
        condizioni_pagamento_tipo: f.condizioniTipo,
        condizioni_pagamento_acconto:
          f.condizioniTipo === "finanziamento_parziale" ? accontoNum : null,
        condizioni_pagamento_testo: testoCondizioni || null,
      })
      .eq("id", preventivoId);

    if (updateError) throw new Error(updateError.message);

    const snap = JSON.stringify({
      clienteNome: f.clienteNome,
      clienteCantiere: f.clienteCantiere,
      clienteTelefono: f.clienteTelefono,
      clienteEmail: f.clienteEmail,
      numeroPreventivo: f.numeroPreventivo,
      dataPreventivo: f.dataPreventivo,
      validitaGiorni: f.validitaGiorni,
      revisione: f.revisione,
      condizioniTipo: f.condizioniTipo,
      condizioniAcconto:
        f.condizioniTipo === "finanziamento_parziale" ? f.condizioniAcconto : "",
      condizioniTestoLibero: f.condizioniTestoLibero,
    });
    snapTestataRef.current = snap;
    setSnapTestata(snap);
    setError(null);
  }

  function triggerAutosaveTestata() {
    const f = testataFormRef.current;
    const corrente = JSON.stringify({
      clienteNome: f.clienteNome,
      clienteCantiere: f.clienteCantiere,
      clienteTelefono: f.clienteTelefono,
      clienteEmail: f.clienteEmail,
      numeroPreventivo: f.numeroPreventivo,
      dataPreventivo: f.dataPreventivo,
      validitaGiorni: f.validitaGiorni,
      revisione: f.revisione,
      condizioniTipo: f.condizioniTipo,
      condizioniAcconto:
        f.condizioniTipo === "finanziamento_parziale" ? f.condizioniAcconto : "",
      condizioniTestoLibero: f.condizioniTestoLibero,
    });
    if (snapTestataRef.current != null && corrente === snapTestataRef.current) {
      return;
    }
    void testataAutosave
      .run(async () => {
        try {
          await persistTestata();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore salvataggio");
          throw err;
        }
      })
      .catch(() => undefined);
  }

  async function persistDescrizioni() {
    syncDescrizioniDaEditorDom();
    const supabase = createSupabaseClient();
    const elenco = righeRef.current;

    for (const riga of elenco) {
      if (riga.tipo_riga === "testo") {
        const { error: updateError } = await supabase
          .from("righe")
          .update({ testo_libero: riga.testo_libero.trim() || null })
          .eq("id", riga.righeIds[0]);

        if (updateError) throw new Error(updateError.message);
        continue;
      }

      const descrizioneRaw = riga.descrizione.trim();
      const descrizione = descrizioneRaw
        ? sanitizeDescrizioneHtml(descrizioneRaw)
        : null;
      const nota = riga.nota.trim() || null;

      for (const rigaId of riga.righeIds) {
        const payload: Record<string, unknown> = {
          descrizione_cliente: descrizione,
          nota,
        };

        if (riga.is_libera) {
          payload.descrizione_libera = descrizione;
          payload.quantita = riga.quantita;
          payload.prezzo_riga = riga.prezzo_riga;
          payload.descrizione_tecnica =
            riga.descrizione_tecnica.trim() ||
            (riga.tipo_riga === "posa" ? "Posa in opera" : "Riga libera");
        }

        const { error: updateError } = await supabase
          .from("righe")
          .update(payload)
          .eq("id", rigaId);

        if (updateError) throw new Error(updateError.message);
      }
    }

    setDescrizioniDirty(false);
    descrizioniDirtyRef.current = false;
    setError(null);
  }

  function triggerAutosaveDescrizioni() {
    if (descrizioniDebounceRef.current) {
      clearTimeout(descrizioniDebounceRef.current);
      descrizioniDebounceRef.current = null;
    }
    // Attendi il flush di setState da onChange/onBlurSave
    window.setTimeout(() => {
      if (!descrizioniDirtyRef.current) return;
      void descrizioniAutosave
        .run(async () => {
          try {
            await persistDescrizioni();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Errore salvataggio");
            throw err;
          }
        })
        .catch(() => undefined);
    }, 0);
  }

  /** Rete di sicurezza: se si digita a lungo senza blur, salva comunque. */
  function scheduleAutosaveDescrizioniDebounced() {
    descrizioniDirtyRef.current = true;
    setDescrizioniDirty(true);
    if (descrizioniDebounceRef.current) {
      clearTimeout(descrizioniDebounceRef.current);
    }
    descrizioniDebounceRef.current = setTimeout(() => {
      descrizioniDebounceRef.current = null;
      if (!descrizioniDirtyRef.current) return;
      void descrizioniAutosave
        .run(async () => {
          try {
            await persistDescrizioni();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Errore salvataggio");
            throw err;
          }
        })
        .catch(() => undefined);
    }, 1500);
  }

  async function persistNote() {
    const note = noteRef.current;
    const supabase = createSupabaseClient();
    const { error: updateError } = await supabase
      .from("preventivi")
      .update({ note_preventivo: note.trim() || null })
      .eq("id", preventivoId);

    if (updateError) throw new Error(updateError.message);
    snapNoteRef.current = note;
    setSnapNote(note);
    setError(null);
  }

  function triggerAutosaveNote() {
    if (snapNoteRef.current != null && noteRef.current === snapNoteRef.current) {
      return;
    }
    void noteAutosave
      .run(async () => {
        try {
          await persistNote();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore salvataggio");
          throw err;
        }
      })
      .catch(() => undefined);
  }

  async function persistTotali() {
    const t = totaliFormRef.current;
    const supabase = createSupabaseClient();
    const { error: updateError } = await supabase
      .from("preventivi")
      .update({
        sconto_percentuale: t.scontoNum,
        sconto_percentuale_2: t.scontoNum2,
        iva_percentuale: t.ivaPercentuale,
        // Solo se l'utente ha fissato esplicitamente un netto target.
        // Non salvare il valore calcolato/vuoto (Number("") === 0) come target.
        prezzo_netto_target:
          t.nettoOverride != null && t.nettoOverride > 0
            ? round2(t.nettoOverride)
            : null,
      })
      .eq("id", preventivoId);

    if (updateError) throw new Error(updateError.message);

    const snap = serializzaSnapTotali({
      scontoPercentuale: t.scontoPercentuale,
      scontoPercentuale2: t.scontoPercentuale2,
      ivaPercentuale: t.ivaPercentuale,
      nettoOverride: t.nettoOverride,
    });
    snapTotaliRef.current = snap;
    setSnapTotali(snap);
    setError(null);
  }

  function triggerAutosaveTotali() {
    const t = totaliFormRef.current;
    const corrente = serializzaSnapTotali({
      scontoPercentuale: t.scontoPercentuale,
      scontoPercentuale2: t.scontoPercentuale2,
      ivaPercentuale: t.ivaPercentuale,
      nettoOverride: t.nettoOverride,
    });
    if (snapTotaliRef.current != null && corrente === snapTotaliRef.current) {
      return;
    }
    void totaliAutosave
      .run(async () => {
        try {
          await persistTotali();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore salvataggio");
          throw err;
        }
      })
      .catch(() => undefined);
  }

  async function persistServizio(servizio: ServizioComplementare) {
    const supabase = createSupabaseClient();
    const { error: updateError } = await supabase
      .from("servizi_complementari")
      .update({
        descrizione: servizio.descrizione.trim() || null,
        nota: servizio.nota.trim() || null,
        importo: servizio.importo,
        ordine: servizio.ordine,
      })
      .eq("id", servizio.id);

    if (updateError) throw new Error(updateError.message);
    setError(null);
  }

  async function persistTuttiServizi() {
    const elenco = serviziRef.current;
    for (const servizio of elenco) {
      await persistServizio(servizio);
    }
    serviziDirtyRef.current = false;
    setServiziDirty(false);
  }

  function triggerAutosaveServizio(servizioId: number) {
    window.setTimeout(() => {
      const servizio = serviziRef.current.find((s) => s.id === servizioId);
      if (!servizio) return;
      void serviziAutosave
        .run(async () => {
          try {
            await persistServizio(servizio);
            serviziDirtyRef.current = false;
            setServiziDirty(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Errore salvataggio");
            throw err;
          }
        })
        .catch(() => undefined);
    }, 0);
  }

  async function handleAggiungiRigaLibera() {
    setAddingLibera(true);
    setError(null);

    const supabase = createSupabaseClient();
    const prossimoOrdine =
      righe.length > 0
        ? Math.max(...righe.map((riga) => riga.ordine)) + 1
        : 1;

    let numeroPosizione: number;
    try {
      numeroPosizione = await prossimoNumeroPosizione(supabase, preventivoId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore numerazione");
      setAddingLibera(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("righe")
      .insert({
        preventivo_id: Number(preventivoId),
        prodotto_id: null,
        quantita: 1,
        posa: false,
        prezzo_riga: 0,
        descrizione_libera: "",
        descrizione_cliente: "",
        descrizione_tecnica: "Riga libera",
        nota: null,
        tipo_riga: "prodotto",
        visibile_pdf: true,
        ordine: prossimoOrdine,
        numero_posizione: numeroPosizione,
      })
      .select(
        `id, quantita, prezzo_riga, descrizione_cliente, descrizione_libera, descrizione_tecnica,
        nota, prodotto_id, ordine, visibile_pdf, tipo_riga, testo_libero`,
      )
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? "Errore nell'aggiunta della riga libera");
      setAddingLibera(false);
      return;
    }

    setRighe((prev) => [
      ...prev,
      {
        key: `libera-${data.id}`,
        prodotto_id: null,
        righeIds: [data.id],
        quantita: data.quantita ?? 1,
        prezzo_riga: data.prezzo_riga ?? 0,
        posa_importo: null,
        posa_inclusa: false,
        posa_riga_separata: false,
        is_posa_avanzata: false,
        is_libera: true,
        descrizione: data.descrizione_cliente ?? data.descrizione_libera ?? "",
        descrizione_tecnica: data.descrizione_tecnica ?? "Riga libera",
        nota: data.nota ?? "",
        colore: "",
        colore_interno: "",
        colore_esterno: "",
        colore_ferramenta: "",
        vetro: "",
        tipologia_apertura: "",
        larghezza_mm: null,
        altezza_mm: null,
        extra_colore_nome: "",
        extra_colore_percentuale: null,
        nota_griglia: "",
        tipo_riga: "prodotto",
        testo_libero: "",
        visibile_pdf: data.visibile_pdf ?? true,
        ordine: data.ordine ?? prossimoOrdine,
        scheda_tecnica_path: null,
        nome_prodotto: null,
      },
    ]);
    setAddingLibera(false);
  }

  async function handleAggiungiRigaTesto() {
    setAddingTesto(true);
    setError(null);

    const supabase = createSupabaseClient();
    const prossimoOrdine =
      righe.length > 0
        ? Math.max(...righe.map((riga) => riga.ordine)) + 1
        : 1;

    const { data, error: insertError } = await supabase
      .from("righe")
      .insert({
        preventivo_id: Number(preventivoId),
        prodotto_id: null,
        quantita: 1,
        posa: false,
        prezzo_riga: null,
        tipo_riga: "testo",
        testo_libero: "— FORNITURA E POSA —",
        visibile_pdf: true,
        ordine: prossimoOrdine,
      })
      .select(
        `id, quantita, prezzo_riga, descrizione_cliente, descrizione_libera, prodotto_id,
        ordine, visibile_pdf, tipo_riga, testo_libero`,
      )
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? "Errore nell'aggiunta della riga di testo");
      setAddingTesto(false);
      return;
    }

    setRighe((prev) => [
      ...prev,
      {
        key: `testo-${data.id}`,
        prodotto_id: null,
        righeIds: [data.id],
        quantita: 0,
        prezzo_riga: null,
        posa_importo: null,
        posa_inclusa: false,
        posa_riga_separata: false,
        is_posa_avanzata: false,
        is_libera: false,
        descrizione: "",
        descrizione_tecnica: "",
        nota: "",
        colore: "",
        colore_interno: "",
        colore_esterno: "",
        colore_ferramenta: "",
        vetro: "",
        tipologia_apertura: "",
        larghezza_mm: null,
        altezza_mm: null,
        extra_colore_nome: "",
        extra_colore_percentuale: null,
        nota_griglia: "",
        tipo_riga: "testo",
        testo_libero: data.testo_libero ?? "— FORNITURA E POSA —",
        visibile_pdf: data.visibile_pdf ?? true,
        ordine: data.ordine ?? prossimoOrdine,
        scheda_tecnica_path: null,
        nome_prodotto: null,
      },
    ]);
    setAddingTesto(false);
  }

  async function handleAggiungiServizio(template?: ServizioCatalogo | null) {
    if (addingServizio) return;
    setAddingServizio(true);
    setMenuServiziAperto(false);
    setError(null);

    const supabase = createSupabaseClient();
    const prossimoOrdine =
      servizi.length > 0
        ? Math.max(...servizi.map((servizio) => servizio.ordine)) + 1
        : 1;

    const { data, error: insertError } = await supabase
      .from("servizi_complementari")
      .insert({
        preventivo_id: Number(preventivoId),
        descrizione: template?.descrizione?.trim() || "",
        nota: template?.nota ?? "",
        importo: template?.importo ?? 0,
        ordine: prossimoOrdine,
      })
      .select("id, descrizione, nota, importo, ordine")
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? "Errore nell'aggiunta del servizio");
      setAddingServizio(false);
      return;
    }

    setServizi((prev) => [
      ...prev,
      {
        id: data.id,
        descrizione: data.descrizione ?? "",
        nota: data.nota ?? "",
        importo: data.importo ?? 0,
        ordine: data.ordine ?? prossimoOrdine,
      },
    ]);
    setAddingServizio(false);
  }

  async function handleEliminaServizio(servizioId: number) {
    const confermato = window.confirm("Eliminare questo servizio complementare?");
    if (!confermato) return;

    setDeletingServizioId(servizioId);
    setError(null);

    const supabase = createSupabaseClient();
    const { error: deleteError } = await supabase
      .from("servizi_complementari")
      .delete()
      .eq("id", servizioId);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingServizioId(null);
      return;
    }

    setServizi((prev) => prev.filter((servizio) => servizio.id !== servizioId));
    setDeletingServizioId(null);
  }

  async function handleDuplicaGruppoRiga(riga: RigaEditabile) {
    setDuplicatingKey(riga.key);
    setError(null);
    const supabase = createSupabaseClient();

    try {
      const { data: originali, error: fetchError } = await supabase
        .from("righe")
        .select(
          `prodotto_id, larghezza_cm, altezza_cm, lunghezza_cm, quantita, posa, prezzo_riga,
          descrizione_libera, descrizione_cliente, descrizione_tecnica, nota, colore,
          colore_interno, colore_esterno, colore_ferramenta, vetro, prezzo_libero,
          prezzo_inserito, regola_applicata, posa_importo, posa_tipo, posa_manuale,
          posa_riga_separata, modalita_mq, mq_diretti, riferimento_interno, ordine,
          visibile_pdf, tipo_riga, testo_libero,
          tipologia_apertura, larghezza_mm, altezza_mm, extra_colore_nome, extra_colore_percentuale,
          righe_flag(flag_id)`,
        )
        .in("id", riga.righeIds);
      if (fetchError) throw new Error(fetchError.message);

      const righeOrig = originali ?? [];
      if (righeOrig.length === 0) return;

      const prossimoOrdine =
        righe.length > 0
          ? Math.max(...righe.map((x) => x.ordine)) + 1
          : 1;

      const payload = righeOrig.map((orig, index) => ({
        preventivo_id: Number(preventivoId),
        prodotto_id: orig.prodotto_id,
        larghezza_cm: orig.larghezza_cm,
        altezza_cm: orig.altezza_cm,
        lunghezza_cm: orig.lunghezza_cm,
        quantita: orig.quantita,
        posa: orig.posa,
        prezzo_riga: orig.prezzo_riga,
        descrizione_libera: orig.descrizione_libera,
        descrizione_cliente: orig.descrizione_cliente,
        descrizione_tecnica: orig.descrizione_tecnica,
        nota: orig.nota,
        colore: orig.colore,
        colore_interno: orig.colore_interno,
        colore_esterno: orig.colore_esterno,
        colore_ferramenta: orig.colore_ferramenta,
        vetro: orig.vetro,
        tipologia_apertura: orig.tipologia_apertura,
        larghezza_mm: orig.larghezza_mm,
        altezza_mm: orig.altezza_mm,
        extra_colore_nome: orig.extra_colore_nome,
        extra_colore_percentuale: orig.extra_colore_percentuale,
        prezzo_libero: orig.prezzo_libero,
        prezzo_inserito: orig.prezzo_inserito,
        regola_applicata: orig.regola_applicata,
        posa_importo: orig.posa_importo,
        posa_tipo: orig.posa_tipo,
        posa_manuale: orig.posa_manuale,
        posa_riga_separata: orig.posa_riga_separata,
        modalita_mq: orig.modalita_mq,
        mq_diretti: orig.mq_diretti,
        riferimento_interno: orig.riferimento_interno,
        ordine: prossimoOrdine + index,
        visibile_pdf: orig.visibile_pdf,
        tipo_riga: orig.tipo_riga,
        testo_libero: orig.testo_libero,
        // Copia indipendente: non riusare il link di generazione posa.
        parent_riga_id: null,
      }));

      const { data: nuove, error: insertError } = await supabase
        .from("righe")
        .insert(payload)
        .select("id");
      if (insertError || !nuove) {
        throw new Error(insertError?.message ?? "Errore duplicazione riga");
      }

      const flags: { riga_id: number; flag_id: number }[] = [];
      for (let i = 0; i < righeOrig.length; i++) {
        for (const rf of righeOrig[i].righe_flag ?? []) {
          flags.push({
            riga_id: nuove[i].id,
            flag_id: (rf as { flag_id: number }).flag_id,
          });
        }
      }
      if (flags.length > 0) {
        const { error: flagError } = await supabase.from("righe_flag").insert(flags);
        if (flagError) throw new Error(flagError.message);
      }

      // Duplicando un prodotto con posa separata: crea nuova riga posa (non copia quella legata).
      for (let i = 0; i < righeOrig.length; i++) {
        const orig = righeOrig[i];
        if (
          orig.tipo_riga === "posa" ||
          !orig.posa_riga_separata ||
          !orig.posa ||
          !(Number(orig.posa_importo) > 0)
        ) {
          continue;
        }
        await ensureRigaPosaSeparata(supabase, {
          preventivoId: Number(preventivoId),
          parentRigaId: nuove[i].id,
          importoPosaTotale: Number(orig.posa_importo),
          quantita: Number(orig.quantita) || 1,
        });
      }

      await loadData();
      mostraFeedback("Riga duplicata");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore duplicazione");
    } finally {
      setDuplicatingKey(null);
    }
  }

  async function handleEliminaGruppoRiga(riga: RigaEditabile) {
    const confermato = window.confirm(
      "Eliminare questa riga dal preventivo? L'operazione è irreversibile.",
    );
    if (!confermato) return;

    setDeletingKey(riga.key);
    setError(null);
    const supabase = createSupabaseClient();

    try {
      const { error: flagError } = await supabase
        .from("righe_flag")
        .delete()
        .in("riga_id", riga.righeIds);
      if (flagError) throw new Error(flagError.message);

      const { error: deleteError } = await supabase
        .from("righe")
        .delete()
        .in("id", riga.righeIds);
      if (deleteError) throw new Error(deleteError.message);

      await loadData();
      mostraFeedback("Riga eliminata");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'eliminazione");
    } finally {
      setDeletingKey(null);
    }
  }

  const testataCorrente = JSON.stringify({
    clienteNome,
    clienteCantiere,
    clienteTelefono,
    clienteEmail,
    numeroPreventivo,
    dataPreventivo,
    validitaGiorni,
    revisione,
    condizioniTipo,
    condizioniAcconto:
      condizioniTipo === "finanziamento_parziale" ? condizioniAcconto : "",
    condizioniTestoLibero,
  });
  const testataDirty = snapTestata != null && testataCorrente !== snapTestata;
  const noteDirty = snapNote != null && notePreventivo !== snapNote;
  const totaliCorrente = serializzaSnapTotali({
    scontoPercentuale,
    scontoPercentuale2,
    ivaPercentuale,
    nettoOverride,
  });
  const totaliDirty = snapTotali != null && totaliCorrente !== snapTotali;

  const flushPrimaDiNavigare = useCallback(async () => {
    if (descrizioniDebounceRef.current) {
      clearTimeout(descrizioniDebounceRef.current);
      descrizioniDebounceRef.current = null;
    }
    if (nettoDebounceRef.current != null) {
      clearTimeout(nettoDebounceRef.current);
      nettoDebounceRef.current = null;
      applicaNettoTarget(totaliFormRef.current.prezzoNetto);
    }

    syncDescrizioniDaEditorDom();

    const testataCorrenteNow = JSON.stringify({
      clienteNome: testataFormRef.current.clienteNome,
      clienteCantiere: testataFormRef.current.clienteCantiere,
      clienteTelefono: testataFormRef.current.clienteTelefono,
      clienteEmail: testataFormRef.current.clienteEmail,
      numeroPreventivo: testataFormRef.current.numeroPreventivo,
      dataPreventivo: testataFormRef.current.dataPreventivo,
      validitaGiorni: testataFormRef.current.validitaGiorni,
      revisione: testataFormRef.current.revisione,
      condizioniTipo: testataFormRef.current.condizioniTipo,
      condizioniAcconto:
        testataFormRef.current.condizioniTipo === "finanziamento_parziale"
          ? testataFormRef.current.condizioniAcconto
          : "",
      condizioniTestoLibero: testataFormRef.current.condizioniTestoLibero,
    });
    const testataDirtyNow =
      snapTestataRef.current == null ||
      testataCorrenteNow !== snapTestataRef.current;

    if (testataDirtyNow) {
      await testataAutosave.run(async () => {
        await persistTestata();
      });
    } else {
      await testataAutosave.flush();
    }

    if (descrizioniDirtyRef.current) {
      await descrizioniAutosave.run(async () => {
        await persistDescrizioni();
      });
    } else {
      await descrizioniAutosave.flush();
    }

    const noteDirtyNow =
      snapNoteRef.current == null || noteRef.current !== snapNoteRef.current;
    if (noteDirtyNow) {
      await noteAutosave.run(async () => {
        await persistNote();
      });
    } else {
      await noteAutosave.flush();
    }

    const t = totaliFormRef.current;
    const totaliCorrenteNow = serializzaSnapTotali({
      scontoPercentuale: t.scontoPercentuale,
      scontoPercentuale2: t.scontoPercentuale2,
      ivaPercentuale: t.ivaPercentuale,
      nettoOverride: t.nettoOverride,
    });
    const totaliDirtyNow =
      snapTotaliRef.current != null &&
      totaliCorrenteNow !== snapTotaliRef.current;
    if (totaliDirtyNow) {
      await totaliAutosave.run(async () => {
        await persistTotali();
      });
    } else {
      await totaliAutosave.flush();
    }

    if (serviziDirtyRef.current) {
      await serviziAutosave.run(async () => {
        await persistTuttiServizi();
      });
    } else {
      await serviziAutosave.flush();
    }
  }, [
    testataAutosave,
    descrizioniAutosave,
    noteAutosave,
    totaliAutosave,
    serviziAutosave,
  ]);

  useFlushBeforeNavigate({
    isDirty:
      testataDirty ||
      descrizioniDirty ||
      noteDirty ||
      totaliDirty ||
      serviziDirty,
    alwaysFlushOnNavigate: true,
    isSaving:
      testataAutosave.isSaving ||
      descrizioniAutosave.isSaving ||
      noteAutosave.isSaving ||
      totaliAutosave.isSaving ||
      serviziAutosave.isSaving,
    flush: flushPrimaDiNavigare,
  });

  const autosaveTestataField = autosaveInputHandlers(triggerAutosaveTestata);

  useEffect(() => {
    return () => {
      if (descrizioniDebounceRef.current) {
        clearTimeout(descrizioniDebounceRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <p className="text-zinc-600">Caricamento...</p>
      </main>
    );
  }

  if (error && !preventivo) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          Errore: {error}
        </p>
        <Link
          href={`/preventivo/${preventivoId}`}
          className="mt-4 inline-block text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          Torna al preventivo
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-brand-surface">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/preventivo/${preventivoId}`}
          className="text-sm text-brand-muted underline hover:text-brand-navy"
        >
          ← Torna al preventivo
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={() => {
              void (async () => {
                try {
                  await flushPrimaDiNavigare();
                } catch {
                  return;
                }
                await handleAnteprimaPdf();
              })();
            }}
            disabled={generatingPdf || savingVersione}
          >
            {generatingPdf ? "Generazione PDF..." : "Anteprima PDF"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void (async () => {
                try {
                  await flushPrimaDiNavigare();
                } catch {
                  return;
                }
                await handleSalvaVersione();
              })();
            }}
            disabled={generatingPdf || savingVersione}
          >
            {savingVersione ? "Salvataggio..." : "Salva versione"}
          </Button>
          {feedback && (
            <span className="text-sm font-medium text-green-700">
              {feedback}
            </span>
          )}
        </div>
      </div>

      <div className="doc-sheet rounded-lg border border-brand-border p-6 sm:p-10">
        <header className="mb-8 border-b border-zinc-200 pb-6">
          <p className="text-xs font-semibold tracking-wide text-brand-accent uppercase">
            Componi preventivo cliente
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-brand-navy sm:text-3xl">
            {titoloPreventivo(clienteNome || preventivo?.cliente_nome, preventivo?.riferimento)}
          </h1>

          <div className="mt-4 flex items-center justify-end">
            <AutosaveStatusIndicator
              status={testataAutosave.status}
              onRetry={testataAutosave.retry}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-md border border-brand-border bg-brand-surface/50 p-4">
              <h2 className="mb-3 text-xs font-semibold tracking-wide text-brand-navy">
                CLIENTE
              </h2>
              <div className="space-y-2 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-zinc-500">Nome</span>
                  <input
                    type="text"
                    value={clienteNome}
                    onChange={(e) => {
                      const value = e.target.value;
                      setClienteNome(value);
                      testataFormRef.current = {
                        ...testataFormRef.current,
                        clienteNome: value,
                      };
                    }}
                    {...autosaveTestataField}
                    className="min-h-[44px] rounded border border-zinc-300 px-2 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-zinc-500">Cantiere</span>
                  <input
                    type="text"
                    value={clienteCantiere}
                    onChange={(e) => {
                      const value = e.target.value;
                      setClienteCantiere(value);
                      testataFormRef.current = {
                        ...testataFormRef.current,
                        clienteCantiere: value,
                      };
                    }}
                    {...autosaveTestataField}
                    className="min-h-[44px] rounded border border-zinc-300 px-2 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-zinc-500">Telefono</span>
                  <input
                    type="text"
                    value={clienteTelefono}
                    onChange={(e) => {
                      const value = e.target.value;
                      setClienteTelefono(value);
                      testataFormRef.current = {
                        ...testataFormRef.current,
                        clienteTelefono: value,
                      };
                    }}
                    {...autosaveTestataField}
                    className="min-h-[44px] rounded border border-zinc-300 px-2 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-zinc-500">Email</span>
                  <input
                    type="email"
                    value={clienteEmail}
                    onChange={(e) => {
                      const value = e.target.value;
                      setClienteEmail(value);
                      testataFormRef.current = {
                        ...testataFormRef.current,
                        clienteEmail: value,
                      };
                    }}
                    {...autosaveTestataField}
                    className="min-h-[44px] rounded border border-zinc-300 px-2 py-2"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-md border border-brand-border bg-brand-surface/50 p-4">
              <h2 className="mb-3 text-xs font-semibold tracking-wide text-brand-navy">
                OFFERTA
              </h2>
              <div className="space-y-2 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-zinc-500">N. offerta</span>
                  <input
                    type="text"
                    value={numeroPreventivo}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNumeroPreventivo(value);
                      testataFormRef.current = {
                        ...testataFormRef.current,
                        numeroPreventivo: value,
                      };
                    }}
                    {...autosaveTestataField}
                    className="min-h-[44px] rounded border border-zinc-300 px-2 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-zinc-500">Data</span>
                  <input
                    type="date"
                    value={dataPreventivo}
                    onChange={(e) => {
                      const value = e.target.value;
                      setDataPreventivo(value);
                      testataFormRef.current = {
                        ...testataFormRef.current,
                        dataPreventivo: value,
                      };
                      triggerAutosaveTestata();
                    }}
                    onBlur={autosaveTestataField.onBlur}
                    className="min-h-[44px] rounded border border-zinc-300 px-2 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-zinc-500">Revisione</span>
                  <input
                    type="number"
                    min={0}
                    value={revisione}
                    onChange={(e) => {
                      const value = e.target.value;
                      setRevisione(value);
                      testataFormRef.current = {
                        ...testataFormRef.current,
                        revisione: value,
                      };
                    }}
                    {...autosaveTestataField}
                    className="min-h-[44px] rounded border border-zinc-300 px-2 py-2"
                  />
                  <span className="text-[11px] text-zinc-500">
                    Allineata alle versioni salvate; modificabile.
                  </span>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-zinc-500">Validità (giorni)</span>
                  <input
                    type="number"
                    min={0}
                    value={validitaGiorni}
                    onChange={(e) => {
                      const value = e.target.value;
                      setValiditaGiorni(value);
                      testataFormRef.current = {
                        ...testataFormRef.current,
                        validitaGiorni: value,
                      };
                    }}
                    {...autosaveTestataField}
                    className="min-h-[44px] rounded border border-zinc-300 px-2 py-2"
                  />
                </label>
              </div>
            </div>
          </div>

          {commerciale && (
            <div className="mt-6 rounded-md bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
              <p className="font-medium">{commerciale.nome}</p>
              {sede && (
                <p className="mt-1 text-zinc-600">
                  {sede.nome}
                  {sede.indirizzo ? ` — ${sede.indirizzo}` : ""}
                </p>
              )}
              <p className="mt-1 text-zinc-600">
                {[
                  commerciale.telefono,
                  commerciale.email,
                  sede?.telefono,
                  sede?.email,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          )}
        </header>

        {error && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-700">Prodotti</h2>
            <AutosaveStatusIndicator
              status={descrizioniAutosave.status}
              onRetry={descrizioniAutosave.retry}
            />
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAggiungiRigaLibera}
                disabled={addingLibera}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
              >
                {addingLibera ? "..." : "Aggiungi riga libera"}
              </button>
              <button
                type="button"
                onClick={handleAggiungiRigaTesto}
                disabled={addingTesto}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
              >
                {addingTesto ? "..." : "Aggiungi riga di testo"}
              </button>
          </div>

          {righe.length === 0 ? (
            <p className="rounded-md border border-zinc-200 px-4 py-3 text-sm text-zinc-600">
              Nessuna riga nel preventivo.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className="w-full min-w-[860px] table-fixed text-left text-sm">
                <thead className="bg-brand-navy text-white">
                  <tr>
                    <th className="w-12 px-2 py-2.5 font-medium">↕</th>
                    <th className="w-14 px-2 py-2.5 font-medium">Q.tà</th>
                    <th className="px-3 py-2.5 font-medium">
                      Descrizione commerciale
                    </th>
                    <th className="w-44 px-3 py-2.5 font-medium">
                      Note/Caratteristiche
                    </th>
                    <th className="w-28 px-3 py-2.5 text-right font-medium">
                      Importo
                    </th>
                    <th className="w-20 px-2 py-2.5 text-center font-medium">
                      Visibile
                    </th>
                    <th className="w-24 px-2 py-2.5 font-medium">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((riga) => (
                    <RigaRowConPosa
                      key={riga.key}
                      riga={riga}
                      importoDisplay={importoVisualizzatoRiga(
                        riga.prezzo_riga,
                        riga.posa_inclusa ? riga.posa_importo : 0,
                        riga.is_posa_avanzata && riga.posa_inclusa,
                        riga.posa_riga_separata,
                      )}
                      isDragging={dragKey === riga.key}
                      isDropTarget={dropTargetKey === riga.key}
                      onAggiornaDescrizione={(key, valore) =>
                        aggiornaRiga(key, "descrizione", valore)
                      }
                      onAggiornaTesto={(key, valore) =>
                        aggiornaRiga(key, "testo_libero", valore)
                      }
                      onAggiornaNota={(key, valore) =>
                        aggiornaRiga(key, "nota", valore)
                      }
                      onAggiornaQuantita={(key, valore) =>
                        aggiornaRiga(key, "quantita", valore)
                      }
                      onAggiornaPrezzo={(key, valore) =>
                        aggiornaRiga(key, "prezzo_riga", valore)
                      }
                      onToggleVisibile={handleToggleVisibile}
                      onRichiediAutosave={triggerAutosaveDescrizioni}
                      onDuplica={handleDuplicaGruppoRiga}
                      duplicating={duplicatingKey === riga.key}
                      onElimina={handleEliminaGruppoRiga}
                      deleting={deletingKey === riga.key}
                      onDragStart={setDragKey}
                      onDragEnd={() => {
                        setDragKey(null);
                        setDropTargetKey(null);
                      }}
                      onDragOver={handleDragOverRiga}
                      onDrop={handleDropRiga}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-2 text-xs text-zinc-500">
            Usa il pulsante ↕ a sinistra per trascinare e riordinare le righe.
            La descrizione tecnica (in grigio) è solo per il commerciale; nel
            PDF va la descrizione commerciale. Descrizioni e note si salvano
            automaticamente all&apos;uscita dal campo. Le righe nascoste dal PDF
            restano visibili qui in semitrasparenza e non contano nei totali.
          </p>
        </section>

        <section className="mb-8 ml-auto w-full max-w-md space-y-4 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-brand-muted">Importo prodotti (lordo)</p>
              <p className="text-[10px] uppercase tracking-wide text-brand-muted/80">
                Calcolato
              </p>
            </div>
            <span className="text-base tabular-nums text-brand-text">
              {formatEuro(importoTotale)}
            </span>
          </div>

          <div className="space-y-2 rounded-md border border-brand-border bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-brand-navy">Sconti</p>
                <p className="text-[10px] uppercase tracking-wide text-brand-muted/80">
                  Modificabile · autosave
                </p>
              </div>
              <AutosaveStatusIndicator
                status={totaliAutosave.status}
                onRetry={totaliAutosave.retry}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="sconto"
                type="number"
                min={0}
                max={100}
                step={0.01}
                inputMode="decimal"
                aria-label="Sconto 1"
                value={scontoPercentuale}
                onChange={(e) => {
                  setScontoPercentuale(e.target.value);
                  setSconto1Preciso(null);
                  setNettoOverride(null);
                  setNettoNonRaggiungibile(false);
                }}
                onBlur={() => triggerAutosaveTotali()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLElement).blur();
                  }
                }}
                className="min-h-[40px] w-[4.5rem] rounded border border-brand-border px-2 text-right"
              />
              <span className="text-brand-muted">%</span>
              <span className="text-brand-muted">+</span>
              <input
                id="sconto2"
                type="number"
                min={0}
                max={100}
                step={0.01}
                inputMode="decimal"
                aria-label="Sconto 2"
                value={scontoPercentuale2}
                onChange={(e) => {
                  setScontoPercentuale2(e.target.value);
                  setNettoNonRaggiungibile(false);
                }}
                onBlur={() => triggerAutosaveTotali()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLElement).blur();
                  }
                }}
                className="min-h-[40px] w-[4.5rem] rounded border border-brand-border px-2 text-right"
              />
              <span className="text-brand-muted">%</span>
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-3 border-t border-brand-border pt-3">
            <div>
              <p className="font-medium text-brand-navy">Netto prodotti</p>
              <p className="text-[10px] uppercase tracking-wide text-brand-muted/80">
                Calcolato
              </p>
            </div>
            <span className="text-xl font-semibold tabular-nums text-brand-accent">
              {formatEuro(importoScontato)}
            </span>
          </div>

          <div className="space-y-1.5 rounded-md border border-dashed border-brand-accent/40 bg-brand-accent/5 p-3">
            <label
              className="flex items-center justify-between gap-2 font-medium text-brand-navy"
              htmlFor="prezzo-netto"
            >
              <span>Prezzo finale netto (€)</span>
              <span className="text-[10px] font-normal uppercase tracking-wide text-brand-muted/80">
                Modificabile
              </span>
            </label>
            <input
              id="prezzo-netto"
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              value={prezzoNetto}
              onFocus={() => setEditingNetto(true)}
              onChange={(e) => {
                const raw = e.target.value;
                setPrezzoNetto(raw);
                setEditingNetto(true);
                // Solo aggiorna il testo; il ricalcolo è su debounce / blur / Invio.
                scheduleCommitPrezzoNetto(raw);
              }}
              onBlur={(e) => {
                commitPrezzoNetto(e.target.value);
                setEditingNetto(false);
                // Dopo il ricalcolo sconto (setState), salva i totali.
                window.setTimeout(() => triggerAutosaveTotali(), 50);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitPrezzoNetto((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="min-h-[44px] w-full rounded border border-brand-border bg-white px-2 text-right font-medium"
            />
            <p className="text-xs text-brand-muted">
              Digita qui per calcolare lo sconto automaticamente (all’uscita
              dal campo o dopo una pausa). Solo prodotti, IVA esclusa.
            </p>
            {nettoNonRaggiungibile && (
              <p className="text-xs text-brand-danger">
                Importo non raggiungibile
              </p>
            )}
          </div>
        </section>

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-700">
              Servizi complementari
            </h2>
            <div className="flex items-center gap-3">
              <AutosaveStatusIndicator
                status={serviziAutosave.status}
                onRetry={serviziAutosave.retry}
              />
              <div ref={menuServiziRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMenuServiziAperto((open) => !open)}
                  disabled={addingServizio}
                  aria-expanded={menuServiziAperto}
                  aria-haspopup="menu"
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
                >
                  {addingServizio ? "Aggiunta..." : "Aggiungi servizio"}
                </button>
                {menuServiziAperto && (
                  <ul
                    role="menu"
                    className="absolute right-0 z-30 mt-1 min-w-[16rem] max-w-[22rem] overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg"
                  >
                    {serviziCatalogoDisponibili.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-zinc-500">
                        Tutti i servizi standard sono già in elenco.
                      </li>
                    ) : (
                      serviziCatalogoDisponibili.map((template) => (
                        <li key={`${template.ordine}-${template.descrizione}`} role="none">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void handleAggiungiServizio(template)}
                            className="block w-full px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                          >
                            {template.descrizione}
                          </button>
                        </li>
                      ))
                    )}
                    <li role="none" className="mt-1 border-t border-zinc-100">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void handleAggiungiServizio(null)}
                        className="block w-full px-3 py-2 text-left text-sm font-medium text-brand-navy hover:bg-zinc-50"
                      >
                        Personalizzato
                      </button>
                    </li>
                  </ul>
                )}
              </div>
            </div>
          </div>

          {servizi.length === 0 ? (
            <p className="rounded-md border border-zinc-200 px-4 py-3 text-sm text-zinc-600">
              Nessun servizio complementare.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-brand-navy text-white">
                  <tr>
                    <th className="px-3 py-2 font-medium">Descrizione</th>
                    <th className="w-48 px-3 py-2 font-medium">Nota</th>
                    <th className="w-32 px-3 py-2 font-medium">Importo</th>
                    <th className="w-20 px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {servizi.map((servizio) => (
                    <tr key={servizio.id} className="border-b border-zinc-100">
                      <td className="px-3 py-2 align-top">
                        <input
                          type="text"
                          value={servizio.descrizione}
                          onChange={(e) =>
                            aggiornaServizio(
                              servizio.id,
                              "descrizione",
                              e.target.value,
                            )
                          }
                          onBlur={() => triggerAutosaveServizio(servizio.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.target as HTMLElement).blur();
                            }
                          }}
                          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="text"
                          value={servizio.nota}
                          onChange={(e) =>
                            aggiornaServizio(
                              servizio.id,
                              "nota",
                              e.target.value,
                            )
                          }
                          onBlur={() => triggerAutosaveServizio(servizio.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.target as HTMLElement).blur();
                            }
                          }}
                          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={servizio.importo}
                          onChange={(e) =>
                            aggiornaServizio(
                              servizio.id,
                              "importo",
                              e.target.value,
                            )
                          }
                          onBlur={() => triggerAutosaveServizio(servizio.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.target as HTMLElement).blur();
                            }
                          }}
                          className="w-full rounded border border-zinc-300 px-2 py-1 text-right text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleEliminaServizio(servizio.id)}
                          disabled={deletingServizioId === servizio.id}
                          className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          {deletingServizioId === servizio.id
                            ? "..."
                            : "Elimina"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-700">
              Note preventivo
            </h2>
            <AutosaveStatusIndicator
              status={noteAutosave.status}
              onRetry={noteAutosave.retry}
            />
          </div>
          <textarea
            value={notePreventivo}
            onChange={(e) => {
              const value = e.target.value;
              setNotePreventivo(value);
              noteRef.current = value;
            }}
            onBlur={() => triggerAutosaveNote()}
            rows={4}
            placeholder="Note specifiche per questo preventivo..."
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </section>

        <section className="mb-4 space-y-4">
          <div className="rounded-md bg-brand-navy px-6 py-5 text-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-white/80">
                  Totale chiavi in mano
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/50">
                  Calcolato · imponibile
                </p>
              </div>
              <span className="text-3xl font-semibold tabular-nums">
                {formatEuro(totaleFinale)}
              </span>
            </div>
            <p className="mt-1 text-xs text-white/60">
              Netto prodotti ({formatEuro(importoScontato)}) + servizi (
              {formatEuro(totaleServizi)})
            </p>
          </div>

          <div className="rounded-md border border-brand-border bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-brand-navy">IVA</p>
              <p className="text-[10px] uppercase tracking-wide text-brand-muted/80">
                Modificabile
              </p>
            </div>
            <div className="flex gap-2">
              {IVA_ALIQUOTE.map((aliquota) => (
                <button
                  key={aliquota}
                  type="button"
                  onClick={() => {
                    setIvaPercentuale(aliquota);
                    void totaliAutosave
                      .run(async () => {
                        const supabase = createSupabaseClient();
                        const { error: updateError } = await supabase
                          .from("preventivi")
                          .update({
                            sconto_percentuale: scontoNum,
                            sconto_percentuale_2: scontoNum2,
                            iva_percentuale: aliquota,
                            prezzo_netto_target:
                              nettoOverride != null && nettoOverride > 0
                                ? round2(nettoOverride)
                                : null,
                          })
                          .eq("id", preventivoId);
                        if (updateError) throw new Error(updateError.message);
                        setSnapTotali(
                          serializzaSnapTotali({
                            scontoPercentuale,
                            scontoPercentuale2,
                            ivaPercentuale: aliquota,
                            nettoOverride,
                          }),
                        );
                        setError(null);
                      })
                      .catch((err) => {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Errore salvataggio",
                        );
                      });
                  }}
                  className={`min-h-[40px] flex-1 rounded-md border text-sm font-medium ${
                    ivaPercentuale === aliquota
                      ? "border-brand-accent bg-brand-accent text-white"
                      : "border-brand-border bg-white text-brand-text"
                  }`}
                >
                  {aliquota}%
                </button>
              ))}
            </div>
            <p className="mt-2 text-right text-sm tabular-nums text-brand-muted">
              IVA {ivaPercentuale}%: {formatEuro(totali.importoIva)}
            </p>
          </div>

          <div className="rounded-md border-2 border-brand-navy bg-brand-surface px-6 py-5">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-navy">
                  Totale IVA inclusa
                </p>
                <p className="text-[10px] uppercase tracking-wide text-brand-muted/80">
                  Calcolato
                </p>
              </div>
              <span className="text-4xl font-semibold tabular-nums text-brand-navy">
                {formatEuro(totali.totaleIvato)}
              </span>
            </div>
          </div>

          <div className="flex justify-end">
            <AutosaveStatusIndicator
              status={totaliAutosave.status}
              onRetry={totaliAutosave.retry}
            />
          </div>
        </section>

        <SimulatoreFinanziamento
          preventivoId={preventivoId}
          baseIvato={totali.totaleIvato}
          onFeedback={mostraFeedback}
          onAnticipoGeneraleChange={handleAnticipoFinanziamentoChange}
        />

        <section className="mt-6 rounded-md border border-brand-border bg-brand-surface/50 p-4">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-brand-navy">
            CONDIZIONI DI PAGAMENTO
          </h2>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-brand-label">
              Tipo condizioni di pagamento
            </span>
            <select
              value={condizioniTipo}
              onChange={(e) => {
                const value = e.target.value as CondizioniPagamentoTipo;
                setCondizioniTipo(value);
                let acconto = testataFormRef.current.condizioniAcconto;
                if (
                  value === "finanziamento_parziale" &&
                  anticipoFinanziamentoGenerale != null
                ) {
                  acconto = String(anticipoFinanziamentoGenerale);
                  setCondizioniAcconto(acconto);
                }
                testataFormRef.current = {
                  ...testataFormRef.current,
                  condizioniTipo: value,
                  condizioniAcconto: acconto,
                };
                generaEImpostaTestoCondizioni(value, acconto);
                triggerAutosaveTestata();
              }}
              onBlur={autosaveTestataField.onBlur}
              className="min-h-[44px] rounded-md border border-brand-input-border bg-white px-3 py-2 text-sm text-brand-text"
            >
              {CONDIZIONI_PAGAMENTO_OPZIONI.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          </label>

          {condizioniTipo === "finanziamento_parziale" && (
            <label className="mt-3 flex max-w-xs flex-col gap-1.5">
              <span className="text-sm text-brand-label">
                Acconto all&apos;ordine (€)
              </span>
              <input
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={condizioniAcconto}
                onChange={(e) => {
                  const value = e.target.value;
                  setCondizioniAcconto(value);
                  testataFormRef.current = {
                    ...testataFormRef.current,
                    condizioniAcconto: value,
                  };
                  generaEImpostaTestoCondizioni("finanziamento_parziale", value);
                }}
                {...autosaveTestataField}
                className="min-h-[44px] rounded-md border border-brand-input-border bg-white px-3 py-2 text-sm text-brand-text"
              />
              <span className="text-xs text-brand-muted">
                Precompilato dall&apos;anticipo del finanziamento; puoi
                modificarlo.
              </span>
            </label>
          )}

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-sm text-brand-label">
              Testo per contratto (modificabile)
            </span>
            <textarea
              value={condizioniTestoLibero}
              onChange={(e) => {
                const value = e.target.value;
                setCondizioniTestoLibero(value);
                testataFormRef.current = {
                  ...testataFormRef.current,
                  condizioniTestoLibero: value,
                };
              }}
              onBlur={autosaveTestataField.onBlur}
              rows={4}
              className="rounded-md border border-brand-input-border bg-white px-3 py-2 text-sm leading-relaxed text-brand-text"
            />
            <span className="text-xs text-brand-muted">
              Si aggiorna al cambio tipo/acconto; puoi riscrivere liberamente il
              testo che finisce nel PDF.
            </span>
          </label>
        </section>
      </div>

      <div
        ref={pdfDocumentRef}
        id="pdf-document"
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: -10000,
          width: "210mm",
          backgroundColor: "#ffffff",
          color: "#000000",
          padding: 32,
          pointerEvents: "none",
        }}
      >
        <PreventivoPdfDocument
          riferimento={preventivo?.riferimento ?? ""}
          clienteNome={clienteNome}
          clienteCantiere={clienteCantiere}
          clienteTelefono={clienteTelefono}
          clienteEmail={clienteEmail}
          numeroPreventivo={numeroPreventivo}
          dataPreventivo={dataPreventivo}
          revisione={revisione}
          validitaGiorni={validitaGiorni}
          commerciale={
            commerciale
              ? {
                  nome: commerciale.nome,
                  telefono: commerciale.telefono,
                  email: commerciale.email,
                  riferimento_aziendale: commerciale.riferimento_aziendale,
                }
              : null
          }
          sede={
            sede
              ? {
                  nome: sede.nome,
                  indirizzo: sede.indirizzo,
                  cap: sede.cap,
                  telefono: sede.telefono,
                  email: sede.email,
                  orari: sede.orari,
                }
              : null
          }
          righe={righePdfEspansa.map((riga) => ({
            key: riga.key,
            tipo_riga: riga.tipo_riga,
            quantita: riga.quantita,
            quantitaEtichetta: riga.quantitaEtichetta,
            descrizione: riga.descrizione,
            testo_libero: riga.testo_libero,
            nota: riga.nota,
            prezzo_riga: riga.prezzo_riga,
            importo_display: riga.importo_display,
            importoEtichetta: riga.importoEtichetta,
          }))}
          importoTotale={importoTotale}
          scontoPercentuale={scontoNum}
          scontoPercentuale2={scontoNum2}
          importoSconto1={totali.importoSconto1}
          importoSconto2={totali.importoSconto2}
          importoScontato={importoScontato}
          servizi={servizi.map((servizio) => ({
            descrizione: servizio.descrizione,
            nota: servizio.nota,
            importo: servizio.importo,
          }))}
          totaleServizi={totaleServizi}
          totaleFinale={totaleFinale}
          ivaPercentuale={totali.ivaPercentuale}
          importoIva={totali.importoIva}
          totaleIvato={totali.totaleIvato}
          notePreventivo={notePreventivo}
        />
      </div>

      <VersioniPreventivoSection
        preventivoId={preventivoId}
        refreshKey={versioniRefreshKey}
        initialVersioni={versioniIniziali ?? undefined}
      />
      </div>

      {pdfAnteprima && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-zinc-950/80"
          role="dialog"
          aria-modal="true"
          aria-label="Anteprima PDF"
        >
          <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-zinc-700 bg-zinc-900 px-4 py-3 text-white">
            <p className="truncate text-sm font-medium">
              Anteprima — {pdfAnteprima.filename}
            </p>
            <div className="flex flex-shrink-0 gap-2">
              <button
                type="button"
                onClick={scaricaAnteprimaPdf}
                className="rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
              >
                Scarica
              </button>
              <button
                type="button"
                onClick={chiudiAnteprimaPdf}
                className="rounded-md border border-zinc-500 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Chiudi
              </button>
            </div>
          </div>
          <iframe
            title="Anteprima PDF"
            src={pdfAnteprima.url}
            className="min-h-0 w-full flex-1 bg-zinc-800"
          />
        </div>
      )}
    </main>
  );
}
