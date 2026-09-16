"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import {
  Button,
  Breadcrumb,
  Card,
  FormBlock,
  Input,
  PageTitle,
  SectionTitle,
  inputControlClass,
} from "@/components/ui";
import {
  calcolaRigaCompleta,
  isProdottoPrezzoDigitato,
  mqCalcolati,
  type RisultatoCalcoloRiga,
} from "@/lib/calcolo-prezzo";
import {
  applicaRegolaPrezzo,
  configRegolaPrezzoDa,
  etichettaCampoPrezzoDigitato,
  formatImportoCampo,
  invertiRegolaPrezzo,
  serializzaRegolaApplicata,
  spiegazionePrezzoGriglia,
  spiegazioneRegolaPrezzo,
  type ConfigRegolaPrezzo,
} from "@/lib/regola-prezzo";
import {
  configVariantiPosa,
  haSceltaVisualizzazionePosa,
  haVariantiPosa,
  importoRigaCompleto,
  isCategoriaPosaAvanzata,
  normalizzaPosaTipo,
  posaTipoDefault,
  prezzoPosaUnitario,
  type ConfigVariantiPosa,
  type PosaTipo,
} from "@/lib/posa-categorie";
import {
  pulisciRighePosaPreventivo,
  removeRigaPosaPerParent,
  syncRigaPosaSeparata,
} from "@/lib/riga-posa";
import {
  normalizzaModalitaMq,
  prossimoNumeroPosizione,
  type ModalitaMq,
} from "@/lib/righe-posizione";
import { createSupabaseClient } from "@/lib/supabase";
import { formatEuro, normalizzaRelazione, titoloPreventivo } from "@/lib/format";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import ComboboxLibero from "@/components/ComboboxLibero";
import DescrizioneCommercialeEditor from "@/components/DescrizioneCommercialeEditor";
import { sanitizeDescrizioneHtml } from "@/lib/descrizione-formattata";
import {
  EXTRA_COLORE_BIANCO_MASSA,
  TIPOLOGIE_APERTURA_GRIGLIA,
  interpolaPrezzoGriglia,
  isProdottoGriglia,
  messaggioFuoriRangeGriglia,
  prezzoUnitarioConExtraColore,
  type CellaGrigliaPrezzoConTipologia,
  type ExtraColoreGriglia,
  type TipologiaAperturaGriglia,
} from "@/lib/griglia-prezzo";
import type { SupabaseClient } from "@supabase/supabase-js";

type TipoPrezzo = "mq" | "pezzo" | "ml";
type TipoFlag = "fisso" | "percentuale" | "mq";

type Prodotto = {
  id: number;
  categoria_id: number;
  sottocategoria_id: number | null;
  nome: string;
  tipo_prezzo: TipoPrezzo;
  prezzo_unitario: number;
  minimo: number | null;
  posa_prezzo: number | null;
  descrizione_tecnica: string | null;
  descrizione_cliente: string | null;
  regola_prezzo: string | null;
  regola_valore: number | null;
  etichetta_prezzo: string | null;
  ha_vetro: boolean;
  griglia_prezzo_id: number | null;
};

type FlagSupplemento = {
  id: number;
  gruppo_id: number;
  nome: string;
  tipo: TipoFlag;
  valore: number;
};

type GruppoFlag = {
  id: number;
  categoria_id: number;
  sottocategoria_id: number | null;
  nome: string;
  esclusivo: boolean;
  flag_supplementi: FlagSupplemento[];
};

type RigaSalvata = {
  id: number;
  preventivo_id: number;
  prodotto_id: number;
  larghezza_cm: number | null;
  altezza_cm: number | null;
  lunghezza_cm: number | null;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  quantita: number;
  posa: boolean;
  prezzo_riga: number | null;
  posa_importo: number | null;
  posa_tipo: PosaTipo | null;
  posa_manuale: boolean | null;
  posa_riga_separata: boolean | null;
  prezzo_libero: number | null;
  descrizione_tecnica: string | null;
  descrizione_cliente: string | null;
  modalita_mq: string | null;
  mq_diretti: number | null;
  numero_posizione: number | null;
  riferimento_interno: string | null;
  prezzo_inserito: number | null;
  regola_applicata: string | null;
  colore: string | null;
  colore_interno: string | null;
  colore_esterno: string | null;
  colore_ferramenta: string | null;
  vetro: string | null;
  tipologia_apertura: string | null;
  extra_colore_nome: string | null;
  extra_colore_percentuale: number | null;
  prodotti: {
    id: number;
    nome: string;
    tipo_prezzo: TipoPrezzo;
    categoria_id: number;
    sottocategoria_id: number | null;
    prezzo_unitario: number;
    minimo: number | null;
    posa_prezzo: number | null;
    descrizione_tecnica: string | null;
    ha_vetro: boolean;
    regola_prezzo: string | null;
    griglia_prezzo_id: number | null;
  };
  righe_flag: {
    flag_id: number;
    flag_supplementi: { nome: string } | { nome: string }[];
  }[];
};

function etichettaFlag(flag: { tipo: TipoFlag; valore: number }): string {
  if (flag.tipo === "percentuale") return `(+${flag.valore}%)`;
  if (flag.tipo === "mq") return `(+${formatEuro(flag.valore)}/mq)`;
  return `(+${formatEuro(flag.valore)})`;
}

async function fetchRigheCategoria(
  supabase: SupabaseClient,
  preventivoId: string,
  categoriaId: string | number,
  sottocategoriaId: string | null,
): Promise<RigaSalvata[]> {
  let query = supabase
    .from("righe")
    .select(
      `id, preventivo_id, prodotto_id, larghezza_cm, altezza_cm, lunghezza_cm, larghezza_mm, altezza_mm, quantita, posa, prezzo_riga,
      posa_importo, posa_tipo, posa_manuale, posa_riga_separata, prezzo_libero, descrizione_tecnica,
      descrizione_cliente,
      modalita_mq, mq_diretti, numero_posizione, riferimento_interno, prezzo_inserito, regola_applicata,
      colore, colore_interno, colore_esterno, colore_ferramenta, vetro,
      tipologia_apertura, extra_colore_nome, extra_colore_percentuale,
      prodotti!inner(id, nome, tipo_prezzo, categoria_id, sottocategoria_id, prezzo_unitario, minimo, posa_prezzo, descrizione_tecnica, ha_vetro, regola_prezzo, griglia_prezzo_id),
      righe_flag(flag_id, flag_supplementi(nome))`,
    )
    .eq("preventivo_id", preventivoId)
    .eq("prodotti.categoria_id", categoriaId);

  if (sottocategoriaId) {
    query = query.eq("prodotti.sottocategoria_id", Number(sottocategoriaId));
  }

  const { data, error: righeError } = await query;
  if (righeError) throw new Error(righeError.message);

  const righeNormalizzate: RigaSalvata[] = (data ?? []).map((riga) => ({
    ...riga,
    descrizione_cliente: riga.descrizione_cliente ?? null,
    colore: riga.colore ?? null,
    colore_interno: riga.colore_interno ?? null,
    colore_esterno: riga.colore_esterno ?? null,
    colore_ferramenta: riga.colore_ferramenta ?? null,
    vetro: riga.vetro ?? null,
    larghezza_mm: riga.larghezza_mm ?? null,
    altezza_mm: riga.altezza_mm ?? null,
    tipologia_apertura: riga.tipologia_apertura ?? null,
    extra_colore_nome: riga.extra_colore_nome ?? null,
    extra_colore_percentuale:
      riga.extra_colore_percentuale != null
        ? Number(riga.extra_colore_percentuale)
        : null,
    prodotti: {
      ...normalizzaRelazione(riga.prodotti)!,
      ha_vetro: Boolean(normalizzaRelazione(riga.prodotti)!.ha_vetro),
      regola_prezzo: normalizzaRelazione(riga.prodotti)!.regola_prezzo ?? null,
      griglia_prezzo_id:
        normalizzaRelazione(riga.prodotti)!.griglia_prezzo_id ?? null,
    },
    righe_flag: (riga.righe_flag ?? []).map((rf) => ({
      ...rf,
      flag_supplementi: normalizzaRelazione(rf.flag_supplementi)!,
    })),
  }));

  righeNormalizzate.sort((a, b) => {
    const na = a.numero_posizione ?? Number.MAX_SAFE_INTEGER;
    const nb = b.numero_posizione ?? Number.MAX_SAFE_INTEGER;
    if (na !== nb) return na - nb;
    return a.id - b.id;
  });

  return righeNormalizzate;
}

async function fetchTotalePreventivo(
  supabase: SupabaseClient,
  preventivoId: string,
): Promise<number> {
  const { data, error: totaleError } = await supabase
    .from("righe")
    .select("prezzo_riga, posa_importo, posa, posa_riga_separata, tipo_riga")
    .eq("preventivo_id", preventivoId);

  if (totaleError) throw new Error(totaleError.message);

  return (data ?? []).reduce((sum, riga) => {
    if (riga.tipo_riga === "testo") return sum;
    if (riga.tipo_riga === "posa" || riga.posa_riga_separata) {
      return sum + (riga.prezzo_riga ?? 0);
    }
    return (
      sum +
      importoRigaCompleto(
        riga.prezzo_riga,
        riga.posa ? riga.posa_importo : 0,
      )
    );
  }, 0);
}

function buildFlagStateFromIds(
  gruppi: GruppoFlag[],
  flagIds: number[],
): {
  esclusivi: Record<number, string>;
  multipli: Record<number, boolean>;
} {
  const esclusivi: Record<number, string> = {};
  const multipli: Record<number, boolean> = {};

  for (const gruppo of gruppi) {
    if (gruppo.esclusivo) {
      const match = gruppo.flag_supplementi.find((f) => flagIds.includes(f.id));
      if (match) esclusivi[gruppo.id] = String(match.id);
    } else {
      for (const flag of gruppo.flag_supplementi) {
        if (flagIds.includes(flag.id)) multipli[flag.id] = true;
      }
    }
  }

  return { esclusivi, multipli };
}

function parseMisureForm(
  prodotto: Prodotto,
  larghezza: string,
  altezza: string,
  lunghezza: string,
  modalitaMq: ModalitaMq = "misure",
  mqDiretti: string = "",
): {
  valid: boolean;
  larghezzaCm: number | null;
  altezzaCm: number | null;
  lunghezzaCm: number | null;
  mqDirettiNum: number | null;
} {
  if (prodotto.tipo_prezzo === "mq") {
    if (modalitaMq === "diretti") {
      const mqNum = Number(mqDiretti);
      if (!Number.isFinite(mqNum) || mqNum <= 0) {
        return {
          valid: false,
          larghezzaCm: null,
          altezzaCm: null,
          lunghezzaCm: null,
          mqDirettiNum: null,
        };
      }
      return {
        valid: true,
        larghezzaCm: null,
        altezzaCm: null,
        lunghezzaCm: null,
        mqDirettiNum: mqNum,
      };
    }
    const larghezzaNum = Number(larghezza);
    const altezzaNum = Number(altezza);
    if (
      !Number.isFinite(larghezzaNum) ||
      !Number.isFinite(altezzaNum) ||
      larghezzaNum <= 0 ||
      altezzaNum <= 0
    ) {
      return {
        valid: false,
        larghezzaCm: null,
        altezzaCm: null,
        lunghezzaCm: null,
        mqDirettiNum: null,
      };
    }
    return {
      valid: true,
      larghezzaCm: larghezzaNum,
      altezzaCm: altezzaNum,
      lunghezzaCm: null,
      mqDirettiNum: null,
    };
  }

  if (prodotto.tipo_prezzo === "ml") {
    const lunghezzaNum = Number(lunghezza);
    if (!Number.isFinite(lunghezzaNum) || lunghezzaNum <= 0) {
      return {
        valid: false,
        larghezzaCm: null,
        altezzaCm: null,
        lunghezzaCm: null,
        mqDirettiNum: null,
      };
    }
    return {
      valid: true,
      larghezzaCm: null,
      altezzaCm: null,
      lunghezzaCm: lunghezzaNum,
      mqDirettiNum: null,
    };
  }

  return {
    valid: true,
    larghezzaCm: null,
    altezzaCm: null,
    lunghezzaCm: null,
    mqDirettiNum: null,
  };
}

type PosizioneForm = {
  key: string;
  larghezza: string;
  altezza: string;
  lunghezza: string;
  quantita: string;
  /** Solo prodotti griglia (multi-posizione). */
  tipologia_apertura: TipologiaAperturaGriglia | "";
  larghezzaMm: string;
  altezzaMm: string;
};

let posizioneKeySeq = 0;

function creaPosizioneVuota(): PosizioneForm {
  posizioneKeySeq += 1;
  return {
    key: `pos-${posizioneKeySeq}`,
    larghezza: "",
    altezza: "",
    lunghezza: "",
    quantita: "1",
    tipologia_apertura: "",
    larghezzaMm: "",
    altezzaMm: "",
  };
}

function isPosizioneVuota(
  posizione: PosizioneForm,
  tipo: "mq" | "ml" | "griglia",
): boolean {
  const qtyDefault =
    posizione.quantita.trim() === "" || posizione.quantita.trim() === "1";
  if (tipo === "griglia") {
    return (
      !posizione.tipologia_apertura &&
      posizione.larghezzaMm.trim() === "" &&
      posizione.altezzaMm.trim() === "" &&
      qtyDefault
    );
  }
  if (tipo === "ml") {
    return posizione.lunghezza.trim() === "" && qtyDefault;
  }
  return (
    posizione.larghezza.trim() === "" &&
    posizione.altezza.trim() === "" &&
    qtyDefault
  );
}

function parsePosizioneForm(
  prodotto: Prodotto,
  posizione: PosizioneForm,
): ReturnType<typeof parseMisureForm> & { quantitaNum: number } {
  const quantitaNum = Number(posizione.quantita);
  const misure = parseMisureForm(
    prodotto,
    posizione.larghezza,
    posizione.altezza,
    posizione.lunghezza,
    "misure",
    "",
  );
  return {
    ...misure,
    valid: misure.valid && Number.isFinite(quantitaNum) && quantitaNum > 0,
    quantitaNum: Number.isFinite(quantitaNum) ? quantitaNum : 0,
  };
}

