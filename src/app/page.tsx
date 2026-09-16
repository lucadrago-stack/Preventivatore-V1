"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import NuovoPreventivoModal from "@/components/NuovoPreventivoModal";
import { Card, Input, PageTitle } from "@/components/ui";
import { createSupabaseClient } from "@/lib/supabase";
import { formatEuro, formatData, normalizzaRelazione, titoloPreventivo } from "@/lib/format";
import { pulisciRighePosaPreventivo } from "@/lib/riga-posa";

const POSIZIONE_LIBERA_LABEL = "Posizione libera";

/** Dimensioni native di public/logo.png (1271×607). */
const LOGO_NATIVE_W = 1271;
const LOGO_NATIVE_H = 607;
const LOGO_HEIGHT = 96;
const LOGO_WIDTH = Math.round((LOGO_HEIGHT * LOGO_NATIVE_W) / LOGO_NATIVE_H);

type RigaPreventivo = {
  prezzo_riga: number | null;
  posa_importo: number | null;
  prodotti: {
    categoria_id: number;
    categorie: { nome: string } | { nome: string }[];
  } | null;
};

type PreventivoConDettagli = {
  id: number;
  riferimento: string;
  created_at: string;
  cliente_nome: string | null;
  commerciale_id: number | null;
  numero_preventivo: string | null;
  haVersione: boolean;
  righe: RigaPreventivo[];
};

type Commerciale = {
  id: number;
  nome: string;
};

type OrdinamentoCampo = "data" | "importo";


function calcolaTotale(righe: RigaPreventivo[]) {
  return righe.reduce(
    (sum, riga) => sum + (riga.prezzo_riga ?? 0) + (riga.posa_importo ?? 0),
    0,
  );
}

function calcolaCategorie(righe: RigaPreventivo[]) {
  const nomi = new Set<string>();

  for (const riga of righe) {
    if (!riga.prodotti) {
      nomi.add(POSIZIONE_LIBERA_LABEL);
      continue;
    }
    const prodotto = normalizzaRelazione(riga.prodotti);
    if (prodotto?.categorie) {
      nomi.add(normalizzaRelazione(prodotto.categorie)?.nome ?? "");
    }
  }

  return Array.from(nomi)
    .sort((a, b) => a.localeCompare(b, "it"))
    .join(", ");
}

export default function Home() {
  const [preventivi, setPreventivi] = useState<PreventivoConDettagli[]>([]);
  const [commerciali, setCommerciali] = useState<Commerciale[]>([]);
  const [clientiNomi, setClientiNomi] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [ricerca, setRicerca] = useState("");
  const [filtroCommercialeId, setFiltroCommercialeId] = useState("");
  const [filtroDaDa, setFiltroDaDa] = useState("");
  const [filtroAData, setFiltroAData] = useState("");
  const [ordinamentoCampo, setOrdinamentoCampo] =
    useState<OrdinamentoCampo>("data");
  const [ordinamentoAsc, setOrdinamentoAsc] = useState(false);
  const [pagina, setPagina] = useState(1);
  const PAGINA_SIZE = 20;

  const loadPreventivi = useCallback(async () => {
    const supabase = createSupabaseClient();

    const [preventiviResult, righeResult, commercialiResult, versioniResult, clientiResult] =
      await Promise.all([
      supabase
        .from("preventivi")
        .select("id, riferimento, created_at, cliente_nome, commerciale_id, numero_preventivo")
        .order("created_at", { ascending: false }),
      supabase
        .from("righe")
        .select(
          "preventivo_id, prezzo_riga, posa_importo, prodotti(categoria_id, categorie(nome))",
        ),
      supabase.from("commerciali").select("id, nome").order("nome"),
      supabase.from("versioni_preventivo").select("preventivo_id"),
      supabase.from("clienti").select("nome").order("nome"),
    ]);

    if (preventiviResult.error) throw new Error(preventiviResult.error.message);
    if (righeResult.error) throw new Error(righeResult.error.message);
    if (commercialiResult.error) {
      throw new Error(commercialiResult.error.message);
    }

    const idsConVersione = new Set(
      versioniResult.error
        ? []
        : (versioniResult.data ?? []).map(
            (v: { preventivo_id: number }) => v.preventivo_id,
          ),
    );
    setClientiNomi(
      (clientiResult.data ?? [])
        .map((c: { nome: string }) => c.nome)
        .filter(Boolean),
    );

    const righePerPreventivo = new Map<number, RigaPreventivo[]>();
    for (const riga of righeResult.data ?? []) {
      const prodotto = riga.prodotti
        ? normalizzaRelazione(riga.prodotti)
        : null;
      const lista = righePerPreventivo.get(riga.preventivo_id) ?? [];
      lista.push({
        prezzo_riga: riga.prezzo_riga,
        posa_importo: riga.posa_importo ?? 0,
        prodotti: prodotto
          ? {
              categoria_id: prodotto.categoria_id,
              categorie: prodotto.categorie,
            }
          : null,
      });
      righePerPreventivo.set(riga.preventivo_id, lista);
    }

    const preventiviNormalizzati: PreventivoConDettagli[] = (
      preventiviResult.data ?? []
    ).map((preventivo) => ({
      ...preventivo,
      haVersione: idsConVersione.has(preventivo.id),
      righe: righePerPreventivo.get(preventivo.id) ?? [],
    }));

    setPreventivi(preventiviNormalizzati);
    setCommerciali(commercialiResult.data as Commerciale[]);
  }, []);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        await loadPreventivi();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore sconosciuto");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [loadPreventivi]);

  const commercialiMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of commerciali) m.set(c.id, c.nome.toLowerCase());
    return m;
  }, [commerciali]);

  const preventiviFiltrati = useMemo(() => {
    const query = ricerca.trim().toLowerCase();
    const daTs = filtroDaDa ? new Date(filtroDaDa).getTime() : null;
    const aTs = filtroAData
      ? new Date(filtroAData).getTime() + 86_400_000
      : null;

    let risultato = preventivi.filter((preventivo) => {
      if (filtroCommercialeId) {
        if (preventivo.commerciale_id !== Number(filtroCommercialeId)) {
          return false;
        }
      }

      if (daTs || aTs) {
        const ts = new Date(preventivo.created_at).getTime();
        if (daTs && ts < daTs) return false;
        if (aTs && ts > aTs) return false;
      }

      if (!query) return true;

      const riferimento = preventivo.riferimento.toLowerCase();
      const cliente = (preventivo.cliente_nome ?? "").toLowerCase();
      const nomeComm = preventivo.commerciale_id
        ? (commercialiMap.get(preventivo.commerciale_id) ?? "")
        : "";
      return (
        riferimento.includes(query) ||
        cliente.includes(query) ||
        nomeComm.includes(query)
      );
    });

    risultato = [...risultato].sort((a, b) => {
      let confronto = 0;

      if (ordinamentoCampo === "data") {
        confronto =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else {
        confronto = calcolaTotale(a.righe) - calcolaTotale(b.righe);
      }

      return ordinamentoAsc ? confronto : -confronto;
    });

    setPagina(1);
    return risultato;
  }, [
    preventivi,
    ricerca,
    filtroCommercialeId,
    filtroDaDa,
    filtroAData,
    commercialiMap,
    ordinamentoCampo,
    ordinamentoAsc,
  ]);

  const totalePagine = Math.max(1, Math.ceil(preventiviFiltrati.length / PAGINA_SIZE));
  const preventiviPagina = preventiviFiltrati.slice(
    (pagina - 1) * PAGINA_SIZE,
    pagina * PAGINA_SIZE,
  );

  function handleOrdinamento(campo: OrdinamentoCampo) {
    if (ordinamentoCampo === campo) {
      setOrdinamentoAsc((prev) => !prev);
      return;
    }

    setOrdinamentoCampo(campo);
    setOrdinamentoAsc(false);
  }

  function etichettaOrdinamento(campo: OrdinamentoCampo) {
    const attivo = ordinamentoCampo === campo;
    const freccia = ordinamentoAsc ? " ↑" : " ↓";
    const etichetta = campo === "data" ? "Data" : "Importo";
    return attivo ? `${etichetta}${freccia}` : etichetta;
  }

  async function handleElimina(
    e: React.MouseEvent,
    preventivo: PreventivoConDettagli,
  ) {
    e.preventDefault();
    e.stopPropagation();

    const confermato = window.confirm(
      `Eliminare il preventivo "${preventivo.riferimento}"? L'operazione è irreversibile.`,
    );
    if (!confermato) return;

    setDeletingId(preventivo.id);
    setError(null);

    const supabase = createSupabaseClient();
    const { error: deleteError } = await supabase
      .from("preventivi")
      .delete()
      .eq("id", preventivo.id);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingId(null);
      return;
    }

    await loadPreventivi();
    setDeletingId(null);
  }

  async function handleDuplica(
    e: React.MouseEvent,
    preventivo: PreventivoConDettagli,
  ) {
    e.preventDefault();
    e.stopPropagation();

    setDuplicatingId(preventivo.id);
    setError(null);

    const supabase = createSupabaseClient();

    // Fetch full preventivo data for duplication
    const { data: prevFull, error: prevFullErr } = await supabase
      .from("preventivi")
      .select(
        `riferimento, commerciale_id, cliente_id, cliente_nome, cliente_cantiere,
        cliente_telefono, cliente_email, numero_preventivo, data_preventivo,
        validita_giorni, revisione, sconto_percentuale, sconto_percentuale_2,
        iva_percentuale, prezzo_netto_target, note_preventivo,
        condizioni_pagamento_tipo, condizioni_pagamento_acconto, condizioni_pagamento_testo`,
      )
      .eq("id", preventivo.id)
      .single();

    if (prevFullErr || !prevFull) {
      setError(prevFullErr?.message ?? "Errore nella lettura del preventivo");
      setDuplicatingId(null);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    let commercialeCorrenteId: number | null = null;
    if (user) {
      const { data: profilo } = await supabase
        .from("commerciali")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      commercialeCorrenteId = profilo?.id ?? null;
    }

    const { data: nuovoPreventivo, error: createError } = await supabase
      .from("preventivi")
      .insert({
        ...prevFull,
        riferimento: `${prevFull.riferimento} (copia)`,
        // Se l'originale non ha commerciale, assegna quello della sessione
        // (necessario per RLS insert del ruolo commerciale).
        commerciale_id: prevFull.commerciale_id ?? commercialeCorrenteId,
      })
      .select("id")
      .single();

    if (createError || !nuovoPreventivo) {
      setError(createError?.message ?? "Errore nella duplicazione del preventivo");
      setDuplicatingId(null);
      return;
    }

    try {
      // Fetch righe with flags
      const { data: righeOriginali, error: righeError } = await supabase
        .from("righe")
        .select(
          `id, prodotto_id, larghezza_cm, altezza_cm, lunghezza_cm, quantita, posa, prezzo_riga,
          descrizione_libera, prezzo_libero, prezzo_inserito, regola_applicata,
          posa_importo, posa_tipo, posa_manuale, posa_riga_separata, descrizione_tecnica,
          descrizione_cliente, nota, colore, colore_interno, colore_esterno, colore_ferramenta, vetro, ordine, visibile_pdf, tipo_riga, testo_libero,
          modalita_mq, mq_diretti, numero_posizione, riferimento_interno, parent_riga_id,
          righe_flag(flag_id)`,
        )
        .eq("preventivo_id", preventivo.id);

      if (righeError) throw new Error(righeError.message);

      const righe = righeOriginali ?? [];
      if (righe.length === 0) {
        await loadPreventivi();
        setDuplicatingId(null);
        return;
      }

      // Batch insert all righe
      const righePayload = righe.map((riga) => ({
        preventivo_id: nuovoPreventivo.id,
        prodotto_id: riga.prodotto_id,
        larghezza_cm: riga.larghezza_cm,
        altezza_cm: riga.altezza_cm,
        lunghezza_cm: riga.lunghezza_cm,
        quantita: riga.quantita,
        posa: riga.posa,
        prezzo_riga: riga.prezzo_riga,
        descrizione_libera: riga.descrizione_libera,
        descrizione_cliente: riga.descrizione_cliente,
        descrizione_tecnica: riga.descrizione_tecnica,
        nota: riga.nota,
        colore: riga.colore,
        colore_interno: riga.colore_interno,
        colore_esterno: riga.colore_esterno,
        colore_ferramenta: riga.colore_ferramenta,
        vetro: riga.vetro,
        prezzo_libero: riga.prezzo_libero,
        prezzo_inserito: riga.prezzo_inserito,
        regola_applicata: riga.regola_applicata,
        posa_importo: riga.posa_importo,
        posa_tipo: riga.posa_tipo,
        posa_manuale: riga.posa_manuale,
        posa_riga_separata: riga.posa_riga_separata,
        modalita_mq: riga.modalita_mq,
        mq_diretti: riga.mq_diretti,
        numero_posizione: riga.numero_posizione,
        riferimento_interno: riga.riferimento_interno,
        ordine: riga.ordine,
        visibile_pdf: riga.visibile_pdf,
        tipo_riga: riga.tipo_riga,
        testo_libero: riga.testo_libero,
        parent_riga_id: null as number | null,
      }));

      const { data: nuoveRighe, error: insertRigheError } = await supabase
        .from("righe")
        .insert(righePayload)
        .select("id");

      if (insertRigheError || !nuoveRighe) {
        throw new Error(insertRigheError?.message ?? "Errore nella copia delle righe");
      }

      // Remappa parent_riga_id delle righe posa sulla copia.
      const idMap = new Map<number, number>();
      for (let i = 0; i < righe.length; i++) {
        idMap.set(righe[i].id, nuoveRighe[i].id);
      }
      const aggiornamentiParent = righe
        .map((riga, i) => {
          if (riga.tipo_riga !== "posa" || riga.parent_riga_id == null) {
            return null;
          }
          const nuovoParent = idMap.get(riga.parent_riga_id);
          if (nuovoParent == null) return null;
          return { id: nuoveRighe[i].id, parent_riga_id: nuovoParent };
        })
        .filter(Boolean) as { id: number; parent_riga_id: number }[];

      for (const upd of aggiornamentiParent) {
        const { error: parentError } = await supabase
          .from("righe")
          .update({ parent_riga_id: upd.parent_riga_id })
          .eq("id", upd.id);
        if (parentError) throw new Error(parentError.message);
      }

      await pulisciRighePosaPreventivo(supabase, nuovoPreventivo.id);

      // Batch insert all flags
      const tuttiFlag: { riga_id: number; flag_id: number }[] = [];
      for (let i = 0; i < righe.length; i++) {
        const flagIds = (righe[i].righe_flag ?? []).map(
          (rf: { flag_id: number }) => rf.flag_id,
        );
        for (const flag_id of flagIds) {
          tuttiFlag.push({ riga_id: nuoveRighe[i].id, flag_id });
        }
      }

      if (tuttiFlag.length > 0) {
        const { error: flagError } = await supabase
          .from("righe_flag")
          .insert(tuttiFlag);
        if (flagError) throw new Error(flagError.message);
      }
    } catch (err) {
      // Cleanup: delete the partially created preventivo
      await supabase.from("preventivi").delete().eq("id", nuovoPreventivo.id);
      setError(err instanceof Error ? err.message : "Errore nella duplicazione");
      setDuplicatingId(null);
      return;
    }

    await loadPreventivi();
    setDuplicatingId(null);
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-brand-muted">Caricamento...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-10">
        <div className="mx-auto mb-8 flex max-w-md justify-center sm:max-w-lg">
          <Image
            src="/logo.png"
            alt="Bruno Drago"
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            className="h-20 w-auto sm:h-24"
            priority
          />
        </div>

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <NuovoPreventivoModal
            buttonClassName="inline-flex h-12 items-center justify-center rounded-md border-2 border-transparent bg-brand-accent px-10 text-base font-semibold text-white hover:bg-brand-accent-hover"
          />
          <Link
            href="/simulatore"
            className="inline-flex h-12 items-center justify-center rounded-md border-2 border-brand-navy bg-white px-8 text-base font-semibold text-brand-navy hover:bg-brand-surface"
          >
            Simulatore finanziamento
          </Link>
        </div>
      </header>

      <PageTitle meta="I tuoi preventivi salvati.">Preventivi</PageTitle>

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-brand-danger">
          {error}
        </p>
      )}

      {preventivi.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="Cerca"
            type="text"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Riferimento, cliente o commerciale..."
            list="home-clienti-rubrica"
            wrapperClassName="sm:col-span-3"
          />
          <datalist id="home-clienti-rubrica">
            {clientiNomi.map((nome) => (
              <option key={nome} value={nome} />
            ))}
          </datalist>
          <Input
            as="select"
            label="Commerciale"
            value={filtroCommercialeId}
            onChange={(e) => setFiltroCommercialeId(e.target.value)}
          >
            <option value="">Tutti</option>
            {commerciali.map((commerciale) => (
              <option key={commerciale.id} value={commerciale.id}>
                {commerciale.nome}
              </option>
            ))}
          </Input>
          <Input
            label="Da data"
            type="date"
            value={filtroDaDa}
            onChange={(e) => setFiltroDaDa(e.target.value)}
          />
          <Input
            label="A data"
            type="date"
            value={filtroAData}
            onChange={(e) => setFiltroAData(e.target.value)}
          />
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-sm text-brand-muted">Ordina per</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleOrdinamento("data")}
                className={`min-h-[44px] flex-1 rounded-md border px-3 text-sm ${
                  ordinamentoCampo === "data"
                    ? "border-brand-accent bg-brand-accent text-white"
                    : "border-brand-border bg-white text-brand-text"
                }`}
              >
                {etichettaOrdinamento("data")}
              </button>
              <button
                type="button"
                onClick={() => handleOrdinamento("importo")}
                className={`min-h-[44px] flex-1 rounded-md border px-3 text-sm ${
                  ordinamentoCampo === "importo"
                    ? "border-brand-accent bg-brand-accent text-white"
                    : "border-brand-border bg-white text-brand-text"
                }`}
              >
                {etichettaOrdinamento("importo")}
              </button>
            </div>
          </div>
          <p className="self-end text-sm text-brand-muted sm:col-span-3">
            {preventiviFiltrati.length === preventivi.length
              ? `${preventiviFiltrati.length} preventivi`
              : `${preventiviFiltrati.length} di ${preventivi.length} preventivi`}
          </p>
        </div>
      )}

      {preventivi.length > 0 ? (
        preventiviFiltrati.length > 0 ? (
        <>
        <ul className="space-y-3">
          {preventiviPagina.map((preventivo) => {
            const totale = calcolaTotale(preventivo.righe ?? []);
            const categorie = calcolaCategorie(preventivo.righe ?? []);
            const nomeComm = preventivo.commerciale_id
              ? commerciali.find((c) => c.id === preventivo.commerciale_id)?.nome
              : null;

            return (
              <li key={preventivo.id}>
                <Card compact className="flex items-stretch !p-0 overflow-hidden">
                  <Link
                    href={`/preventivo/${preventivo.id}`}
                    className="flex min-h-[72px] flex-1 items-center justify-between gap-4 px-4 py-3 hover:bg-brand-surface/80"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-brand-navy">
                        {titoloPreventivo(
                          preventivo.cliente_nome,
                          preventivo.riferimento,
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            preventivo.haVersione
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {preventivo.haVersione ? "Completato" : "Bozza"}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-brand-muted">
                        {formatData(preventivo.created_at)}
                      </p>
                      <p className="mt-0.5 text-xs text-brand-muted">
                        {nomeComm ? `Comm. ${nomeComm}` : "Commerciale non assegnato"}
                        {preventivo.numero_preventivo
                          ? ` · Offerta n. ${preventivo.numero_preventivo}`
                          : ""}
                      </p>
                      {categorie && (
                        <p className="mt-0.5 truncate text-xs text-brand-muted">
                          {categorie}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-lg font-semibold tabular-nums text-brand-accent">
                      {formatEuro(totale)}
                    </p>
                  </Link>
                  <div className="flex flex-col justify-center border-l border-brand-border">
                    <button
                      type="button"
                      onClick={(e) => handleDuplica(e, preventivo)}
                      disabled={duplicatingId === preventivo.id}
                      className="min-h-[36px] px-3 text-xs text-brand-muted hover:text-brand-navy hover:underline disabled:opacity-50"
                    >
                      {duplicatingId === preventivo.id ? "..." : "Duplica"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleElimina(e, preventivo)}
                      disabled={deletingId === preventivo.id}
                      className="min-h-[36px] px-3 text-xs text-brand-danger hover:underline disabled:opacity-50"
                    >
                      {deletingId === preventivo.id ? "..." : "Elimina"}
                    </button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
        {totalePagine > 1 && (
          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              type="button"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              className="min-h-[36px] rounded-md border border-brand-border px-4 text-sm text-brand-text hover:bg-brand-surface disabled:opacity-40"
            >
              ← Precedente
            </button>
            <span className="text-sm text-brand-muted">
              Pagina {pagina} di {totalePagine}
            </span>
            <button
              type="button"
              disabled={pagina >= totalePagine}
              onClick={() => setPagina((p) => Math.min(totalePagine, p + 1))}
              className="min-h-[36px] rounded-md border border-brand-border px-4 text-sm text-brand-text hover:bg-brand-surface disabled:opacity-40"
            >
              Successiva →
            </button>
          </div>
        )}
        </>
        ) : (
          <Card compact>
            <p className="text-sm text-brand-muted">
              Nessun preventivo corrisponde ai filtri selezionati.
            </p>
          </Card>
        )
      ) : (
        <Card compact>
          <p className="text-sm text-brand-muted">
            Nessun preventivo. Creane uno nuovo per iniziare.
          </p>
        </Card>
      )}
    </main>
  );
}