function parsePosizioneGriglia(posizione: PosizioneForm): {
  valid: boolean;
  tipologia: TipologiaAperturaGriglia | "";
  larghezzaMm: number;
  altezzaMm: number;
  quantitaNum: number;
} {
  const quantitaNum = Number(posizione.quantita);
  const L = Number(posizione.larghezzaMm);
  const H = Number(posizione.altezzaMm);
  const tipologia = posizione.tipologia_apertura;
  const valid =
    Boolean(tipologia) &&
    Number.isFinite(L) &&
    L > 0 &&
    Number.isFinite(H) &&
    H > 0 &&
    Number.isFinite(quantitaNum) &&
    quantitaNum > 0;
  return {
    valid,
    tipologia,
    larghezzaMm: Number.isFinite(L) ? L : 0,
    altezzaMm: Number.isFinite(H) ? H : 0,
    quantitaNum: Number.isFinite(quantitaNum) ? quantitaNum : 0,
  };
}

function scontoGrigliaPercFromProdotto(
  regolaValore: number | null | undefined,
): number {
  const v = Number(regolaValore);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function calcolaRigaDaMisure(options: {
  prodotto: Prodotto;
  misure: ReturnType<typeof parseMisureForm>;
  quantita: number;
  posa: boolean;
  flags: FlagSupplemento[];
  isPosaAvanzata: boolean;
  nomeCategoria: string | null;
  posaTipo: PosaTipo;
  posaManuale: boolean;
  posaImporto: string;
  prezzoDigitato: string;
  modalitaMq: ModalitaMq;
}): RisultatoCalcoloRiga {
  const digitato = isProdottoPrezzoDigitato(options.prodotto)
    ? Number(options.prezzoDigitato)
    : null;

  const posaUnitariaCalcolo = options.isPosaAvanzata
    ? prezzoPosaUnitario({
        nomeCategoria: options.nomeCategoria,
        posaTipo: options.posaTipo,
        prodottoPosaPrezzo: options.prodotto.posa_prezzo,
      })
    : options.prodotto.posa_prezzo;

  const posaManualeAttiva =
    options.isPosaAvanzata && options.posa && options.posaManuale;
  const posaImportoManualeNum = posaManualeAttiva
    ? Number(options.posaImporto)
    : null;

  return calcolaRigaCompleta({
    prodotto: options.prodotto,
    misure: {
      larghezza_cm: options.misure.larghezzaCm,
      altezza_cm: options.misure.altezzaCm,
      lunghezza_cm: options.misure.lunghezzaCm,
    },
    quantita: options.quantita,
    posa: options.posa,
    flags: options.flags,
    prezzoDigitato: digitato,
    posaInCampoSeparato: options.isPosaAvanzata,
    posaPrezzoUnitario: posaUnitariaCalcolo,
    posaManuale: posaManualeAttiva,
    posaImportoManuale: posaImportoManualeNum,
    modalitaMq:
      options.prodotto.tipo_prezzo === "mq" ? options.modalitaMq : "misure",
    mqDiretti: options.misure.mqDirettiNum,
  });
}

function popolaFormDaRiga(
  riga: RigaSalvata,
  gruppi: GruppoFlag[],
  setters: {
    setProdottoId: (v: string) => void;
    setLarghezza: (v: string) => void;
    setAltezza: (v: string) => void;
    setLunghezza: (v: string) => void;
    setQuantita: (v: string) => void;
    setPosa: (v: boolean) => void;
    setPosaTipo: (v: PosaTipo) => void;
    setPosaManuale: (v: boolean) => void;
    setPosaImporto: (v: string) => void;
    setPosaRigaSeparata: (v: boolean) => void;
    setPrezzoDigitato: (v: string) => void;
    setPrezzoBds: (v: string) => void;
    setModalitaMq: (v: ModalitaMq) => void;
    setMqDiretti: (v: string) => void;
    setRiferimentoInterno: (v: string) => void;
    setDescrizioneCliente: (v: string) => void;
    setColore: (v: string) => void;
    setColoreInterno: (v: string) => void;
    setColoreEsterno: (v: string) => void;
    setColoreFerramenta: (v: string) => void;
    setVetro: (v: string) => void;
    setFlagEsclusivi: (v: Record<number, string>) => void;
    setFlagMultipli: (v: Record<number, boolean>) => void;
  },
  nomeCategoria: string | null = null,
  regolaDefault: ConfigRegolaPrezzo | null = null,
) {
  setters.setProdottoId(String(riga.prodotto_id));
  const modalita = normalizzaModalitaMq(riga.modalita_mq);
  setters.setModalitaMq(modalita);
  setters.setMqDiretti(
    modalita === "diretti" && riga.mq_diretti != null
      ? String(riga.mq_diretti)
      : "",
  );
  setters.setLarghezza(
    riga.larghezza_cm != null ? String(riga.larghezza_cm) : "",
  );
  setters.setAltezza(riga.altezza_cm != null ? String(riga.altezza_cm) : "");
  setters.setLunghezza(
    riga.lunghezza_cm != null ? String(riga.lunghezza_cm) : "",
  );
  setters.setQuantita(String(riga.quantita));
  setters.setPosa(riga.posa);
  setters.setPosaTipo(normalizzaPosaTipo(nomeCategoria, riga.posa_tipo));
  setters.setPosaManuale(riga.posa_manuale ?? false);
  setters.setPosaImporto(
    riga.posa_importo != null ? String(riga.posa_importo) : "",
  );
  setters.setPosaRigaSeparata(riga.posa_riga_separata ?? false);
  setters.setRiferimentoInterno(riga.riferimento_interno ?? "");
  setters.setDescrizioneCliente(
    sanitizeDescrizioneHtml(riga.descrizione_cliente ?? ""),
  );
  if (riga.prodotti.ha_vetro) {
    setters.setColore("");
    setters.setColoreInterno(riga.colore_interno ?? "");
    setters.setColoreEsterno(riga.colore_esterno ?? "");
    setters.setColoreFerramenta(riga.colore_ferramenta ?? "");
    setters.setVetro(riga.vetro ?? "");
  } else {
    setters.setColore(riga.colore ?? "");
    setters.setColoreInterno("");
    setters.setColoreEsterno("");
    setters.setColoreFerramenta("");
    setters.setVetro("");
  }
  if (isProdottoPrezzoDigitato(riga.prodotti)) {
    const regola = regolaDefault?.regola ?? "diretto";
    const valore = regolaDefault?.valore ?? null;
    const inserito = riga.prezzo_inserito ?? riga.prezzo_libero;
    if (inserito != null && Number.isFinite(inserito) && inserito > 0) {
      setters.setPrezzoDigitato(formatImportoCampo(inserito));
      setters.setPrezzoBds(
        formatImportoCampo(applicaRegolaPrezzo(inserito, regola, valore)),
      );
    } else if (riga.prezzo_riga != null && riga.prezzo_riga > 0) {
      const bds = riga.prezzo_riga;
      setters.setPrezzoBds(formatImportoCampo(bds));
      setters.setPrezzoDigitato(
        formatImportoCampo(invertiRegolaPrezzo(bds, regola, valore)),
      );
    } else {
      setters.setPrezzoDigitato("");
      setters.setPrezzoBds("");
    }
  } else {
    setters.setPrezzoDigitato("");
    setters.setPrezzoBds("");
  }

  const flagIds = riga.righe_flag.map((rf) => rf.flag_id);
  const { esclusivi, multipli } = buildFlagStateFromIds(gruppi, flagIds);
  setters.setFlagEsclusivi(esclusivi);
  setters.setFlagMultipli(multipli);
}

function resetCampiProdotto(
  setLarghezza: (v: string) => void,
  setAltezza: (v: string) => void,
  setLunghezza: (v: string) => void,
  setPosa: (v: boolean) => void,
  setFlagEsclusivi: (v: Record<number, string>) => void,
  setFlagMultipli: (v: Record<number, boolean>) => void,
  setPosizioni: (v: PosizioneForm[]) => void,
  posaDefault = false,
) {
  setLarghezza("");
  setAltezza("");
  setLunghezza("");
  setPosa(posaDefault);
  setFlagEsclusivi({});
  setFlagMultipli({});
  setPosizioni([creaPosizioneVuota()]);
}

function TabellaPosizioniMultiple({
  tipo,
  minimo,
  posizioni,
  calcoli,
  totale,
  onChange,
  onAdd,
  onRemove,
  onDuplica,
}: {
  tipo: "mq" | "ml" | "griglia";
  minimo: number | null;
  posizioni: PosizioneForm[];
  calcoli: (RisultatoCalcoloRiga | null)[];
  totale: number | null;
  onChange: (key: string, field: keyof PosizioneForm, value: string) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onDuplica: (key: string) => void;
}) {
  const isMq = tipo === "mq";
  const isGriglia = tipo === "griglia";

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="overflow-x-auto">
        <table
          className={`w-full text-left text-sm ${
            isGriglia ? "min-w-[48rem]" : "min-w-[36rem]"
          }`}
        >
          <thead className="text-brand-muted">
            <tr>
              {isGriglia ? (
                <>
                  <th className="pb-2 pr-2 font-medium">Tipologia apertura</th>
                  <th className="w-28 pb-2 pr-2 font-medium">Larghezza (mm)</th>
                  <th className="w-28 pb-2 pr-2 font-medium">Altezza (mm)</th>
                </>
              ) : isMq ? (
                <>
                  <th className="pb-2 pr-2 font-medium">Larghezza (cm)</th>
                  <th className="pb-2 pr-2 font-medium">Altezza (cm)</th>
                </>
              ) : (
                <th className="pb-2 pr-2 font-medium">Lunghezza (cm)</th>
              )}
              <th className="w-24 pb-2 pr-2 font-medium">Quantità</th>
              <th className="pb-2 pr-2 font-medium">
                {isGriglia ? "Prezzo" : isMq ? "Mq / Prezzo" : "Ml / Prezzo"}
              </th>
              <th className="w-10 pb-2" />
            </tr>
          </thead>
          <tbody>
            {posizioni.map((posizione, index) => {
              const calcolo = calcoli[index];
              const mq =
                isMq && calcolo?.valido ? calcolo.mq : null;
              const ml =
                !isMq &&
                !isGriglia &&
                calcolo?.valido
                  ? (Number(posizione.lunghezza) || 0) / 100
                  : null;
              const sottoMinimo =
                isMq &&
                mq != null &&
                minimo != null &&
                mq < minimo;

              return (
                <tr key={posizione.key} className="align-top">
                  {isGriglia ? (
                    <>
                      <td className="py-1.5 pr-2">
                        <select
                          aria-label={`Tipologia apertura posizione ${index + 1}`}
                          value={posizione.tipologia_apertura}
                          onChange={(e) =>
                            onChange(
                              posizione.key,
                              "tipologia_apertura",
                              e.target.value,
                            )
                          }
                          className={inputControlClass}
                        >
                          <option value="">Seleziona...</option>
                          {TIPOLOGIE_APERTURA_GRIGLIA.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          aria-label={`Larghezza mm posizione ${index + 1}`}
                          value={posizione.larghezzaMm}
                          onChange={(e) =>
                            onChange(
                              posizione.key,
                              "larghezzaMm",
                              e.target.value,
                            )
                          }
                          className={inputControlClass}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          aria-label={`Altezza mm posizione ${index + 1}`}
                          value={posizione.altezzaMm}
                          onChange={(e) =>
                            onChange(
                              posizione.key,
                              "altezzaMm",
                              e.target.value,
                            )
                          }
                          className={inputControlClass}
                        />
                      </td>
                    </>
                  ) : isMq ? (
                    <>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          inputMode="decimal"
                          aria-label={`Larghezza posizione ${index + 1}`}
                          value={posizione.larghezza}
                          onChange={(e) =>
                            onChange(posizione.key, "larghezza", e.target.value)
                          }
                          className={inputControlClass}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          inputMode="decimal"
                          aria-label={`Altezza posizione ${index + 1}`}
                          value={posizione.altezza}
                          onChange={(e) =>
                            onChange(posizione.key, "altezza", e.target.value)
                          }
                          className={inputControlClass}
                        />
                      </td>
                    </>
                  ) : (
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        aria-label={`Lunghezza posizione ${index + 1}`}
                        value={posizione.lunghezza}
                        onChange={(e) =>
                          onChange(posizione.key, "lunghezza", e.target.value)
                        }
                        className={inputControlClass}
                      />
                    </td>
                  )}
                  <td className="py-1.5 pr-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      aria-label={`Quantità posizione ${index + 1}`}
                      value={posizione.quantita}
                      onChange={(e) =>
                        onChange(posizione.key, "quantita", e.target.value)
                      }
                      className={inputControlClass}
                    />
                  </td>
                  <td className="py-1.5 pr-2 text-sm text-brand-muted">
                    {calcolo?.valido ? (
                      <div className="pt-2">
                        {!isGriglia && (
                          <p>
                            {isMq
                              ? `${(mq ?? 0).toLocaleString("it-IT", {
                                  maximumFractionDigits: 4,
                                })} mq`
                              : `${(ml ?? 0).toLocaleString("it-IT", {
                                  maximumFractionDigits: 4,
                                })} ml`}
                            {sottoMinimo && (
                              <> → min. {minimo} mq</>
                            )}
                          </p>
                        )}
                        <p className="font-medium tabular-nums text-brand-navy">
                          {formatEuro(calcolo.totale)}
                        </p>
                      </div>
                    ) : (
                      <span className="pt-2 inline-block">—</span>
                    )}
                  </td>
                  <td className="py-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onDuplica(posizione.key)}
                      aria-label={`Duplica posizione ${index + 1}`}
                      className="min-h-[44px] px-1 text-sm text-brand-navy underline hover:no-underline"
                    >
                      Duplica
                    </button>
                    {posizioni.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemove(posizione.key)}
                        aria-label={`Rimuovi posizione ${index + 1}`}
                        className="min-h-[44px] px-1 text-sm text-brand-danger underline hover:no-underline"
                      >
                        Rimuovi
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="min-h-[44px] text-sm font-medium text-brand-accent underline hover:no-underline"
      >
        + Aggiungi posizione
      </button>
      {totale != null && (
        <p className="text-sm font-medium text-brand-navy">
          Totale posizioni:{" "}
          <span className="tabular-nums text-brand-accent">
            {formatEuro(totale)}
          </span>
        </p>
      )}
    </div>
  );
}

function SezionePosaAvanzata({
  posa,
  setPosa,
  variantiPosa,
  posaTipo,
  setPosaTipo,
  posaUnitario,
  posaAutoCalcolata,
  posaManuale,
  setPosaManuale,
  posaImporto,
  setPosaImporto,
  mostraSceltaVisPosa,
  posaRigaSeparata,
  setPosaRigaSeparata,
}: {
  posa: boolean;
  setPosa: (v: boolean) => void;
  variantiPosa: ConfigVariantiPosa | null;
  posaTipo: PosaTipo;
  setPosaTipo: (v: PosaTipo) => void;
  posaUnitario: number | null;
  posaAutoCalcolata: number | null;
  posaManuale: boolean;
  setPosaManuale: (v: boolean) => void;
  posaImporto: string;
  setPosaImporto: (v: string) => void;
  mostraSceltaVisPosa: boolean;
  posaRigaSeparata: boolean;
  setPosaRigaSeparata: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4 sm:col-span-2">
      <label className="flex min-h-[44px] items-center gap-3">
        <input
          type="checkbox"
          checked={posa}
          onChange={(e) => {
            setPosa(e.target.checked);
            if (!e.target.checked) {
              setPosaManuale(false);
              setPosaImporto("");
            }
          }}
          className="h-5 w-5 rounded border-brand-input-border"
        />
        <span className="text-sm text-brand-text">Includi posa</span>
        {posaUnitario != null && posaUnitario > 0 && (
          <span className="text-sm text-brand-muted">
            ({formatEuro(posaUnitario)}/pz)
          </span>
        )}
      </label>

      {posa && (
        <>
          {variantiPosa && (
            <div className="space-y-2">
              <span className="text-sm text-brand-label">
                {variantiPosa.titoloScelta}
              </span>
              <div className="flex flex-wrap gap-4">
                {variantiPosa.varianti.map((variante) => (
                  <label
                    key={variante.tipo}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="radio"
                      name="posa-tipo"
                      checked={posaTipo === variante.tipo}
                      onChange={() => setPosaTipo(variante.tipo)}
                      className="h-4 w-4 border-brand-input-border"
                    />
                    <span className="text-sm text-brand-text">
                      {variante.etichetta} (
                      {formatEuro(variante.prezzoUnitario)})
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex max-w-xs flex-col gap-1.5">
            <span className="text-sm text-brand-label">Importo posa</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={posaImporto}
              readOnly={!posaManuale}
              onChange={(e) => setPosaImporto(e.target.value)}
              className={`${inputControlClass} ${
                posaManuale ? "" : "bg-brand-surface text-brand-muted"
              }`}
            />
            {posaAutoCalcolata != null && !posaManuale && (
              <span className="text-xs text-brand-muted">
                Calcolato: quantità × {formatEuro(posaUnitario ?? 0)}
              </span>
            )}
          </div>

          <label className="flex min-h-[44px] items-center gap-2">
            <input
              type="checkbox"
              checked={posaManuale}
              onChange={(e) => {
                const attivo = e.target.checked;
                setPosaManuale(attivo);
                if (posaAutoCalcolata != null) {
                  setPosaImporto(String(posaAutoCalcolata));
                }
              }}
              className="h-4 w-4 rounded border-brand-input-border"
            />
            <span className="text-sm text-brand-text">
              Posa calcolata manuale
            </span>
          </label>

          {mostraSceltaVisPosa && (
            <div className="space-y-2">
              <span className="text-sm text-brand-label">Visualizzazione</span>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="posa-vis"
                    checked={!posaRigaSeparata}
                    onChange={() => setPosaRigaSeparata(false)}
                    className="h-4 w-4 border-brand-input-border"
                  />
                  <span className="text-sm text-brand-text">
                    Posa inclusa nella riga prodotto
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="posa-vis"
                    checked={posaRigaSeparata}
                    onChange={() => setPosaRigaSeparata(true)}
                    className="h-4 w-4 border-brand-input-border"
                  />
                  <span className="text-sm text-brand-text">
                    Posa come riga separata
                  </span>
                </label>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function PreventivoCategoriaFormPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-4xl px-6 py-10">
          <p className="text-zinc-600">Caricamento...</p>
        </main>
      }
    >
      <PreventivoCategoriaForm />
    </Suspense>
  );
}

function percorsoFormCategoria(
  preventivoId: string,
  categoriaId: string,
  sottocategoriaId: string | null,
) {
  if (sottocategoriaId) {
    return `/preventivo/${preventivoId}/categoria/${categoriaId}/sottocategoria/${sottocategoriaId}`;
  }
  return `/preventivo/${preventivoId}/categoria/${categoriaId}`;
}

function PreventivoCategoriaForm() {
  const params = useParams<{ id: string; catId: string; subId?: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const preventivoId = params.id;
  const categoriaId = params.catId;
  const sottocategoriaId = params.subId ?? null;
  const rigaDaUrl = searchParams.get("riga");

  const [riferimento, setRiferimento] = useState<string | null>(null);
  const [clienteNomePreventivo, setClienteNomePreventivo] = useState<
    string | null
  >(null);
  const [nomeCategoria, setNomeCategoria] = useState<string | null>(null);
  const [nomeSottocategoria, setNomeSottocategoria] = useState<string | null>(
    null,
  );
  const [prodotti, setProdotti] = useState<Prodotto[]>([]);
  const [gruppiFlag, setGruppiFlag] = useState<GruppoFlag[]>([]);
  const [righe, setRighe] = useState<RigaSalvata[]>([]);
  const [editingRigaId, setEditingRigaId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [totalePreventivo, setTotalePreventivo] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [ricercaProdotto, setRicercaProdotto] = useState("");
  const [elencoProdottiAperto, setElencoProdottiAperto] = useState(false);
  const prodottoComboboxRef = useRef<HTMLDivElement>(null);

  const [prodottoId, setProdottoId] = useState("");
  const [larghezza, setLarghezza] = useState("");
  const [altezza, setAltezza] = useState("");
  const [lunghezza, setLunghezza] = useState("");
  const [quantita, setQuantita] = useState("1");
  const [posa, setPosa] = useState(false);
  const [posaTipo, setPosaTipo] = useState<PosaTipo>("ristrutturazione");
  const [posaManuale, setPosaManuale] = useState(false);
  const [posaImporto, setPosaImporto] = useState("");
  const [posaRigaSeparata, setPosaRigaSeparata] = useState(false);
  const [prezzoDigitato, setPrezzoDigitato] = useState("");
  const [prezzoBds, setPrezzoBds] = useState("");
  const [modalitaMq, setModalitaMq] = useState<ModalitaMq>("misure");
  const [mqDiretti, setMqDiretti] = useState("");
  const [riferimentoInterno, setRiferimentoInterno] = useState("");
  const [descrizioneCliente, setDescrizioneCliente] = useState("");
  const [colore, setColore] = useState("");
  const [coloreInterno, setColoreInterno] = useState("");
  const [coloreEsterno, setColoreEsterno] = useState("");
  const [coloreFerramenta, setColoreFerramenta] = useState("");
  const [vetro, setVetro] = useState("");
  const [tipologiaApertura, setTipologiaApertura] = useState<
    TipologiaAperturaGriglia | ""
  >("");
  const [larghezzaMm, setLarghezzaMm] = useState("");
  const [altezzaMm, setAltezzaMm] = useState("");
  const [extraColoreNome, setExtraColoreNome] = useState<string>(
    EXTRA_COLORE_BIANCO_MASSA.nome,
  );
  const [extraColorePercentuale, setExtraColorePercentuale] = useState(0);
  const [celleGriglia, setCelleGriglia] = useState<
    CellaGrigliaPrezzoConTipologia[]
  >([]);
  const [extraColoriGriglia, setExtraColoriGriglia] = useState<
    ExtraColoreGriglia[]
  >([]);
  const [opzioniColore, setOpzioniColore] = useState<string[]>([]);
  const [opzioniVetro, setOpzioniVetro] = useState<string[]>([]);
  const [posizioni, setPosizioni] = useState<PosizioneForm[]>(() => [
    creaPosizioneVuota(),
  ]);
  const [flagEsclusivi, setFlagEsclusivi] = useState<Record<number, string>>(
    {},
  );
  const [flagMultipli, setFlagMultipli] = useState<Record<number, boolean>>({});

  const isModifica = editingRigaId !== null;
  const isPosaAvanzata = isCategoriaPosaAvanzata(nomeCategoria);
  const isCoibentazione =
    (nomeCategoria ?? "").trim().toLowerCase() === "coibentazione";
  const variantiPosa = configVariantiPosa(nomeCategoria);
  const mostraSceltaVisPosa = haSceltaVisualizzazionePosa(nomeCategoria);

  const formSporco = Boolean(
    editingRigaId ||
      prodottoId ||
      larghezza.trim() ||
      altezza.trim() ||
      lunghezza.trim() ||
      larghezzaMm.trim() ||
      altezzaMm.trim() ||
      tipologiaApertura ||
      (extraColoreNome !== EXTRA_COLORE_BIANCO_MASSA.nome) ||
      prezzoDigitato.trim() ||
      prezzoBds.trim() ||
      mqDiretti.trim() ||
      riferimentoInterno.trim() ||
      colore.trim() ||
      coloreInterno.trim() ||
      coloreEsterno.trim() ||
      coloreFerramenta.trim() ||
      vetro.trim() ||
      Object.keys(flagEsclusivi).length > 0 ||
      Object.values(flagMultipli).some(Boolean) ||
      posizioni.some(
        (p) =>
          p.larghezza.trim() ||
          p.altezza.trim() ||
          p.lunghezza.trim() ||
          p.tipologia_apertura ||
          p.larghezzaMm.trim() ||
          p.altezzaMm.trim() ||
          (p.quantita.trim() !== "" && p.quantita.trim() !== "1"),
      ),
  );
  useUnsavedChanges(formSporco && !saving);

  useEffect(() => {
    if (isModifica || !nomeCategoria) return;
    setPosaTipo(posaTipoDefault(nomeCategoria));
  }, [nomeCategoria, isModifica]);

  const formSetters = {
    setProdottoId,
    setLarghezza,
    setAltezza,
    setLunghezza,
    setQuantita,
    setPosa,
    setPosaTipo,
    setPosaManuale,
    setPosaImporto,
    setPosaRigaSeparata,
    setPrezzoDigitato,
    setPrezzoBds,
    setModalitaMq,
    setMqDiretti,
    setRiferimentoInterno,
    setDescrizioneCliente,
    setColore,
    setColoreInterno,
    setColoreEsterno,
    setColoreFerramenta,
    setVetro,
    setFlagEsclusivi,
    setFlagMultipli,
  };

  const prodottoSelezionato = useMemo(
    () => prodotti.find((p) => String(p.id) === prodottoId),
    [prodotti, prodottoId],
  );

  const mostraCampoColore =
    !isCoibentazione && !prodottoSelezionato?.ha_vetro;

  const isGriglia = Boolean(
    prodottoSelezionato && isProdottoGriglia(prodottoSelezionato),
  );

  /** Carica tutte le celle + extra colore della griglia (filtro tipologia a calcolo). */
  useEffect(() => {
    if (!prodottoSelezionato || !isProdottoGriglia(prodottoSelezionato)) {
      setCelleGriglia([]);
      setExtraColoriGriglia([]);
      return;
    }
    const grigliaId = Number(prodottoSelezionato.griglia_prezzo_id);
    let cancelled = false;
    const supabase = createSupabaseClient();

    void (async () => {
      const [extraResult, celleResult] = await Promise.all([
        supabase
          .from("griglie_prezzo_extra_colore")
          .select("nome, percentuale")
          .eq("griglia_id", grigliaId)
          .order("percentuale"),
        supabase
          .from("griglie_prezzo_celle")
          .select("tipologia_apertura, larghezza, altezza, prezzo")
          .eq("griglia_id", grigliaId),
      ]);
      if (cancelled) return;

      if (extraResult.error) {
        console.warn("griglie_prezzo_extra_colore:", extraResult.error.message);
        setExtraColoriGriglia([]);
      } else {
        setExtraColoriGriglia(
          (extraResult.data ?? []).map((e) => ({
            nome: String(e.nome),
            percentuale: Number(e.percentuale) || 0,
          })),
        );
      }

      if (celleResult.error) {
        console.warn("griglie_prezzo_celle:", celleResult.error.message);
        setCelleGriglia([]);
        setError(
          `Impossibile leggere il listino griglia: ${celleResult.error.message}. Verifica le policy RLS (script fix-rls-griglie-prezzo.sql).`,
        );
        return;
      }

      const celle = (celleResult.data ?? []).map((c) => ({
        tipologia_apertura: String(c.tipologia_apertura ?? ""),
        larghezza: Number(c.larghezza),
        altezza: Number(c.altezza),
        prezzo: Number(c.prezzo),
      }));
      setCelleGriglia(celle);
      if (celle.length === 0) {
        setError(
          "Listino griglia non caricabile (0 celle). Esegui lo script RLS fix-rls-griglie-prezzo.sql su Supabase.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [prodottoSelezionato]);

  const cellePerTipologia = useCallback(
    (tipologia: string) =>
      celleGriglia
        .filter((c) => c.tipologia_apertura === tipologia)
        .map(({ larghezza, altezza, prezzo }) => ({
          larghezza,
          altezza,
          prezzo,
        })),
    [celleGriglia],
  );

  const calcolaPrezzoBdsGrigliaPosizione = useCallback(
    (
      tipologia: string,
      L: number,
      H: number,
    ): {
      listino: number | null;
      bds: number | null;
      errore: string | null;
      risultato: ReturnType<typeof interpolaPrezzoGriglia> | null;
    } => {
      const celle = cellePerTipologia(tipologia);
      const risultato = interpolaPrezzoGriglia(celle, L, H);
      if (!risultato.ok) {
        return {
          listino: null,
          bds: null,
          errore:
            risultato.motivo === "nessuna_cella"
              ? "Listino griglia non disponibile per questa tipologia."
              : messaggioFuoriRangeGriglia(risultato),
          risultato,
        };
      }
      const listino = prezzoUnitarioConExtraColore(
        risultato.prezzoBase,
        extraColorePercentuale,
      );
      const bds = applicaRegolaPrezzo(
        listino,
        "sconto_listino",
        scontoGrigliaPercFromProdotto(prodottoSelezionato?.regola_valore),
      );
      return { listino, bds, errore: null, risultato };
    },
    [
      cellePerTipologia,
      extraColorePercentuale,
      prodottoSelezionato?.regola_valore,
    ],
  );

  /** Risultato griglia in modifica (singola posizione). */
  const risultatoGriglia = useMemo(() => {
    if (!isGriglia || !tipologiaApertura) return null;
    const L = Number(larghezzaMm);
    const H = Number(altezzaMm);
    if (!Number.isFinite(L) || !Number.isFinite(H) || L <= 0 || H <= 0) {
      return null;
    }
    return interpolaPrezzoGriglia(cellePerTipologia(tipologiaApertura), L, H);
  }, [isGriglia, tipologiaApertura, larghezzaMm, altezzaMm, cellePerTipologia]);

  /** Listino da griglia (interpolato + extra colore), prima dello sconto BDS. */
  const listinoGriglia = useMemo(() => {
    if (!risultatoGriglia || !risultatoGriglia.ok) return null;
    return prezzoUnitarioConExtraColore(
      risultatoGriglia.prezzoBase,
      extraColorePercentuale,
    );
  }, [risultatoGriglia, extraColorePercentuale]);

  const scontoGrigliaPerc = useMemo(
    () => scontoGrigliaPercFromProdotto(prodottoSelezionato?.regola_valore),
    [prodottoSelezionato],
  );

  /** Prezzo BDS unitario: listino griglia × (1 − regola_valore/100). */
  const prezzoUnitarioGriglia = useMemo(() => {
    if (listinoGriglia == null || listinoGriglia <= 0) return null;
    return applicaRegolaPrezzo(
      listinoGriglia,
      "sconto_listino",
      scontoGrigliaPerc,
    );
  }, [listinoGriglia, scontoGrigliaPerc]);

  const spiegazioneGriglia = useMemo(() => {
    if (listinoGriglia == null) return null;
    return spiegazionePrezzoGriglia(listinoGriglia, scontoGrigliaPerc);
  }, [listinoGriglia, scontoGrigliaPerc]);

  const erroreGriglia =
    isGriglia &&
    tipologiaApertura &&
    Number(larghezzaMm) > 0 &&
    Number(altezzaMm) > 0 &&
    risultatoGriglia &&
    !risultatoGriglia.ok
      ? risultatoGriglia.motivo === "nessuna_cella"
        ? "Listino griglia non caricabile (0 celle). Esegui lo script RLS fix-rls-griglie-prezzo.sql su Supabase."
        : messaggioFuoriRangeGriglia(risultatoGriglia)
      : null;

  /** Regola BDS dal prodotto selezionato (solo prezzo digitato). */
  const regolaDefault = useMemo((): ConfigRegolaPrezzo | null => {
    if (!prodottoSelezionato || !isProdottoPrezzoDigitato(prodottoSelezionato)) {
      return null;
    }
    return configRegolaPrezzoDa(prodottoSelezionato);
  }, [prodottoSelezionato]);

  const prezzoInseritoNum = useMemo(() => {
    const n = Number(prezzoDigitato);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [prezzoDigitato]);

  /** BDS digitato/calcolato: è la base per prezzo_riga. */
  const prezzoBdsPerCalcolo = useMemo(() => {
    const n = Number(prezzoBds);
    if (!Number.isFinite(n) || n <= 0) return "";
    return String(n);
  }, [prezzoBds]);

  const spiegazionePrezzo = useMemo(() => {
    if (!regolaDefault || prezzoInseritoNum == null) return null;
    return spiegazioneRegolaPrezzo(
      prezzoInseritoNum,
      regolaDefault.regola,
      regolaDefault.valore,
    );
  }, [regolaDefault, prezzoInseritoNum]);

  /** Digita in A (fornitore) → ricalcola B. Nessun effect a catena. */
  function handleChangePrezzoInserito(raw: string) {
    setPrezzoDigitato(raw);
    if (!regolaDefault) {
      setPrezzoBds("");
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setPrezzoBds("");
      return;
    }
    setPrezzoBds(
      formatImportoCampo(
        applicaRegolaPrezzo(n, regolaDefault.regola, regolaDefault.valore),
      ),
    );
  }

  /** Digita in B (BDS) → ricalcola A all'inverso. */
  function handleChangePrezzoBds(raw: string) {
    setPrezzoBds(raw);
    if (!regolaDefault) {
      setPrezzoDigitato("");
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setPrezzoDigitato("");
      return;
    }
    setPrezzoDigitato(
      formatImportoCampo(
        invertiRegolaPrezzo(n, regolaDefault.regola, regolaDefault.valore),
      ),
    );
  }

  const prodottiFiltrati = useMemo(() => {
    const query = ricercaProdotto.trim().toLowerCase();
    if (!query) return prodotti;
    return prodotti.filter((p) => p.nome.toLowerCase().includes(query));
  }, [prodotti, ricercaProdotto]);

  /** Con prodotto già selezionato e testo = nome, al clic mostra l'elenco completo. */
  const prodottiInElenco = useMemo(() => {
    if (
      prodottoSelezionato &&
      ricercaProdotto.trim() === prodottoSelezionato.nome
    ) {
      return prodotti;
    }
    return prodottiFiltrati;
  }, [prodottoSelezionato, ricercaProdotto, prodotti, prodottiFiltrati]);

  useEffect(() => {
    if (!elencoProdottiAperto) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        prodottoComboboxRef.current &&
        !prodottoComboboxRef.current.contains(event.target as Node)
      ) {
        setElencoProdottiAperto(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [elencoProdottiAperto]);

  const flagAttivi = useMemo(() => {
    const attivi: FlagSupplemento[] = [];

    for (const gruppo of gruppiFlag) {
      if (gruppo.esclusivo) {
        const selectedId = flagEsclusivi[gruppo.id];
        if (selectedId) {
          const flag = gruppo.flag_supplementi.find(
            (f) => String(f.id) === selectedId,
          );
          if (flag) attivi.push(flag);
        }
      } else {
        for (const flag of gruppo.flag_supplementi) {
          if (flagMultipli[flag.id]) attivi.push(flag);
        }
      }
    }

    return attivi;
  }, [gruppiFlag, flagEsclusivi, flagMultipli]);

  const loadRighe = useCallback(async () => {
    const supabase = createSupabaseClient();
    const righeNormalizzate = await fetchRigheCategoria(
      supabase,
      preventivoId,
      categoriaId,
      sottocategoriaId,
    );
    setRighe(righeNormalizzate);
    return righeNormalizzate;
  }, [preventivoId, categoriaId, sottocategoriaId]);

  const loadTotalePreventivo = useCallback(async () => {
    const supabase = createSupabaseClient();
    const totale = await fetchTotalePreventivo(supabase, preventivoId);
    setTotalePreventivo(totale);
    return totale;
  }, [preventivoId]);

  const refreshTotali = useCallback(async () => {
    const supabase = createSupabaseClient();
    try {
      await pulisciRighePosaPreventivo(supabase, preventivoId);
    } catch {
      /* ignore */
    }
    await Promise.all([loadRighe(), loadTotalePreventivo()]);
  }, [loadRighe, loadTotalePreventivo, preventivoId]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      const supabase = createSupabaseClient();

      try {
        try {
          await pulisciRighePosaPreventivo(supabase, preventivoId);
        } catch {
          /* ignore */
        }

        let prodottiQuery = supabase
          .from("prodotti")
          .select(
            "id, categoria_id, sottocategoria_id, nome, tipo_prezzo, prezzo_unitario, minimo, posa_prezzo, descrizione_tecnica, descrizione_cliente, regola_prezzo, regola_valore, etichetta_prezzo, ha_vetro, griglia_prezzo_id",
          )
          .eq("categoria_id", categoriaId)
          .order("nome");

        if (sottocategoriaId) {
          prodottiQuery = prodottiQuery.eq(
            "sottocategoria_id",
            sottocategoriaId,
          );
        }

        let gruppiQuery = supabase
          .from("gruppi_flag")
          .select(
            "id, categoria_id, sottocategoria_id, nome, esclusivo, flag_supplementi(id, gruppo_id, nome, tipo, valore)",
          )
          .eq("categoria_id", categoriaId)
          .order("nome");

        if (sottocategoriaId) {
          gruppiQuery = gruppiQuery.eq("sottocategoria_id", sottocategoriaId);
        } else {
          gruppiQuery = gruppiQuery.is("sottocategoria_id", null);
        }

        const [
          preventivoResult,
          categoriaResult,
          sottocategoriaResult,
          prodottiResult,
          gruppiResult,
          coloreResult,
          vetroResult,
          righeCaricate,
          totale,
        ] = await Promise.all([
          supabase
            .from("preventivi")
            .select("riferimento, cliente_nome")
            .eq("id", preventivoId)
            .single(),
          supabase
            .from("categorie")
            .select("nome")
            .eq("id", categoriaId)
            .single(),
          sottocategoriaId
            ? supabase
                .from("sottocategorie")
                .select("id, nome, categoria_id")
                .eq("id", sottocategoriaId)
                .eq("categoria_id", categoriaId)
                .single()
            : Promise.resolve({ data: null, error: null }),
          prodottiQuery,
          gruppiQuery,
          supabase
            .from("opzioni_colore")
            .select("valore, ordine")
            .order("ordine"),
          supabase
            .from("opzioni_vetro")
            .select("valore, ordine")
            .order("ordine"),
          fetchRigheCategoria(
            supabase,
            preventivoId,
            categoriaId,
            sottocategoriaId,
          ),
          fetchTotalePreventivo(supabase, preventivoId),
        ]);

        if (preventivoResult.error) throw new Error(preventivoResult.error.message);
        if (categoriaResult.error) throw new Error(categoriaResult.error.message);
        if (sottocategoriaResult.error) {
          throw new Error(sottocategoriaResult.error.message);
        }
        if (prodottiResult.error) throw new Error(prodottiResult.error.message);
        if (gruppiResult.error) throw new Error(gruppiResult.error.message);
        // Opzioni colore/vetro: non bloccanti (tabelle possono mancare in ambienti non migrati)
        if (coloreResult.error) {
          console.warn("opzioni_colore:", coloreResult.error.message);
        }
        if (vetroResult.error) {
          console.warn("opzioni_vetro:", vetroResult.error.message);
        }

        const gruppiNormalizzati: GruppoFlag[] = (gruppiResult.data ?? []).map(
          (gruppo) => ({
            ...gruppo,
            flag_supplementi: (gruppo.flag_supplementi ?? []).map(
              (flag: FlagSupplemento) => flag,
            ),
          }),
        );

        const prodottiNormalizzati: Prodotto[] = (prodottiResult.data ?? []).map(
          (p) => ({
            ...(p as Prodotto),
            descrizione_cliente: p.descrizione_cliente ?? null,
            regola_prezzo: p.regola_prezzo ?? null,
            regola_valore:
              p.regola_valore != null ? Number(p.regola_valore) : null,
            etichetta_prezzo: p.etichetta_prezzo ?? null,
            ha_vetro: Boolean(p.ha_vetro),
            griglia_prezzo_id:
              p.griglia_prezzo_id != null ? Number(p.griglia_prezzo_id) : null,
          }),
        );

        setRiferimento(preventivoResult.data.riferimento);
        setClienteNomePreventivo(preventivoResult.data.cliente_nome ?? null);
        setNomeCategoria(categoriaResult.data.nome);
        setNomeSottocategoria(sottocategoriaResult.data?.nome ?? null);
        setProdotti(prodottiNormalizzati);
        setGruppiFlag(gruppiNormalizzati);
        setOpzioniColore(
          coloreResult.error
            ? []
            : (coloreResult.data ?? [])
                .map((r) => String(r.valore ?? "").trim())
                .filter(Boolean),
        );
        setOpzioniVetro(
          vetroResult.error
            ? []
            : (vetroResult.data ?? [])
                .map((r) => String(r.valore ?? "").trim())
                .filter(Boolean),
        );
        setRighe(righeCaricate);
        setTotalePreventivo(totale);

        if (rigaDaUrl) {
          const riga = righeCaricate.find((r) => String(r.id) === rigaDaUrl);
          if (riga) {
            const prodottoRiga = prodottiNormalizzati.find(
              (p) => p.id === riga.prodotto_id,
            );
            setEditingRigaId(riga.id);
            popolaFormDaRiga(
              riga,
              gruppiNormalizzati,
              formSetters,
              categoriaResult.data.nome,
              prodottoRiga ? configRegolaPrezzoDa(prodottoRiga) : null,
            );
            setTipologiaApertura(
              (riga.tipologia_apertura as TipologiaAperturaGriglia) || "",
            );
            setLarghezzaMm(
              riga.larghezza_mm != null ? String(riga.larghezza_mm) : "",
            );
            setAltezzaMm(
              riga.altezza_mm != null ? String(riga.altezza_mm) : "",
            );
            setExtraColoreNome(
              riga.extra_colore_nome?.trim() || EXTRA_COLORE_BIANCO_MASSA.nome,
            );
            setExtraColorePercentuale(
              riga.extra_colore_percentuale != null
                ? Number(riga.extra_colore_percentuale)
                : 0,
            );
            setRicercaProdotto(riga.prodotti.nome);
          }
        } else if (prodottiNormalizzati.length === 1) {
          const solo = prodottiNormalizzati[0];
          setProdottoId(String(solo.id));
          setRicercaProdotto(solo.nome);
          setDescrizioneCliente(
            sanitizeDescrizioneHtml(solo.descrizione_cliente ?? ""),
          );
          if (isCategoriaPosaAvanzata(categoriaResult.data.nome)) {
            setPosa(true);
          }
        } else if (isCategoriaPosaAvanzata(categoriaResult.data.nome)) {
          setPosa(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore sconosciuto");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [preventivoId, categoriaId, sottocategoriaId, rigaDaUrl]);

  const tipoTabella: "mq" | "ml" | "griglia" | null =
    !isModifica && prodottoSelezionato
      ? isProdottoGriglia(prodottoSelezionato)
        ? "griglia"
        : prodottoSelezionato.tipo_prezzo === "mq" && modalitaMq === "misure"
          ? "mq"
          : prodottoSelezionato.tipo_prezzo === "ml"
            ? "ml"
            : null
      : null;
  const usaTabellaPosizioni = tipoTabella != null;

  const calcolo = useMemo(() => {
    if (!prodottoSelezionato || usaTabellaPosizioni) return null;

    const quantitaNum = Number(quantita);
    if (!Number.isFinite(quantitaNum) || quantitaNum <= 0) return null;

    if (isProdottoGriglia(prodottoSelezionato)) {
      if (prezzoUnitarioGriglia == null || prezzoUnitarioGriglia <= 0) {
        return null;
      }
      const misure = parseMisureForm(
        prodottoSelezionato,
        larghezza,
        altezza,
        lunghezza,
        modalitaMq,
        mqDiretti,
      );
      return calcolaRigaDaMisure({
        prodotto: {
          ...prodottoSelezionato,
          prezzo_unitario: prezzoUnitarioGriglia,
        },
        misure,
        quantita: quantitaNum,
        posa,
        flags: flagAttivi,
        isPosaAvanzata,
        nomeCategoria,
        posaTipo,
        posaManuale,
        posaImporto,
        prezzoDigitato: "",
        modalitaMq,
      });
    }

    const misure = parseMisureForm(
      prodottoSelezionato,
      larghezza,
      altezza,
      lunghezza,
      modalitaMq,
      mqDiretti,
    );
    if (!misure.valid) return null;

    return calcolaRigaDaMisure({
      prodotto: prodottoSelezionato,
      misure,
      quantita: quantitaNum,
      posa,
      flags: flagAttivi,
      isPosaAvanzata,
      nomeCategoria,
      posaTipo,
      posaManuale,
      posaImporto,
      prezzoDigitato: prezzoBdsPerCalcolo,
      modalitaMq,
    });
  }, [
    prodottoSelezionato,
    usaTabellaPosizioni,
    larghezza,
    altezza,
    lunghezza,
    quantita,
    posa,
    flagAttivi,
    isPosaAvanzata,
    prezzoBdsPerCalcolo,
    prezzoUnitarioGriglia,
    nomeCategoria,
    posaTipo,
    posaManuale,
    posaImporto,
    modalitaMq,
    mqDiretti,
  ]);

  const calcoliPosizioni = useMemo(() => {
    if (!prodottoSelezionato || !tipoTabella) return [];
    return posizioni.map((posizione) => {
      if (tipoTabella === "griglia") {
        const parsed = parsePosizioneGriglia(posizione);
        if (!parsed.valid || !parsed.tipologia) return null;
        const { bds, errore } = calcolaPrezzoBdsGrigliaPosizione(
          parsed.tipologia,
          parsed.larghezzaMm,
          parsed.altezzaMm,
        );
        if (errore || bds == null || bds <= 0) return null;
        return calcolaRigaDaMisure({
          prodotto: {
            ...prodottoSelezionato,
            prezzo_unitario: bds,
          },
          misure: {
            valid: true,
            larghezzaCm: null,
            altezzaCm: null,
            lunghezzaCm: null,
            mqDirettiNum: null,
          },
          quantita: parsed.quantitaNum,
          posa,
          flags: flagAttivi,
          isPosaAvanzata,
          nomeCategoria,
          posaTipo,
          posaManuale,
          posaImporto,
          prezzoDigitato: "",
          modalitaMq: "misure",
        });
      }
      const parsed = parsePosizioneForm(prodottoSelezionato, posizione);
      if (!parsed.valid) return null;
      return calcolaRigaDaMisure({
        prodotto: prodottoSelezionato,
        misure: parsed,
        quantita: parsed.quantitaNum,
        posa,
        flags: flagAttivi,
        isPosaAvanzata,
        nomeCategoria,
        posaTipo,
        posaManuale,
        posaImporto,
        prezzoDigitato: prezzoBdsPerCalcolo,
        modalitaMq: "misure",
      });
    });
  }, [
    prodottoSelezionato,
    tipoTabella,
    posizioni,
    posa,
    flagAttivi,
    isPosaAvanzata,
    nomeCategoria,
    posaTipo,
    posaManuale,
    posaImporto,
    prezzoBdsPerCalcolo,
    calcolaPrezzoBdsGrigliaPosizione,
  ]);

  const posizioniValide = useMemo(() => {
    if (!prodottoSelezionato || !tipoTabella) return [];
    return posizioni.flatMap((posizione, index) => {
      const calcoloPos = calcoliPosizioni[index];
      if (!calcoloPos?.valido) return [];
      return [{ posizione, calcolo: calcoloPos }];
    });
  }, [prodottoSelezionato, tipoTabella, posizioni, calcoliPosizioni]);

  const haPosizioniIncomplete =
    tipoTabella != null &&
    posizioni.some(
      (posizione, index) =>
        !isPosizioneVuota(posizione, tipoTabella) &&
        calcoliPosizioni[index]?.valido !== true,
    );

  const prezzoAnteprima = usaTabellaPosizioni
    ? posizioniValide.length > 0
      ? posizioniValide.reduce((sum, p) => sum + p.calcolo.prezzo_riga, 0)
      : null
    : calcolo?.valido === true
      ? calcolo.prezzo_riga
      : null;
  const posaAnteprimaNum = usaTabellaPosizioni
    ? isPosaAvanzata && posa
      ? posizioniValide.reduce((sum, p) => sum + p.calcolo.posa_importo, 0)
      : 0
    : calcolo?.valido === true && isPosaAvanzata && posa
      ? calcolo.posa_importo
      : 0;
  const totaleAnteprima = usaTabellaPosizioni
    ? posizioniValide.length > 0
      ? posizioniValide.reduce((sum, p) => sum + p.calcolo.totale, 0)
      : null
    : calcolo?.valido === true
      ? calcolo.totale
      : null;

  const mqRiga = useMemo(() => {
    if (prodottoSelezionato?.tipo_prezzo !== "mq") return null;
    if (usaTabellaPosizioni) return null;
    if (modalitaMq === "diretti") {
      const n = Number(mqDiretti);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    const misure = parseMisureForm(
      prodottoSelezionato,
      larghezza,
      altezza,
      lunghezza,
      "misure",
      "",
    );
    if (!misure.valid) return null;
    return mqCalcolati(misure.larghezzaCm, misure.altezzaCm);
  }, [
    prodottoSelezionato,
    usaTabellaPosizioni,
    larghezza,
    altezza,
    lunghezza,
    modalitaMq,
    mqDiretti,
  ]);

  const posaUnitario = useMemo(() => {
    if (!isPosaAvanzata) return null;
    return prezzoPosaUnitario({
      nomeCategoria,
      posaTipo,
      prodottoPosaPrezzo: prodottoSelezionato?.posa_prezzo,
    });
  }, [isPosaAvanzata, nomeCategoria, posaTipo, prodottoSelezionato]);

  const posaAutoCalcolata =
    isPosaAvanzata && posa && !posaManuale
      ? usaTabellaPosizioni
        ? posizioniValide.length > 0
          ? posizioniValide.reduce((sum, p) => sum + p.calcolo.posa_importo, 0)
          : null
        : calcolo?.valido === true
          ? calcolo.posa_importo
          : null
      : null;

  const posaImportoMostrato = posaManuale
    ? posaImporto
    : posaAutoCalcolata != null
      ? String(posaAutoCalcolata)
      : "";

  const totaleCategoria = useMemo(
    () =>
      righe.reduce(
        (sum, riga) =>
          sum +
          importoRigaCompleto(
            riga.prezzo_riga,
            riga.posa ? riga.posa_importo : 0,
          ),
        0,
      ),
    [righe],
  );

  function resetForm() {
    setProdottoId("");
    setRicercaProdotto("");
    setElencoProdottiAperto(false);
    setLarghezza("");
    setAltezza("");
    setLunghezza("");
    setQuantita("1");
    setPosa(isPosaAvanzata);
    setPosaTipo(posaTipoDefault(nomeCategoria));
    setPosaManuale(false);
    setPosaImporto("");
    setPosaRigaSeparata(false);
    setPrezzoDigitato("");
    setPrezzoBds("");
    setModalitaMq("misure");
    setMqDiretti("");
    setRiferimentoInterno("");
    setDescrizioneCliente("");
    setColore("");
    setColoreInterno("");
    setColoreEsterno("");
    setColoreFerramenta("");
    setVetro("");
    setTipologiaApertura("");
    setLarghezzaMm("");
    setAltezzaMm("");
    setExtraColoreNome(EXTRA_COLORE_BIANCO_MASSA.nome);
    setExtraColorePercentuale(0);
    setCelleGriglia([]);
    setExtraColoriGriglia([]);
    setPosizioni([creaPosizioneVuota()]);
    setFlagEsclusivi({});
    setFlagMultipli({});
    setEditingRigaId(null);

    if (prodotti.length === 1) {
      const solo = prodotti[0];
      setProdottoId(String(solo.id));
      setRicercaProdotto(solo.nome);
      setDescrizioneCliente(
        sanitizeDescrizioneHtml(solo.descrizione_cliente ?? ""),
      );
    }
  }

  function aggiornaPosizione(
    key: string,
    field: keyof PosizioneForm,
    value: string,
  ) {
    setPosizioni((prev) =>
      prev.map((posizione) =>
        posizione.key === key ? { ...posizione, [field]: value } : posizione,
      ),
    );
  }

  function aggiungiPosizione() {
    setPosizioni((prev) => [...prev, creaPosizioneVuota()]);
  }

  function rimuoviPosizione(key: string) {
    setPosizioni((prev) =>
      prev.length <= 1 ? prev : prev.filter((posizione) => posizione.key !== key),
    );
  }

  function duplicaPosizione(key: string) {
    setPosizioni((prev) => {
      const originale = prev.find((posizione) => posizione.key === key);
      if (!originale) return prev;
      posizioneKeySeq += 1;
      return [
        ...prev,
        {
          ...originale,
          key: `pos-${posizioneKeySeq}`,
        },
      ];
    });
  }

  function selezionaProdotto(prodotto: Prodotto) {
    setProdottoId(String(prodotto.id));
    setRicercaProdotto(prodotto.nome);
    setElencoProdottiAperto(false);
    setDescrizioneCliente(
      sanitizeDescrizioneHtml(prodotto.descrizione_cliente ?? ""),
    );
    resetCampiProdotto(
      setLarghezza,
      setAltezza,
      setLunghezza,
      setPosa,
      setFlagEsclusivi,
      setFlagMultipli,
      setPosizioni,
      isPosaAvanzata,
    );
    setModalitaMq("misure");
    setMqDiretti("");
    setPosaTipo(posaTipoDefault(nomeCategoria));
    setPosaManuale(false);
    setPosaImporto("");
    setPosaRigaSeparata(false);
    setPrezzoDigitato("");
    setPrezzoBds("");
    setTipologiaApertura("");
    setLarghezzaMm("");
    setAltezzaMm("");
    setExtraColoreNome(EXTRA_COLORE_BIANCO_MASSA.nome);
    setExtraColorePercentuale(0);
    if (!prodotto.ha_vetro) {
      setColoreInterno("");
      setColoreEsterno("");
      setColoreFerramenta("");
      setVetro("");
    } else {
      setColore("");
    }
  }

  function handleModificaRiga(riga: RigaSalvata) {
    setEditingRigaId(riga.id);
    const prodottoRiga = prodotti.find((p) => p.id === riga.prodotto_id);
    popolaFormDaRiga(
      riga,
      gruppiFlag,
      formSetters,
      nomeCategoria,
      prodottoRiga ? configRegolaPrezzoDa(prodottoRiga) : null,
    );
    setTipologiaApertura(
      (riga.tipologia_apertura as TipologiaAperturaGriglia) || "",
    );
    setLarghezzaMm(riga.larghezza_mm != null ? String(riga.larghezza_mm) : "");
    setAltezzaMm(riga.altezza_mm != null ? String(riga.altezza_mm) : "");
    setExtraColoreNome(
      riga.extra_colore_nome?.trim() || EXTRA_COLORE_BIANCO_MASSA.nome,
    );
    setExtraColorePercentuale(
      riga.extra_colore_percentuale != null
        ? Number(riga.extra_colore_percentuale)
        : 0,
    );
    setRicercaProdotto(riga.prodotti.nome);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCopiaNelForm(riga: RigaSalvata) {
    setEditingRigaId(null);
    const prodottoRiga = prodotti.find((p) => p.id === riga.prodotto_id);
    popolaFormDaRiga(
      riga,
      gruppiFlag,
      formSetters,
      nomeCategoria,
      prodottoRiga ? configRegolaPrezzoDa(prodottoRiga) : null,
    );
    setTipologiaApertura(
      (riga.tipologia_apertura as TipologiaAperturaGriglia) || "",
    );
    setLarghezzaMm(riga.larghezza_mm != null ? String(riga.larghezza_mm) : "");
    setAltezzaMm(riga.altezza_mm != null ? String(riga.altezza_mm) : "");
    setExtraColoreNome(
      riga.extra_colore_nome?.trim() || EXTRA_COLORE_BIANCO_MASSA.nome,
    );
    setExtraColorePercentuale(
      riga.extra_colore_percentuale != null
        ? Number(riga.extra_colore_percentuale)
        : 0,
    );
    setRicercaProdotto(riga.prodotti.nome);
    setPosizioni([
      {
        key: `pos-copy-${Date.now()}`,
        larghezza: riga.larghezza_cm != null ? String(riga.larghezza_cm) : "",
        altezza: riga.altezza_cm != null ? String(riga.altezza_cm) : "",
        lunghezza: riga.lunghezza_cm != null ? String(riga.lunghezza_cm) : "",
        quantita: String(riga.quantita),
        tipologia_apertura:
          (riga.tipologia_apertura as TipologiaAperturaGriglia) || "",
        larghezzaMm:
          riga.larghezza_mm != null ? String(riga.larghezza_mm) : "",
        altezzaMm: riga.altezza_mm != null ? String(riga.altezza_mm) : "",
      },
    ]);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleAnnullaModifica() {
    resetForm();
    router.replace(
      percorsoFormCategoria(preventivoId, categoriaId, sottocategoriaId),
    );
  }

  async function aggiornaFlagRiga(rigaId: number) {
    const supabase = createSupabaseClient();

    const { error: flagDeleteError } = await supabase
      .from("righe_flag")
      .delete()
      .eq("riga_id", rigaId);

    if (flagDeleteError) throw new Error(flagDeleteError.message);

    if (flagAttivi.length > 0) {
      const { error: flagError } = await supabase.from("righe_flag").insert(
        flagAttivi.map((flag) => ({
          riga_id: rigaId,
          flag_id: flag.id,
        })),
      );

      if (flagError) throw new Error(flagError.message);
    }
  }

  async function handleSalvaRiga() {
    if (!prodottoSelezionato) return;

    const isGrigliaProd = isProdottoGriglia(prodottoSelezionato);
    const usaGrigliaMulti = isGrigliaProd && tipoTabella === "griglia";

    if (isGrigliaProd && !usaGrigliaMulti) {
      if (!tipologiaApertura) {
        setError("Seleziona la tipologia di apertura.");
        return;
      }
      const L = Number(larghezzaMm);
      const H = Number(altezzaMm);
      if (!Number.isFinite(L) || !Number.isFinite(H) || L <= 0 || H <= 0) {
        setError("Inserisci larghezza e altezza in mm.");
        return;
      }
      if (erroreGriglia || prezzoUnitarioGriglia == null) {
        setError(
          erroreGriglia ??
            "Misura non disponibile a listino per questa tipologia.",
        );
        return;
      }
    }

    if (isPosaAvanzata && posa && posaManuale) {
      const posaImportoNum = Number(posaImporto);
      if (!Number.isFinite(posaImportoNum) || posaImportoNum < 0) {
        setError("Inserisci un importo posa valido.");
        return;
      }
    }

    const prezzoInserito = isProdottoPrezzoDigitato(prodottoSelezionato)
      ? Number(prezzoDigitato)
      : isGrigliaProd && !usaGrigliaMulti && listinoGriglia != null
        ? listinoGriglia
        : null;
    const prezzoLibero = prezzoInserito;
    const regolaApplicata =
      isProdottoPrezzoDigitato(prodottoSelezionato) && regolaDefault
        ? serializzaRegolaApplicata(
            regolaDefault.regola,
            regolaDefault.valore,
          )
        : isGrigliaProd
          ? serializzaRegolaApplicata("sconto_listino", scontoGrigliaPerc)
          : null;

    const descrizioneTecnica =
      prodottoSelezionato.descrizione_tecnica?.trim() ||
      prodottoSelezionato.nome;
    const descrizioneClienteSalvata = descrizioneCliente.trim()
      ? sanitizeDescrizioneHtml(descrizioneCliente)
      : null;

    const riferimentoSalvato = riferimentoInterno.trim() || null;
    const haVetro = prodottoSelezionato.ha_vetro;
    const coloreSalvato =
      haVetro || isCoibentazione ? null : colore.trim() || null;
    const coloreInternoSalvato = haVetro
      ? coloreInterno.trim() || null
      : null;
    const coloreEsternoSalvato = haVetro
      ? coloreEsterno.trim() || null
      : null;
    const coloreFerramentaSalvato = haVetro
      ? coloreFerramenta.trim() || null
      : null;
    const vetroSalvato =
      haVetro && vetro.trim() ? vetro.trim() : null;
    const isMq = prodottoSelezionato.tipo_prezzo === "mq";

    const payloadColori = {
      colore: coloreSalvato,
      colore_interno: coloreInternoSalvato,
      colore_esterno: coloreEsternoSalvato,
      colore_ferramenta: coloreFerramentaSalvato,
      vetro: vetroSalvato,
    };

    const payloadGrigliaComune = isGrigliaProd
      ? {
          extra_colore_nome: extraColoreNome || EXTRA_COLORE_BIANCO_MASSA.nome,
          extra_colore_percentuale: extraColorePercentuale,
        }
      : {
          extra_colore_nome: null as string | null,
          extra_colore_percentuale: null as number | null,
        };

    const payloadGrigliaSingola = isGrigliaProd
      ? {
          tipologia_apertura: tipologiaApertura || null,
          larghezza_mm: Number(larghezzaMm) || null,
          altezza_mm: Number(altezzaMm) || null,
          ...payloadGrigliaComune,
        }
      : {
          tipologia_apertura: null as string | null,
          larghezza_mm: null as number | null,
          altezza_mm: null as number | null,
          ...payloadGrigliaComune,
        };

    function posaPayloadDaCalcolo(risultato: RisultatoCalcoloRiga) {
      if (isPosaAvanzata) {
        if (posa) {
          return {
            posa: true,
            posa_importo: risultato.posa_importo,
            posa_tipo: haVariantiPosa(nomeCategoria) ? posaTipo : null,
            posa_manuale: posaManuale,
            posa_riga_separata: posaRigaSeparata,
          };
        }
        return {
          posa: false,
          posa_importo: null,
          posa_tipo: null,
          posa_manuale: false,
          posa_riga_separata: false,
        };
      }
      return {
        posa,
        posa_importo: null,
        posa_tipo: null,
        posa_manuale: false,
        posa_riga_separata: false,
      };
    }

    setSaving(true);
    setError(null);

    const supabase = createSupabaseClient();

    if (isModifica && editingRigaId !== null) {
      if (!calcolo || !calcolo.valido) {
        setSaving(false);
        return;
      }

      const quantitaNum = Number(quantita);
      if (!Number.isFinite(quantitaNum) || quantitaNum <= 0) {
        setSaving(false);
        return;
      }

      const misure = parseMisureForm(
        prodottoSelezionato,
        larghezza,
        altezza,
        lunghezza,
        modalitaMq,
        mqDiretti,
      );
      if (!misure.valid) {
        setSaving(false);
        return;
      }

      const { error: updateError } = await supabase
        .from("righe")
        .update({
          prodotto_id: prodottoSelezionato.id,
          quantita: quantitaNum,
          prezzo_riga: calcolo.prezzo_riga,
          prezzo_libero: prezzoLibero,
          prezzo_inserito: prezzoInserito,
          regola_applicata: regolaApplicata,
          descrizione_tecnica: descrizioneTecnica,
          descrizione_cliente: descrizioneClienteSalvata,
          modalita_mq: isMq ? modalitaMq : null,
          mq_diretti: isMq && modalitaMq === "diretti" ? misure.mqDirettiNum : null,
          larghezza_cm:
            isMq && modalitaMq === "diretti" ? null : misure.larghezzaCm,
          altezza_cm: isMq && modalitaMq === "diretti" ? null : misure.altezzaCm,
          lunghezza_cm: misure.lunghezzaCm,
          riferimento_interno: riferimentoSalvato,
          ...payloadColori,
          ...payloadGrigliaSingola,
          ...posaPayloadDaCalcolo(calcolo),
        })
        .eq("id", editingRigaId)
        .eq("preventivo_id", preventivoId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      try {
        await aggiornaFlagRiga(editingRigaId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore sconosciuto");
        setSaving(false);
        return;
      }

      try {
        if (isPosaAvanzata) {
          await syncRigaPosaSeparata(supabase, {
            preventivoId: Number(preventivoId),
            parentRigaId: editingRigaId,
            posaSeparata: posa && posaRigaSeparata,
            importoPosaTotale: calcolo.posa_importo ?? 0,
            quantita: quantitaNum,
          });
        } else {
          await removeRigaPosaPerParent(supabase, editingRigaId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore riga posa");
        setSaving(false);
        return;
      }

      await refreshTotali();
      resetForm();
      router.replace(
        percorsoFormCategoria(preventivoId, categoriaId, sottocategoriaId),
      );
      setSaving(false);
      return;
    }

    type RigaDaInserire = {
      misure: ReturnType<typeof parseMisureForm>;
      quantitaNum: number;
      calcolo: RisultatoCalcoloRiga;
      prezzoInseritoRiga: number | null;
      payloadGrigliaRiga: {
        tipologia_apertura: string | null;
        larghezza_mm: number | null;
        altezza_mm: number | null;
        extra_colore_nome: string | null;
        extra_colore_percentuale: number | null;
      };
    };

    let daInserire: RigaDaInserire[] = [];

    if (tipoTabella) {
      if (haPosizioniIncomplete) {
        setError(
          tipoTabella === "griglia"
            ? "Completa tipologia e misure di ogni posizione o rimuovila."
            : "Completa le misure di ogni posizione o rimuovila.",
        );
        setSaving(false);
        return;
      }
      if (posizioniValide.length === 0) {
        setSaving(false);
        return;
      }
      daInserire = posizioniValide.map(({ posizione, calcolo: calc }) => {
        if (tipoTabella === "griglia") {
          const parsed = parsePosizioneGriglia(posizione);
          const { listino } = calcolaPrezzoBdsGrigliaPosizione(
            parsed.tipologia,
            parsed.larghezzaMm,
            parsed.altezzaMm,
          );
          return {
            misure: {
              valid: true,
              larghezzaCm: null,
              altezzaCm: null,
              lunghezzaCm: null,
              mqDirettiNum: null,
            },
            quantitaNum: parsed.quantitaNum,
            calcolo: calc,
            prezzoInseritoRiga: listino,
            payloadGrigliaRiga: {
              tipologia_apertura: parsed.tipologia || null,
              larghezza_mm: parsed.larghezzaMm || null,
              altezza_mm: parsed.altezzaMm || null,
              ...payloadGrigliaComune,
            },
          };
        }
        const parsed = parsePosizioneForm(prodottoSelezionato, posizione);
        return {
          misure: parsed,
          quantitaNum: parsed.quantitaNum,
          calcolo: calc,
          prezzoInseritoRiga: prezzoInserito,
          payloadGrigliaRiga: {
            tipologia_apertura: null,
            larghezza_mm: null,
            altezza_mm: null,
            extra_colore_nome: null,
            extra_colore_percentuale: null,
          },
        };
      });
    } else {
      if (!calcolo || !calcolo.valido) {
        setSaving(false);
        return;
      }
      const quantitaNum = Number(quantita);
      if (!Number.isFinite(quantitaNum) || quantitaNum <= 0) {
        setSaving(false);
        return;
      }
      const misure = parseMisureForm(
        prodottoSelezionato,
        larghezza,
        altezza,
        lunghezza,
        modalitaMq,
        mqDiretti,
      );
      if (!misure.valid) {
        setSaving(false);
        return;
      }
      daInserire = [
        {
          misure,
          quantitaNum,
          calcolo,
          prezzoInseritoRiga: prezzoInserito,
          payloadGrigliaRiga: payloadGrigliaSingola,
        },
      ];
    }

    let numeroPosizione: number;
    try {
      numeroPosizione = await prossimoNumeroPosizione(supabase, preventivoId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore numerazione");
      setSaving(false);
      return;
    }

    const payloads = daInserire.map((riga, index) => ({
      preventivo_id: Number(preventivoId),
      prodotto_id: prodottoSelezionato.id,
      quantita: riga.quantitaNum,
      prezzo_riga: riga.calcolo.prezzo_riga,
      prezzo_libero: riga.prezzoInseritoRiga,
      prezzo_inserito: riga.prezzoInseritoRiga,
      regola_applicata: regolaApplicata,
      descrizione_tecnica: descrizioneTecnica,
      descrizione_cliente: descrizioneClienteSalvata,
      numero_posizione: numeroPosizione + index,
      modalita_mq: isMq ? (tipoTabella ? "misure" : modalitaMq) : null,
      mq_diretti:
        isMq && !tipoTabella && modalitaMq === "diretti"
          ? riga.misure.mqDirettiNum
          : null,
      larghezza_cm:
        isMq && !tipoTabella && modalitaMq === "diretti"
          ? null
          : riga.misure.larghezzaCm,
      altezza_cm:
        isMq && !tipoTabella && modalitaMq === "diretti"
          ? null
          : riga.misure.altezzaCm,
      lunghezza_cm: riga.misure.lunghezzaCm,
      riferimento_interno: riferimentoSalvato,
      ...payloadColori,
      ...riga.payloadGrigliaRiga,
      ...posaPayloadDaCalcolo(riga.calcolo),
    }));

    const { data: nuoveRighe, error: insertError } = await supabase
      .from("righe")
      .insert(payloads)
      .select("id");

    if (insertError || !nuoveRighe || nuoveRighe.length === 0) {
      setError(insertError?.message ?? "Errore nel salvataggio della riga");
      setSaving(false);
      return;
    }

    if (flagAttivi.length > 0) {
      const { error: flagError } = await supabase.from("righe_flag").insert(
        nuoveRighe.flatMap((riga) =>
          flagAttivi.map((flag) => ({
            riga_id: riga.id,
            flag_id: flag.id,
          })),
        ),
      );

      if (flagError) {
        setError(flagError.message);
        setSaving(false);
        return;
      }
    }

    if (isPosaAvanzata) {
      try {
        for (let i = 0; i < nuoveRighe.length; i++) {
          await syncRigaPosaSeparata(supabase, {
            preventivoId: Number(preventivoId),
            parentRigaId: nuoveRighe[i].id,
            posaSeparata: posa && posaRigaSeparata,
            importoPosaTotale: daInserire[i].calcolo.posa_importo ?? 0,
            quantita: daInserire[i].quantitaNum,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore riga posa");
        setSaving(false);
        return;
      }
    }

    await refreshTotali();
    resetForm();
    setSaving(false);
  }

  async function handleDuplicaRiga(riga: RigaSalvata) {
    setError(null);
    setDuplicatingId(riga.id);

    const supabase = createSupabaseClient();
    let numeroPosizione: number;
    try {
      numeroPosizione = await prossimoNumeroPosizione(supabase, preventivoId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore numerazione");
      setDuplicatingId(null);
      return;
    }

    const { data: nuovaRiga, error: insertError } = await supabase
      .from("righe")
      .insert({
        preventivo_id: Number(preventivoId),
        prodotto_id: riga.prodotto_id,
        larghezza_cm: riga.larghezza_cm,
        altezza_cm: riga.altezza_cm,
        lunghezza_cm: riga.lunghezza_cm,
        quantita: riga.quantita,
        posa: riga.posa,
        prezzo_riga: riga.prezzo_riga,
        posa_importo: riga.posa_importo,
        posa_tipo: riga.posa_tipo,
        posa_manuale: riga.posa_manuale ?? false,
        posa_riga_separata: riga.posa_riga_separata ?? false,
        prezzo_libero: riga.prezzo_libero,
        prezzo_inserito: riga.prezzo_inserito,
        regola_applicata: riga.regola_applicata,
        descrizione_tecnica:
          riga.descrizione_tecnica ??
          riga.prodotti.descrizione_tecnica ??
          riga.prodotti.nome,
        descrizione_cliente: riga.descrizione_cliente,
        modalita_mq: riga.modalita_mq,
        mq_diretti: riga.mq_diretti,
        numero_posizione: numeroPosizione,
        riferimento_interno: riga.riferimento_interno,
        colore: riga.prodotti.ha_vetro ? null : riga.colore,
        colore_interno: riga.prodotti.ha_vetro ? riga.colore_interno : null,
        colore_esterno: riga.prodotti.ha_vetro ? riga.colore_esterno : null,
        colore_ferramenta: riga.prodotti.ha_vetro
          ? riga.colore_ferramenta
          : null,
        vetro: riga.prodotti.ha_vetro ? riga.vetro : null,
      })
      .select("id")
      .single();

    if (insertError || !nuovaRiga) {
      setError(insertError?.message ?? "Errore nella duplicazione della riga");
      setDuplicatingId(null);
      return;
    }

    const flagIds = riga.righe_flag.map((rf) => rf.flag_id);
    if (flagIds.length > 0) {
      const { error: flagError } = await supabase.from("righe_flag").insert(
        flagIds.map((flag_id) => ({
          riga_id: nuovaRiga.id,
          flag_id,
        })),
      );

      if (flagError) {
        setError(flagError.message);
        setDuplicatingId(null);
        return;
      }
    }

    if (isPosaAvanzata) {
      try {
        await syncRigaPosaSeparata(supabase, {
          preventivoId: Number(preventivoId),
          parentRigaId: nuovaRiga.id,
          posaSeparata: !!riga.posa && riga.posa_riga_separata === true,
          importoPosaTotale: Number(riga.posa_importo ?? 0),
          quantita: Number(riga.quantita) || 1,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore riga posa");
        setDuplicatingId(null);
        return;
      }
    }

    await refreshTotali();
    setDuplicatingId(null);
  }

  async function handleEliminaRiga(rigaId: number) {
    setError(null);

    if (editingRigaId === rigaId) {
      resetForm();
    }

    const supabase = createSupabaseClient();

    try {
      await removeRigaPosaPerParent(supabase, rigaId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore riga posa");
      return;
    }

    const { error: flagDeleteError } = await supabase
      .from("righe_flag")
      .delete()
      .eq("riga_id", rigaId);

    if (flagDeleteError) {
      setError(flagDeleteError.message);
      return;
    }

    const { error: deleteError } = await supabase
      .from("righe")
      .delete()
      .eq("id", rigaId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await refreshTotali();
  }

  function formatMisure(riga: RigaSalvata) {
    if (riga.prodotti.tipo_prezzo === "mq") {
      if (normalizzaModalitaMq(riga.modalita_mq) === "diretti") {
        const mq = riga.mq_diretti;
        return mq != null
          ? `${mq.toLocaleString("it-IT", { maximumFractionDigits: 4 })} mq`
          : "—";
      }
      if (riga.larghezza_cm != null && riga.altezza_cm != null) {
        return `${riga.larghezza_cm} × ${riga.altezza_cm} cm`;
      }
      return "—";
    }
    if (riga.prodotti.tipo_prezzo === "ml") {
      return `${riga.lunghezza_cm} cm`;
    }
    return "—";
  }

  function formatFlagRiga(riga: RigaSalvata) {
    const nomi = riga.righe_flag
      .map((rf) => normalizzaRelazione(rf.flag_supplementi)?.nome)
      .filter(Boolean);
    return nomi.length > 0 ? nomi.join(", ") : "—";
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-brand-muted">Caricamento...</p>
      </main>
    );
  }

  if (error && !riferimento) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-brand-danger">
          Errore: {error}
        </p>
        <Link
          href={`/preventivo/${preventivoId}`}
          className="mt-4 inline-block text-sm text-brand-muted underline hover:text-brand-navy"
        >
          Torna alle categorie
        </Link>
      </main>
    );
  }

  const breadcrumbItems = [
    {
      label: riferimento
        ? titoloPreventivo(clienteNomePreventivo, riferimento)
        : "Preventivo",
      href: `/preventivo/${preventivoId}`,
    },
    {
      label: nomeCategoria ?? "Categoria",
      href: sottocategoriaId
        ? `/preventivo/${preventivoId}/categoria/${categoriaId}`
        : undefined,
    },
    ...(nomeSottocategoria
      ? [{ label: nomeSottocategoria as string }]
      : []),
  ];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <Breadcrumb items={breadcrumbItems} />

      <PageTitle
        meta={
          isModifica
            ? "Modifica la riga selezionata."
            : "Aggiungi prodotti al preventivo."
        }
      >
        {nomeSottocategoria ?? nomeCategoria}
      </PageTitle>

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-brand-danger">
          {error}
        </p>
      )}

      <div className="mb-10">
        <div
          className={`space-y-6 ${
            isModifica
              ? "rounded-lg border border-brand-accent/40 p-3 ring-1 ring-brand-accent/20 sm:p-4"
              : ""
          }`}
        >
          <SectionTitle>
            {isModifica ? "Modifica riga" : "Nuova riga"}
          </SectionTitle>

          {/* 1. Prodotto */}
          <FormBlock title="Prodotto">
            {prodotti.length === 1 && prodottoSelezionato ? (
              <div className="sm:col-span-2">
                <span className="mb-1.5 block text-sm text-brand-label">
                  Prodotto
                </span>
                <p className="rounded-md border border-brand-border bg-brand-surface px-3 py-2.5 text-sm font-medium text-brand-navy">
                  {prodottoSelezionato.nome}
                </p>
              </div>
            ) : (
            <div
              ref={prodottoComboboxRef}
              className="relative flex flex-col gap-1.5 sm:col-span-2"
            >
              <span className="text-sm text-brand-label">Cerca prodotto</span>
              <input
                type="text"
                role="combobox"
                aria-expanded={elencoProdottiAperto}
                aria-controls="elenco-prodotti"
                aria-autocomplete="list"
                value={ricercaProdotto}
                onFocus={() => setElencoProdottiAperto(true)}
                onClick={() => setElencoProdottiAperto(true)}
                onChange={(e) => {
                  setRicercaProdotto(e.target.value);
                  setElencoProdottiAperto(true);
                if (prodottoId) {
                  setProdottoId("");
                  setDescrizioneCliente("");
                  setPrezzoDigitato("");
                  setColore("");
                  setColoreInterno("");
                  setColoreEsterno("");
                  setColoreFerramenta("");
                  setVetro("");
                  resetCampiProdotto(
                    setLarghezza,
                    setAltezza,
                    setLunghezza,
                    setPosa,
                    setFlagEsclusivi,
                    setFlagMultipli,
                    setPosizioni,
                    isPosaAvanzata,
                  );
                }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setElencoProdottiAperto(false);
                }}
                placeholder="Seleziona o cerca prodotto..."
                autoComplete="off"
                className={inputControlClass}
              />
              {elencoProdottiAperto && (
                <ul
                  id="elenco-prodotti"
                  role="listbox"
                  className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-brand-border bg-white shadow-md"
                >
                  {prodottiInElenco.length > 0 ? (
                    prodottiInElenco.map((prodotto) => (
                      <li key={prodotto.id} role="option">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selezionaProdotto(prodotto)}
                          className={`min-h-[44px] w-full px-3 py-2 text-left text-sm hover:bg-brand-surface ${
                            prodottoId === String(prodotto.id)
                              ? "bg-brand-surface font-medium text-brand-navy"
                              : "text-brand-text"
                          }`}
                        >
                          {prodotto.nome}
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="px-3 py-2 text-sm text-brand-muted">
                      Nessun prodotto trovato.
                    </li>
                  )}
                </ul>
              )}
              {prodottoSelezionato && (
                <p className="text-sm text-brand-muted">
                  Selezionato:{" "}
                  <span className="font-medium text-brand-text">
                    {prodottoSelezionato.nome}
                  </span>
                </p>
              )}
            </div>
            )}

            {prodottoSelezionato && (
              <div className="sm:col-span-2">
                <span className="mb-1.5 block text-sm text-brand-label">
                  Descrizione commerciale
                </span>
                <DescrizioneCommercialeEditor
                  value={descrizioneCliente}
                  onChange={setDescrizioneCliente}
                  rigaKey={
                    editingRigaId != null
                      ? `cat-riga-${editingRigaId}`
                      : `cat-nuovo-${prodottoSelezionato.id}`
                  }
                />
                <p className="mt-1 text-xs text-brand-muted">
                  Compare nel PDF e in Componi.
                </p>
              </div>
            )}

            <Input
              label="Riferimento interno"
              value={riferimentoInterno}
              onChange={(e) => setRiferimentoInterno(e.target.value)}
              placeholder="es. camera matrimoniale, cod. fornitore XY123"
              hint="Solo uso interno: non compare nel PDF né in Componi."
              wrapperClassName="sm:col-span-2"
            />
            {prodottoSelezionato?.ha_vetro ? (
              <>
                <ComboboxLibero
                  label="Colore interno"
                  value={coloreInterno}
                  onChange={setColoreInterno}
                  options={opzioniColore}
                  placeholder="Seleziona o digita un colore..."
                  hint="Finisce in automatico nella colonna Note"
                />
                <ComboboxLibero
                  label="Colore esterno"
                  value={coloreEsterno}
                  onChange={setColoreEsterno}
                  options={opzioniColore}
                  placeholder="Seleziona o digita un colore..."
                  hint="Finisce in automatico nella colonna Note"
                />
                <ComboboxLibero
                  label="Colore ferramenta e copricerniere"
                  value={coloreFerramenta}
                  onChange={setColoreFerramenta}
                  options={opzioniColore}
                  placeholder="Seleziona o digita un colore..."
                  hint="Finisce in automatico nella colonna Note"
                  wrapperClassName="sm:col-span-2"
                />
                <ComboboxLibero
                  label="Vetro"
                  value={vetro}
                  onChange={setVetro}
                  options={opzioniVetro}
                  placeholder="Seleziona o digita un vetro..."
                  hint="Visibile solo per prodotti con vetro"
                  wrapperClassName="sm:col-span-2"
                />
              </>
            ) : mostraCampoColore ? (
              <ComboboxLibero
                label="Colore"
                value={colore}
                onChange={setColore}
                options={opzioniColore}
                placeholder="Seleziona o digita un colore..."
                hint="Finisce in automatico nella colonna Note (PDF / Componi)"
                wrapperClassName="sm:col-span-2"
              />
            ) : null}
          </FormBlock>

          {isGriglia && (
            <FormBlock title="Listino griglia">
              {isModifica && (
                <>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm text-brand-label">
                      Tipologia apertura
                    </label>
                    <select
                      value={tipologiaApertura}
                      onChange={(e) =>
                        setTipologiaApertura(
                          e.target.value as TipologiaAperturaGriglia | "",
                        )
                      }
                      className={inputControlClass}
                    >
                      <option value="">Seleziona tipologia...</option>
                      {TIPOLOGIE_APERTURA_GRIGLIA.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Larghezza (mm)"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={larghezzaMm}
                    onChange={(e) => setLarghezzaMm(e.target.value)}
                  />
                  <Input
                    label="Altezza (mm)"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={altezzaMm}
                    onChange={(e) => setAltezzaMm(e.target.value)}
                  />
                </>
              )}
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm text-brand-label">
                  Extra colore / finitura griglia
                </label>
                <select
                  value={extraColoreNome}
                  onChange={(e) => {
                    const nome = e.target.value;
                    setExtraColoreNome(nome);
                    if (nome === EXTRA_COLORE_BIANCO_MASSA.nome) {
                      setExtraColorePercentuale(0);
                      return;
                    }
                    const found = extraColoriGriglia.find((x) => x.nome === nome);
                    setExtraColorePercentuale(found?.percentuale ?? 0);
                  }}
                  className={inputControlClass}
                >
                  <option value={EXTRA_COLORE_BIANCO_MASSA.nome}>
                    Bianco massa (senza supplemento)
                  </option>
                  {extraColoriGriglia.map((ex) => (
                    <option key={ex.nome} value={ex.nome}>
                      {ex.nome} (+{ex.percentuale}%)
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-brand-muted">
                  Supplemento % condiviso da tutte le posizioni. Il colore
                  interno/esterno sopra resta solo descrittivo.
                </p>
              </div>
              {isModifica && erroreGriglia && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:col-span-2">
                  {erroreGriglia}
                </p>
              )}
              {isModifica && spiegazioneGriglia && !erroreGriglia && (
                <p className="rounded-md border border-brand-navy/20 bg-brand-navy/5 px-3 py-2 text-sm font-medium text-brand-navy sm:col-span-2">
                  {spiegazioneGriglia}
                  {risultatoGriglia?.ok && extraColorePercentuale > 0
                    ? ` · base griglia ${formatEuro(risultatoGriglia.prezzoBase)} + extra colore ${extraColorePercentuale}%`
                    : ""}
                </p>
              )}
              {!isModifica && scontoGrigliaPerc > 0 && (
                <p className="rounded-md border border-brand-navy/20 bg-brand-navy/5 px-3 py-2 text-sm font-medium text-brand-navy sm:col-span-2">
                  Sconto BDS {scontoGrigliaPerc}% applicato sul listino griglia di
                  ogni posizione
                  {extraColorePercentuale > 0
                    ? ` (dopo extra colore +${extraColorePercentuale}%)`
                    : ""}
                </p>
              )}
            </FormBlock>
          )}

          {/* 2. Misure e quantità */}
          <FormBlock title="Misure e quantità">
            {usaTabellaPosizioni && tipoTabella === "griglia" && (
              <TabellaPosizioniMultiple
                tipo="griglia"
                minimo={null}
                posizioni={posizioni}
                calcoli={calcoliPosizioni}
                totale={totaleAnteprima}
                onChange={aggiornaPosizione}
                onAdd={aggiungiPosizione}
                onRemove={rimuoviPosizione}
                onDuplica={duplicaPosizione}
              />
            )}
            {prodottoSelezionato?.tipo_prezzo === "mq" && (
              <div className="space-y-4 sm:col-span-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setModalitaMq("misure")}
                    className={`min-h-[44px] rounded-md px-4 text-sm font-medium ${
                      modalitaMq === "misure"
                        ? "bg-brand-accent text-white"
                        : "border border-brand-border bg-white text-brand-text"
                    }`}
                  >
                    Misure
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalitaMq("diretti")}
                    className={`min-h-[44px] rounded-md px-4 text-sm font-medium ${
                      modalitaMq === "diretti"
                        ? "bg-brand-accent text-white"
                        : "border border-brand-border bg-white text-brand-text"
                    }`}
                  >
                    Mq diretti
                  </button>
                </div>

                {modalitaMq === "misure" ? (
                  usaTabellaPosizioni && tipoTabella === "mq" ? (
                    <TabellaPosizioniMultiple
                      tipo="mq"
                      minimo={prodottoSelezionato.minimo}
                      posizioni={posizioni}
                      calcoli={calcoliPosizioni}
                      totale={totaleAnteprima}
                      onChange={aggiornaPosizione}
                      onAdd={aggiungiPosizione}
                      onRemove={rimuoviPosizione}
                      onDuplica={duplicaPosizione}
                    />
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input
                        label="Larghezza (cm)"
                        type="number"
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        value={larghezza}
                        onChange={(e) => setLarghezza(e.target.value)}
                      />
                      <Input
                        label="Altezza (cm)"
                        type="number"
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        value={altezza}
                        onChange={(e) => setAltezza(e.target.value)}
                      />
                      {mqRiga != null && (
                        <p className="text-sm text-brand-muted sm:col-span-2">
                          {mqRiga.toLocaleString("it-IT", {
                            maximumFractionDigits: 4,
                          })}{" "}
                          mq
                          {prodottoSelezionato.minimo != null &&
                            mqRiga < prodottoSelezionato.minimo && (
                              <>
                                {" "}
                                → minimo {prodottoSelezionato.minimo} mq
                              </>
                            )}
                        </p>
                      )}
                    </div>
                  )
                ) : (
                  <Input
                    label="Mq totali riga"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={mqDiretti}
                    onChange={(e) => setMqDiretti(e.target.value)}
                    hint="Attenzione: verifica i minimi fatturabili delle singole posizioni (min. 1,5 mq cadauna)"
                  />
                )}
              </div>
            )}

            {prodottoSelezionato?.tipo_prezzo === "ml" &&
              (usaTabellaPosizioni && tipoTabella === "ml" ? (
                <TabellaPosizioniMultiple
                  tipo="ml"
                  minimo={null}
                  posizioni={posizioni}
                  calcoli={calcoliPosizioni}
                  totale={totaleAnteprima}
                  onChange={aggiornaPosizione}
                  onAdd={aggiungiPosizione}
                  onRemove={rimuoviPosizione}
                  onDuplica={duplicaPosizione}
                />
              ) : (
                <Input
                  label="Lunghezza (cm)"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={lunghezza}
                  onChange={(e) => setLunghezza(e.target.value)}
                />
              ))}

            {prodottoSelezionato &&
              isProdottoPrezzoDigitato(prodottoSelezionato) && (
                <>
                  <Input
                    label={etichettaCampoPrezzoDigitato(regolaDefault)}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={prezzoDigitato}
                    onChange={(e) => handleChangePrezzoInserito(e.target.value)}
                    placeholder="Importo fornitore"
                    hint="Totale pezzi dal configuratore / fornitore"
                  />
                  <Input
                    label="Prezzo listino BDS"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={prezzoBds}
                    onChange={(e) => handleChangePrezzoBds(e.target.value)}
                    placeholder="Prezzo BDS"
                    hint="Importo che entra in preventivo e nei totali"
                  />
                  <div className="sm:col-span-2">
                    {spiegazionePrezzo && (
                      <p className="rounded-md border border-brand-navy/20 bg-brand-navy/5 px-3 py-2 text-sm font-medium text-brand-navy">
                        {spiegazionePrezzo}
                      </p>
                    )}
                  </div>
                </>
              )}

            {!usaTabellaPosizioni && (
              <Input
                label="Quantità"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={quantita}
                onChange={(e) => setQuantita(e.target.value)}
              />
            )}
          </FormBlock>

          {/* 3. Posa */}
          {(isPosaAvanzata ||
            (!isPosaAvanzata &&
              prodottoSelezionato?.posa_prezzo != null)) && (
            <FormBlock title="Posa">
              {isPosaAvanzata ? (
                <SezionePosaAvanzata
                  posa={posa}
                  setPosa={setPosa}
                  variantiPosa={variantiPosa}
                  posaTipo={posaTipo}
                  setPosaTipo={setPosaTipo}
                  posaUnitario={posaUnitario}
                  posaAutoCalcolata={posaAutoCalcolata}
                  posaManuale={posaManuale}
                  setPosaManuale={setPosaManuale}
                  posaImporto={posaImportoMostrato}
                  setPosaImporto={setPosaImporto}
                  mostraSceltaVisPosa={mostraSceltaVisPosa}
                  posaRigaSeparata={posaRigaSeparata}
                  setPosaRigaSeparata={setPosaRigaSeparata}
                />
              ) : (
                <label className="flex min-h-[44px] items-center gap-3 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={posa}
                    onChange={(e) => setPosa(e.target.checked)}
                    className="h-5 w-5 rounded border-brand-input-border"
                  />
                  <span className="text-sm text-brand-text">
                    Includi posa (
                    {formatEuro(prodottoSelezionato!.posa_prezzo!)})
                  </span>
                </label>
              )}
            </FormBlock>
          )}

          {/* 4. Supplementi / Flag */}
          {gruppiFlag.length > 0 && (
            <FormBlock title="Supplementi / Flag">
              {gruppiFlag.map((gruppo) => (
                <fieldset
                  key={gruppo.id}
                  className="rounded-md border border-brand-border bg-brand-surface/40 p-3 sm:col-span-2"
                >
                  <legend className="px-1 text-sm font-medium text-brand-navy">
                    {gruppo.nome}
                  </legend>

                  {gruppo.esclusivo ? (
                    <div className="mt-1 space-y-1">
                      <label className="flex min-h-[44px] items-center gap-3">
                        <input
                          type="radio"
                          name={`gruppo-${gruppo.id}`}
                          checked={!flagEsclusivi[gruppo.id]}
                          onChange={() =>
                            setFlagEsclusivi((prev) => ({
                              ...prev,
                              [gruppo.id]: "",
                            }))
                          }
                          className="h-5 w-5 border-brand-input-border"
                        />
                        <span className="text-sm text-brand-text">Nessuno</span>
                      </label>
                      {gruppo.flag_supplementi.map((flag) => (
                        <label
                          key={flag.id}
                          className="flex min-h-[44px] items-center gap-3"
                        >
                          <input
                            type="radio"
                            name={`gruppo-${gruppo.id}`}
                            checked={
                              flagEsclusivi[gruppo.id] === String(flag.id)
                            }
                            onChange={() =>
                              setFlagEsclusivi((prev) => ({
                                ...prev,
                                [gruppo.id]: String(flag.id),
                              }))
                            }
                            className="h-5 w-5 border-brand-input-border"
                          />
                          <span className="text-sm text-brand-text">
                            {flag.nome} {etichettaFlag(flag)}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {gruppo.flag_supplementi.map((flag) => (
                        <label
                          key={flag.id}
                          className="flex min-h-[44px] items-center gap-3"
                        >
                          <input
                            type="checkbox"
                            checked={!!flagMultipli[flag.id]}
                            onChange={(e) =>
                              setFlagMultipli((prev) => ({
                                ...prev,
                                [flag.id]: e.target.checked,
                              }))
                            }
                            className="h-5 w-5 rounded border-brand-input-border"
                          />
                          <span className="text-sm text-brand-text">
                            {flag.nome} {etichettaFlag(flag)}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              ))}
            </FormBlock>
          )}

          {/* Totale + CTA */}
          <div className="space-y-4 rounded-lg border border-brand-border bg-white p-4 sm:p-5">
            <div className="text-center sm:text-left">
              {isPosaAvanzata && prezzoAnteprima != null && (
                <p className="text-sm text-brand-muted">
                  Fornitura {formatEuro(prezzoAnteprima)}
                  {posa ? ` · Posa ${formatEuro(posaAnteprimaNum)}` : ""}
                </p>
              )}
              <p className="mt-1 text-sm text-brand-muted">
                {usaTabellaPosizioni
                  ? posizioniValide.length > 1
                    ? `Totale ${posizioniValide.length} posizioni`
                    : isPosaAvanzata
                      ? "Totale riga"
                      : "Prezzo riga"
                  : isPosaAvanzata
                    ? "Totale riga"
                    : "Prezzo riga"}
              </p>
              <p className="text-3xl font-semibold tabular-nums text-brand-accent">
                {totaleAnteprima != null ? formatEuro(totaleAnteprima) : "—"}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button
                variant="primary"
                onClick={handleSalvaRiga}
                disabled={
                  !prodottoSelezionato ||
                  saving ||
                  (isGriglia &&
                    !usaTabellaPosizioni &&
                    (Boolean(erroreGriglia) ||
                      !tipologiaApertura ||
                      prezzoUnitarioGriglia == null ||
                      !Number(larghezzaMm) ||
                      !Number(altezzaMm))) ||
                  (usaTabellaPosizioni
                    ? posizioniValide.length === 0 || haPosizioniIncomplete
                    : !calcolo?.valido)
                }
                className="w-full px-8 text-base sm:w-auto sm:min-w-[200px]"
              >
                {saving
                  ? "Salvataggio..."
                  : isModifica
                    ? "Aggiorna"
                    : usaTabellaPosizioni && posizioniValide.length > 1
                      ? `Aggiungi ${posizioniValide.length} posizioni`
                      : "Aggiungi al preventivo"}
              </Button>
              {isModifica && (
                <Button
                  variant="secondary"
                  onClick={handleAnnullaModifica}
                  disabled={saving}
                  className="w-full sm:w-auto"
                >
                  Annulla
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <SectionTitle>Righe salvate ({righe.length})</SectionTitle>

        {righe.length === 0 ? (
          <Card compact>
            <p className="text-sm text-brand-muted">
              Nessuna riga salvata in questa{" "}
              {sottocategoriaId ? "sottocategoria" : "categoria"}.
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-brand-border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-brand-border bg-brand-navy text-white">
                <tr>
                  <th className="w-10 px-2 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Prodotto</th>
                  <th className="hidden px-3 py-2.5 font-medium sm:table-cell">
                    Rif.
                  </th>
                  <th className="px-3 py-2.5 font-medium">Misure</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">
                    Flag
                  </th>
                  <th className="px-3 py-2.5 font-medium">Qtà</th>
                  <th className="px-3 py-2.5 font-medium text-right">Prezzo</th>
                  <th className="px-3 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {righe.map((riga, idx) => (
                  <tr
                    key={riga.id}
                    className={`border-b border-brand-border/60 last:border-0 ${
                      editingRigaId === riga.id
                        ? "bg-brand-accent/5"
                        : idx % 2 === 1
                          ? "bg-brand-surface/80"
                          : "bg-white"
                    }`}
                  >
                    <td className="px-2 py-2.5 tabular-nums text-brand-muted">
                      {riga.numero_posizione ?? "—"}
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-2.5 text-brand-text">
                      {riga.descrizione_tecnica?.trim() ||
                        riga.prodotti.descrizione_tecnica?.trim() ||
                        riga.prodotti.nome}
                    </td>
                    <td className="hidden px-3 py-2.5 text-brand-muted sm:table-cell">
                      {riga.riferimento_interno?.trim() || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-brand-muted">
                      {formatMisure(riga)}
                    </td>
                    <td className="hidden max-w-[8rem] truncate px-3 py-2.5 text-brand-muted md:table-cell">
                      {formatFlagRiga(riga)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{riga.quantita}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-brand-navy">
                      {riga.prezzo_riga != null
                        ? formatEuro(
                            isPosaAvanzata && riga.posa
                              ? importoRigaCompleto(
                                  riga.prezzo_riga,
                                  riga.posa_importo,
                                )
                              : riga.prezzo_riga,
                          )
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleModificaRiga(riga)}
                        className="mr-2 text-xs text-brand-muted hover:text-brand-navy hover:underline"
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicaRiga(riga)}
                        disabled={duplicatingId === riga.id}
                        className="mr-2 text-xs text-brand-muted hover:text-brand-navy hover:underline disabled:opacity-50"
                      >
                        {duplicatingId === riga.id ? "..." : "Duplica"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopiaNelForm(riga)}
                        className="mr-2 text-xs text-brand-muted hover:text-brand-navy hover:underline"
                      >
                        Copia nel form
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEliminaRiga(riga.id)}
                        className="text-xs text-brand-danger hover:underline"
                      >
                        Elimina
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Barra sticky totali → torna al preventivo */}
      <Link
        href={`/preventivo/${preventivoId}`}
        prefetch={false}
        className="group fixed inset-x-0 bottom-0 z-30 cursor-pointer border-t border-brand-border bg-white/95 shadow-[0_-4px_20px_rgb(28_61_90/8%)] backdrop-blur transition-colors hover:bg-brand-surface active:bg-brand-surface"
        aria-label="Torna al preventivo"
      >
        <div className="mx-auto flex min-h-[3.75rem] max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:min-h-[4.25rem] sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <span className="shrink-0 text-xs text-brand-muted transition-colors group-hover:text-brand-navy">
              ← Torna al preventivo
            </span>
            <div className="min-w-0">
              <p className="text-xs text-brand-muted">Totale categoria</p>
              <p className="truncate text-lg font-semibold tabular-nums text-brand-navy sm:text-xl">
                {formatEuro(totaleCategoria)}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-brand-muted">Totale preventivo</p>
            <p className="text-xl font-semibold tabular-nums text-brand-accent sm:text-2xl">
              {formatEuro(totalePreventivo)}
            </p>
          </div>
        </div>
      </Link>
    </main>
  );
}
