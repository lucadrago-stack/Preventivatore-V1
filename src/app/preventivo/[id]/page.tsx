"use client";

import Link from "next/link";
import AllegatiPreventivoSection from "@/components/AllegatiPreventivoSection";
import AutosaveStatusIndicator from "@/components/AutosaveStatusIndicator";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Input,
  SectionTitle,
} from "@/components/ui";
import {
  caricaAllegatiPreventivo,
  type AllegatoPreventivo,
} from "@/lib/allegati-preventivo";
import { createSupabaseClient } from "@/lib/supabase";
import { formatEuro, formatDataPerInput, dataOggiPerInput, normalizzaRelazione, titoloPreventivo } from "@/lib/format";
import { hrefFormRigaPreventivo } from "@/lib/percorsi-preventivo";
import { puoAssegnareAltriCommerciali } from "@/lib/ruoli-utente";
import {
  autosaveInputHandlers,
  useAutosaveController,
  useFlushBeforeNavigate,
} from "@/hooks/useAutosave";
import {
  importoRigaCompleto,
  isCategoriaPosaAvanzata,
} from "@/lib/posa-categorie";
import type { SupabaseClient } from "@supabase/supabase-js";

const POSIZIONE_LIBERA_LABEL = "Posizione libera";

type ClienteRubrica = {
  id: number;
  nome: string;
  cantiere: string | null;
  telefono: string | null;
  email: string | null;
};

type TipoPrezzo = "mq" | "pezzo" | "ml";

type Categoria = {
  id: number;
  nome: string;
  ordine: number;
};

type RigaRiepilogo = {
  id: number;
  preventivo_id: number;
  prodotto_id: number | null;
  parent_riga_id: number | null;
  descrizione_libera: string | null;
  descrizione_cliente: string | null;
  descrizione_tecnica: string | null;
  prezzo_libero: number | null;
  larghezza_cm: number | null;
  altezza_cm: number | null;
  lunghezza_cm: number | null;
  quantita: number;
  posa: boolean;
  prezzo_riga: number | null;
  posa_importo: number | null;
  posa_riga_separata: boolean | null;
  tipo_riga: string | null;
  numero_posizione: number | null;
  riferimento_interno: string | null;
  modalita_mq: string | null;
  mq_diretti: number | null;
  prodotti: {
    id: number;
    nome: string;
    categoria_id: number;
    sottocategoria_id: number | null;
    tipo_prezzo: TipoPrezzo;
    descrizione_tecnica: string | null;
    categorie: {
      id: number;
      nome: string;
    } | null;
  } | null;
};

type GruppoRighe = {
  key: string;
  categoriaNome: string;
  categoriaId: number | null;
  righe: RigaRiepilogo[];
};

type Commerciale = {
  id: number;
  nome: string;
};

type DatiPreventivo = {
  commerciale_id: number | null;
  cliente_nome: string | null;
  cliente_cantiere: string | null;
  cliente_telefono: string | null;
  cliente_email: string | null;
  numero_preventivo: string | null;
  data_preventivo: string | null;
  validita_giorni: number | null;
  revisione: number | null;
};


function nomeRiga(riga: RigaRiepilogo) {
  if (riga.tipo_riga === "posa") {
    const raw =
      riga.descrizione_libera?.trim() ||
      riga.descrizione_tecnica?.trim() ||
      "Posa in opera";
    return raw.split("\n")[0]?.trim() || "Posa in opera";
  }
  if (riga.descrizione_tecnica?.trim()) {
    return riga.descrizione_tecnica;
  }
  if (riga.prodotto_id === null) {
    return riga.descrizione_libera ?? "—";
  }
  return (
    riga.prodotti?.descrizione_tecnica?.trim() ||
    riga.prodotti?.nome ||
    "—"
  );
}

function formatMisure(riga: RigaRiepilogo) {
  if (riga.prodotto_id === null) {
    return "—";
  }
  if (riga.prodotti?.tipo_prezzo === "mq") {
    if (riga.modalita_mq === "diretti" && riga.mq_diretti != null) {
      return `${riga.mq_diretti.toLocaleString("it-IT", {
        maximumFractionDigits: 4,
      })} mq`;
    }
    if (riga.larghezza_cm && riga.altezza_cm) {
      return `${riga.larghezza_cm} × ${riga.altezza_cm} cm`;
    }
  }
  if (riga.prodotti?.tipo_prezzo === "ml" && riga.lunghezza_cm) {
    return `${riga.lunghezza_cm} cm`;
  }
  return "—";
}

function calcolaSubtotale(righeGruppo: RigaRiepilogo[]) {
  return righeGruppo.reduce((sum, riga) => {
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

async function fetchRighePreventivo(
  supabase: SupabaseClient,
  preventivoId: string,
): Promise<RigaRiepilogo[]> {
  const { data, error: righeError } = await supabase
    .from("righe")
    .select(
      `id, preventivo_id, prodotto_id, parent_riga_id, descrizione_libera, descrizione_cliente, descrizione_tecnica, prezzo_libero, larghezza_cm, altezza_cm, lunghezza_cm, quantita, posa, prezzo_riga, posa_importo, posa_riga_separata, tipo_riga,
      numero_posizione, riferimento_interno, modalita_mq, mq_diretti,
      prodotti(id, nome, categoria_id, sottocategoria_id, tipo_prezzo, descrizione_tecnica, categorie(id, nome))`,
    )
    .eq("preventivo_id", preventivoId);

  if (righeError) throw new Error(righeError.message);

  return (data ?? []).map((riga) => {
    const prodotto = riga.prodotti
      ? normalizzaRelazione(riga.prodotti)
      : null;

    return {
      ...riga,
      prodotti: prodotto
        ? {
            ...prodotto,
            categorie: normalizzaRelazione(prodotto.categorie),
          }
        : null,
    };
  });
}

export default function PreventivoPage() {
  const params = useParams<{ id: string }>();
  const preventivoId = params.id;

  const [riferimento, setRiferimento] = useState<string | null>(null);
  const [categorie, setCategorie] = useState<Categoria[]>([]);
  const [commerciali, setCommerciali] = useState<Commerciale[]>([]);
  const [clientiRubrica, setClientiRubrica] = useState<ClienteRubrica[]>([]);
  const [righe, setRighe] = useState<RigaRiepilogo[]>([]);
  const [allegati, setAllegati] = useState<AllegatoPreventivo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingRiferimento, setEditingRiferimento] = useState(false);
  const datiAutosave = useAutosaveController();
  const [riferimentoDraft, setRiferimentoDraft] = useState("");
  const [savingRiferimento, setSavingRiferimento] = useState(false);
  const riferimentoInputRef = useRef<HTMLInputElement>(null);

  const [clienteNome, setClienteNome] = useState("");
  const [clienteCantiere, setClienteCantiere] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [numeroPreventivo, setNumeroPreventivo] = useState("");
  const [dataPreventivo, setDataPreventivo] = useState("");
  const [validitaGiorni, setValiditaGiorni] = useState("30");
  const [revisione, setRevisione] = useState("0");
  const [commercialeId, setCommercialeId] = useState("");
  const [mioCommercialeId, setMioCommercialeId] = useState<number | null>(null);
  const [puoScegliereCommerciale, setPuoScegliereCommerciale] = useState(false);
  const [snapDati, setSnapDati] = useState<string | null>(null);

  type DatiFormSnap = {
    clienteNome: string;
    clienteCantiere: string;
    clienteTelefono: string;
    clienteEmail: string;
    numeroPreventivo: string;
    dataPreventivo: string;
    validitaGiorni: string;
    revisione: string;
    commercialeId: string;
  };

  const formDatiRef = useRef<DatiFormSnap>({
    clienteNome: "",
    clienteCantiere: "",
    clienteTelefono: "",
    clienteEmail: "",
    numeroPreventivo: "",
    dataPreventivo: "",
    validitaGiorni: "30",
    revisione: "0",
    commercialeId: "",
  });
  const snapDatiRef = useRef<string | null>(null);
  const clientiRubricaRef = useRef(clientiRubrica);

  useEffect(() => {
    formDatiRef.current = {
      clienteNome,
      clienteCantiere,
      clienteTelefono,
      clienteEmail,
      numeroPreventivo,
      dataPreventivo,
      validitaGiorni,
      revisione,
      commercialeId,
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
    commercialeId,
  ]);

  useEffect(() => {
    snapDatiRef.current = snapDati;
  }, [snapDati]);

  useEffect(() => {
    clientiRubricaRef.current = clientiRubrica;
  }, [clientiRubrica]);

  const loadRighe = useCallback(async () => {
    const supabase = createSupabaseClient();
    setRighe(await fetchRighePreventivo(supabase, preventivoId));
  }, [preventivoId]);

  function popolaFormDatiPreventivo(
    dati: DatiPreventivo,
    forzatoCommercialeId?: number | null,
  ) {
    setClienteNome(dati.cliente_nome ?? "");
    setClienteCantiere(dati.cliente_cantiere ?? "");
    setClienteTelefono(dati.cliente_telefono ?? "");
    setClienteEmail(dati.cliente_email ?? "");
    setNumeroPreventivo(dati.numero_preventivo ?? "");
    setDataPreventivo(
      formatDataPerInput(dati.data_preventivo) || dataOggiPerInput(),
    );
    setValiditaGiorni(String(dati.validita_giorni ?? 30));
    setRevisione(String(dati.revisione ?? 0));
    const commercialeAssegnato =
      forzatoCommercialeId != null
        ? String(forzatoCommercialeId)
        : dati.commerciale_id != null
          ? String(dati.commerciale_id)
          : "";
    setCommercialeId(commercialeAssegnato);
  }

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      const supabase = createSupabaseClient();

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        let profiloId: number | null = null;
        let puoScegliere = false;
        if (user) {
          const { data: profilo } = await supabase
            .from("commerciali")
            .select("id, ruolo, sede_id")
            .eq("user_id", user.id)
            .maybeSingle();
          profiloId = profilo?.id ?? null;
          puoScegliere = puoAssegnareAltriCommerciali(profilo?.ruolo);
        }
        setMioCommercialeId(profiloId);
        setPuoScegliereCommerciale(puoScegliere);

        const [
          preventivoResult,
          categorieResult,
          commercialiResult,
          righeCaricate,
          allegatiCaricati,
          clientiResult,
        ] = await Promise.all([
          supabase
            .from("preventivi")
            .select(
              `id, riferimento, commerciale_id, cliente_nome, cliente_cantiere,
              cliente_telefono, cliente_email, numero_preventivo, data_preventivo,
              validita_giorni, revisione`,
            )
            .eq("id", preventivoId)
            .single(),
          supabase
            .from("categorie")
            .select("id, nome, ordine")
            .order("ordine"),
          supabase.from("commerciali").select("id, nome").order("nome"),
          fetchRighePreventivo(supabase, preventivoId),
          caricaAllegatiPreventivo(supabase, preventivoId),
          supabase
            .from("clienti")
            .select("id, nome, cantiere, telefono, email")
            .order("nome"),
        ]);

        if (preventivoResult.error) throw new Error(preventivoResult.error.message);
        if (categorieResult.error) throw new Error(categorieResult.error.message);
        if (commercialiResult.error) {
          throw new Error(commercialiResult.error.message);
        }

        const prev = preventivoResult.data;
        setRiferimento(prev.riferimento);
        // Commerciale semplice: sempre se stesso. Se manca in DB, forza il proprio id.
        const commercialeForzato =
          !puoScegliere && profiloId != null
            ? profiloId
            : prev.commerciale_id == null && profiloId != null
              ? profiloId
              : null;

        popolaFormDatiPreventivo(prev, commercialeForzato);
        const dataVal =
          formatDataPerInput(prev.data_preventivo) || dataOggiPerInput();
        const commercialeIdSnap =
          commercialeForzato != null
            ? String(commercialeForzato)
            : prev.commerciale_id != null
              ? String(prev.commerciale_id)
              : "";

        const patch: Record<string, unknown> = {};
        if (!prev.data_preventivo) patch.data_preventivo = dataVal;
        if (
          commercialeForzato != null &&
          prev.commerciale_id !== commercialeForzato
        ) {
          patch.commerciale_id = commercialeForzato;
        }
        if (Object.keys(patch).length > 0) {
          void supabase.from("preventivi").update(patch).eq("id", preventivoId);
        }

        setSnapDati(
          JSON.stringify({
            clienteNome: prev.cliente_nome ?? "",
            clienteCantiere: prev.cliente_cantiere ?? "",
            clienteTelefono: prev.cliente_telefono ?? "",
            clienteEmail: prev.cliente_email ?? "",
            numeroPreventivo: prev.numero_preventivo ?? "",
            dataPreventivo: dataVal,
            validitaGiorni: String(prev.validita_giorni ?? 30),
            revisione: String(prev.revisione ?? 0),
            commercialeId: commercialeIdSnap,
          }),
        );
        setCategorie(categorieResult.data as Categoria[]);
        setCommerciali(commercialiResult.data as Commerciale[]);
        setRighe(righeCaricate);
        setAllegati(allegatiCaricati);
        if (!clientiResult.error && clientiResult.data) {
          setClientiRubrica(clientiResult.data as ClienteRubrica[]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore sconosciuto");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [preventivoId]);

  useEffect(() => {
    if (editingRiferimento) {
      riferimentoInputRef.current?.focus();
      riferimentoInputRef.current?.select();
    }
  }, [editingRiferimento]);

  function avviaModificaRiferimento() {
    setRiferimentoDraft(riferimento ?? "");
    setEditingRiferimento(true);
    setError(null);
  }

  function annullaModificaRiferimento() {
    setEditingRiferimento(false);
    setRiferimentoDraft("");
  }

  async function handleSalvaRiferimento() {
    const nuovoRiferimento = riferimentoDraft.trim();
    if (!nuovoRiferimento) {
      setError("Il riferimento non può essere vuoto.");
      return;
    }

    if (nuovoRiferimento === riferimento) {
      annullaModificaRiferimento();
      return;
    }

    setSavingRiferimento(true);
    setError(null);

    const supabase = createSupabaseClient();
    const { error: updateError } = await supabase
      .from("preventivi")
      .update({ riferimento: nuovoRiferimento })
      .eq("id", preventivoId);

    if (updateError) {
      setError(updateError.message);
      setSavingRiferimento(false);
      return;
    }

    setRiferimento(nuovoRiferimento);
    setEditingRiferimento(false);
    setRiferimentoDraft("");
    setSavingRiferimento(false);
  }

  const gruppiRighe = useMemo(() => {
    const gruppi = new Map<number, GruppoRighe>();
    const righeLibere: RigaRiepilogo[] = [];
    const byId = new Map(righe.map((r) => [r.id, r]));

    function categoriaDi(riga: RigaRiepilogo): {
      catId: number;
      catNome: string;
    } | null {
      if (riga.prodotti) {
        return {
          catId: riga.prodotti.categoria_id,
          catNome: riga.prodotti.categorie?.nome ?? "Senza categoria",
        };
      }
      // Posa (e simili): risali al prodotto padre via parent_riga_id
      if (riga.parent_riga_id != null) {
        const padre = byId.get(riga.parent_riga_id);
        if (padre?.prodotti) {
          return {
            catId: padre.prodotti.categoria_id,
            catNome: padre.prodotti.categorie?.nome ?? "Senza categoria",
          };
        }
      }
      return null;
    }

    for (const riga of righe) {
      const cat = categoriaDi(riga);
      if (!cat) {
        if (riga.prodotto_id === null) {
          righeLibere.push(riga);
        }
        continue;
      }

      if (!gruppi.has(cat.catId)) {
        gruppi.set(cat.catId, {
          key: `cat-${cat.catId}`,
          categoriaId: cat.catId,
          categoriaNome: cat.catNome,
          righe: [],
        });
      }
      gruppi.get(cat.catId)!.righe.push(riga);
    }

    for (const gruppo of gruppi.values()) {
      gruppo.righe.sort((a, b) => {
        // Posa subito dopo il padre quando possibile
        const ordA =
          a.parent_riga_id != null
            ? (byId.get(a.parent_riga_id)?.numero_posizione ?? a.numero_posizione ?? Number.MAX_SAFE_INTEGER) +
              0.5
            : (a.numero_posizione ?? Number.MAX_SAFE_INTEGER);
        const ordB =
          b.parent_riga_id != null
            ? (byId.get(b.parent_riga_id)?.numero_posizione ?? b.numero_posizione ?? Number.MAX_SAFE_INTEGER) +
              0.5
            : (b.numero_posizione ?? Number.MAX_SAFE_INTEGER);
        if (ordA !== ordB) return ordA - ordB;
        return a.id - b.id;
      });
    }
    righeLibere.sort((a, b) => {
      const na = a.numero_posizione ?? Number.MAX_SAFE_INTEGER;
      const nb = b.numero_posizione ?? Number.MAX_SAFE_INTEGER;
      if (na !== nb) return na - nb;
      return a.id - b.id;
    });

    const ordineCategorie = new Map(
      categorie.map((c, index) => [c.id, index]),
    );

    const risultato = Array.from(gruppi.values()).sort((a, b) => {
      const ordA = ordineCategorie.get(a.categoriaId!) ?? 999;
      const ordB = ordineCategorie.get(b.categoriaId!) ?? 999;
      return ordA - ordB;
    });

    if (righeLibere.length > 0) {
      risultato.push({
        key: "libera",
        categoriaId: null,
        categoriaNome: POSIZIONE_LIBERA_LABEL,
        righe: righeLibere,
      });
    }

    return risultato;
  }, [righe, categorie]);

  // Stessa regola dei subtotali categoria: con posa_riga_separata (o tipo posa)
  // non sommare posa_importo sul prodotto (evita doppio conteggio).
  const totaleGenerale = useMemo(() => calcolaSubtotale(righe), [righe]);

  function handleSelezionaCliente(nome: string) {
    setClienteNome(nome);
    const match = clientiRubrica.find(
      (c) => c.nome.toLowerCase() === nome.toLowerCase(),
    );
    if (match) {
      setClienteCantiere(match.cantiere ?? "");
      setClienteTelefono(match.telefono ?? "");
      setClienteEmail(match.email ?? "");
    }
  }

  function serializzaDatiForm(dati: DatiFormSnap) {
    return JSON.stringify(dati);
  }

  const persistDatiForm = useCallback(async (dati: DatiFormSnap) => {
    const validitaNum = Number(dati.validitaGiorni);
    const revisioneNum = Number(dati.revisione);

    if (!Number.isFinite(validitaNum) || validitaNum < 0) {
      throw new Error("La validità in giorni deve essere un numero valido.");
    }
    if (!Number.isFinite(revisioneNum) || revisioneNum < 0) {
      throw new Error("La revisione deve essere un numero valido.");
    }

    const supabase = createSupabaseClient();
    const rubrica = clientiRubricaRef.current;

    let clienteId: number | null = null;
    const nomeTrimmed = dati.clienteNome.trim();
    if (nomeTrimmed) {
      const existing = rubrica.find(
        (c) => c.nome.toLowerCase() === nomeTrimmed.toLowerCase(),
      );
      if (existing) {
        clienteId = existing.id;
        await supabase
          .from("clienti")
          .update({
            cantiere: dati.clienteCantiere.trim() || null,
            telefono: dati.clienteTelefono.trim() || null,
            email: dati.clienteEmail.trim() || null,
          })
          .eq("id", existing.id);
      } else {
        const { data: nuovoCliente } = await supabase
          .from("clienti")
          .insert({
            nome: nomeTrimmed,
            cantiere: dati.clienteCantiere.trim() || null,
            telefono: dati.clienteTelefono.trim() || null,
            email: dati.clienteEmail.trim() || null,
          })
          .select("id")
          .single();
        if (nuovoCliente) {
          clienteId = nuovoCliente.id;
          setClientiRubrica((prev) => [
            ...prev,
            {
              id: nuovoCliente.id,
              nome: nomeTrimmed,
              cantiere: dati.clienteCantiere.trim() || null,
              telefono: dati.clienteTelefono.trim() || null,
              email: dati.clienteEmail.trim() || null,
            },
          ]);
        }
      }
    }

    const commercialeIdDaSalvare = !puoScegliereCommerciale && mioCommercialeId != null
      ? mioCommercialeId
      : dati.commercialeId
        ? Number(dati.commercialeId)
        : mioCommercialeId;

    if (commercialeIdDaSalvare == null) {
      throw new Error(
        "Commerciale non assegnato. Contatta l'amministratore per collegare il profilo.",
      );
    }

    const { error: updateError } = await supabase
      .from("preventivi")
      .update({
        commerciale_id: commercialeIdDaSalvare,
        cliente_id: clienteId,
        cliente_nome: nomeTrimmed || null,
        cliente_cantiere: dati.clienteCantiere.trim() || null,
        cliente_telefono: dati.clienteTelefono.trim() || null,
        cliente_email: dati.clienteEmail.trim() || null,
        numero_preventivo: dati.numeroPreventivo.trim() || null,
        data_preventivo: dati.dataPreventivo || null,
        validita_giorni: validitaNum,
        revisione: revisioneNum,
      })
      .eq("id", preventivoId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const datiConCommerciale = {
      ...dati,
      commercialeId: String(commercialeIdDaSalvare),
    };
    if (dati.commercialeId !== datiConCommerciale.commercialeId) {
      setCommercialeId(datiConCommerciale.commercialeId);
      formDatiRef.current = {
        ...formDatiRef.current,
        commercialeId: datiConCommerciale.commercialeId,
      };
    }

    const snap = serializzaDatiForm(datiConCommerciale);
    snapDatiRef.current = snap;
    setSnapDati(snap);
    setError(null);
  }, [preventivoId, mioCommercialeId, puoScegliereCommerciale]);

  const triggerAutosaveDati = useCallback(() => {
    const dati = formDatiRef.current;
    const corrente = serializzaDatiForm(dati);
    if (snapDatiRef.current != null && corrente === snapDatiRef.current) {
      return;
    }
    void datiAutosave
      .run(async () => {
        try {
          await persistDatiForm(formDatiRef.current);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Errore salvataggio");
          throw err;
        }
      })
      .catch(() => {
        /* stato errore già impostato */
      });
  }, [datiAutosave, persistDatiForm]);

  const flushDatiPrimaDiNavigare = useCallback(async () => {
    const dati = formDatiRef.current;
    const corrente = serializzaDatiForm(dati);
    if (snapDatiRef.current == null || corrente !== snapDatiRef.current) {
      await datiAutosave.run(async () => {
        await persistDatiForm(formDatiRef.current);
      });
    } else {
      await datiAutosave.flush();
    }
  }, [datiAutosave, persistDatiForm]);

  async function handleEliminaRiga(rigaId: number) {
    setError(null);
    setDeletingId(rigaId);

    const supabase = createSupabaseClient();

    const { error: flagDeleteError } = await supabase
      .from("righe_flag")
      .delete()
      .eq("riga_id", rigaId);

    if (flagDeleteError) {
      setError(flagDeleteError.message);
      setDeletingId(null);
      return;
    }

    const { error: deleteError } = await supabase
      .from("righe")
      .delete()
      .eq("id", rigaId);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingId(null);
      return;
    }

    await loadRighe();
    setDeletingId(null);
  }

  const datiCorrenti = serializzaDatiForm({
    clienteNome,
    clienteCantiere,
    clienteTelefono,
    clienteEmail,
    numeroPreventivo,
    dataPreventivo,
    validitaGiorni,
    revisione,
    commercialeId,
  });
  const datiDirty = snapDati != null && datiCorrenti !== snapDati;

  useFlushBeforeNavigate({
    isDirty: datiDirty,
    isSaving: datiAutosave.isSaving,
    flush: flushDatiPrimaDiNavigare,
  });

  const autosaveField = autosaveInputHandlers(triggerAutosaveDati);

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
          href="/"
          className="mt-4 inline-block text-sm text-brand-muted underline hover:text-brand-navy"
        >
          Torna alla home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-brand-muted underline hover:text-brand-navy"
      >
        ← Home
      </Link>

      <header className="mb-8">
        <p className="text-sm text-brand-muted">Preventivo #{preventivoId}</p>

        {editingRiferimento ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              ref={riferimentoInputRef}
              type="text"
              value={riferimentoDraft}
              onChange={(e) => setRiferimentoDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSalvaRiferimento();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  annullaModificaRiferimento();
                }
              }}
              disabled={savingRiferimento}
              className="min-h-[44px] min-w-[12rem] flex-1 rounded-md border border-brand-border px-3 text-2xl font-semibold text-brand-navy outline-none focus:border-brand-accent disabled:opacity-50"
              aria-label="Nuovo riferimento preventivo"
            />
            <Button
              variant="secondary"
              onClick={handleSalvaRiferimento}
              disabled={savingRiferimento}
            >
              {savingRiferimento ? "Salvataggio..." : "Salva"}
            </Button>
            <Button
              variant="tertiary"
              onClick={annullaModificaRiferimento}
              disabled={savingRiferimento}
            >
              Annulla
            </Button>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">
              {titoloPreventivo(clienteNome, riferimento)}
            </h1>
            <button
              type="button"
              onClick={avviaModificaRiferimento}
              className="rounded-md p-2 text-brand-muted hover:bg-white hover:text-brand-navy"
              aria-label="Modifica riferimento"
              title="Modifica riferimento"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="m2.695 14.762-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" />
              </svg>
            </button>
          </div>
        )}

        {clienteCantiere.trim() && (
          <p className="mt-1 text-sm text-brand-muted">
            {clienteCantiere.trim()}
          </p>
        )}

        <div className="mt-5">
          <Link
            href={`/preventivo/${preventivoId}/componi`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-brand-accent px-6 py-2 text-sm font-semibold text-white hover:bg-brand-accent-hover"
          >
            Componi preventivo cliente
          </Link>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-brand-danger">
          {error}
        </p>
      )}

      <Card className="mb-10">
        <div className="mb-4 flex items-start justify-between gap-3">
          <SectionTitle className="mb-0">Scheda cliente e offerta</SectionTitle>
          <AutosaveStatusIndicator
            status={datiAutosave.status}
            onRetry={datiAutosave.retry}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-brand-border bg-brand-surface/60 p-4">
            <p className="mb-3 text-xs font-semibold tracking-wide text-brand-navy">
              CLIENTE
            </p>
            <div className="grid grid-cols-1 gap-3">
          <Input
            label="Nome"
            value={clienteNome}
            list="clienti-rubrica"
            onChange={(e) => {
              setClienteNome(e.target.value);
              handleSelezionaCliente(e.target.value);
            }}
            {...autosaveField}
          />
          <datalist id="clienti-rubrica">
            {clientiRubrica.map((c) => (
              <option key={c.id} value={c.nome} />
            ))}
          </datalist>
          <Input
            label="Cantiere"
            value={clienteCantiere}
            onChange={(e) => setClienteCantiere(e.target.value)}
            {...autosaveField}
          />
          <Input
            label="Telefono"
            type="tel"
            inputMode="tel"
            value={clienteTelefono}
            onChange={(e) => setClienteTelefono(e.target.value)}
            {...autosaveField}
          />
          <Input
            label="Email"
            type="email"
            value={clienteEmail}
            onChange={(e) => setClienteEmail(e.target.value)}
            {...autosaveField}
          />
            </div>
          </div>
          <div className="rounded-md border border-brand-border bg-brand-surface/60 p-4">
            <p className="mb-3 text-xs font-semibold tracking-wide text-brand-navy">
              OFFERTA
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Numero preventivo"
            value={numeroPreventivo}
            onChange={(e) => setNumeroPreventivo(e.target.value)}
            {...autosaveField}
          />
          <Input
            label="Data"
            type="date"
            value={dataPreventivo}
            onChange={(e) => {
              const value = e.target.value;
              setDataPreventivo(value);
              formDatiRef.current = {
                ...formDatiRef.current,
                dataPreventivo: value,
              };
              triggerAutosaveDati();
            }}
            onBlur={autosaveField.onBlur}
          />
          <Input
            label="Validità (giorni)"
            type="number"
            min={0}
            inputMode="numeric"
            value={validitaGiorni}
            onChange={(e) => setValiditaGiorni(e.target.value)}
            {...autosaveField}
          />
          <Input
            label="Revisione"
            type="number"
            min={0}
            inputMode="numeric"
            value={revisione}
            onChange={(e) => setRevisione(e.target.value)}
            {...autosaveField}
          />
          <Input
            as="select"
            label="Commerciale"
            value={commercialeId}
            disabled={!puoScegliereCommerciale}
            onChange={(e) => {
              if (!puoScegliereCommerciale) return;
              const value = e.target.value;
              setCommercialeId(value);
              formDatiRef.current = {
                ...formDatiRef.current,
                commercialeId: value,
              };
              triggerAutosaveDati();
            }}
            onBlur={autosaveField.onBlur}
            wrapperClassName="sm:col-span-2"
          >
            {puoScegliereCommerciale && (
              <option value="">Seleziona un commerciale</option>
            )}
            {commerciali
              .filter((c) =>
                puoScegliereCommerciale
                  ? true
                  : mioCommercialeId != null && c.id === mioCommercialeId,
              )
              .map((commerciale) => (
                <option key={commerciale.id} value={commerciale.id}>
                  {commerciale.nome}
                </option>
              ))}
          </Input>
            </div>
          </div>
        </div>
      </Card>

      <section className="mb-10">
        <SectionTitle className="mb-4">Categorie</SectionTitle>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categorie.map((categoria) => (
            <li key={categoria.id}>
              <Link
                href={`/preventivo/${preventivoId}/categoria/${categoria.id}`}
                prefetch={false}
                className="flex min-h-[72px] items-center justify-center rounded-lg border border-brand-border bg-white px-4 py-5 text-center font-medium text-brand-navy transition hover:border-brand-accent hover:text-brand-accent"
              >
                {categoria.nome}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href={`/preventivo/${preventivoId}/libera`}
              prefetch={false}
              className="flex min-h-[72px] items-center justify-center rounded-lg border border-dashed border-brand-accent/40 bg-white px-4 py-5 text-center font-medium text-brand-accent transition hover:border-brand-accent hover:bg-brand-accent/5"
            >
              Posizione libera
            </Link>
          </li>
        </ul>
      </section>

      <div className="mb-10">
        <AllegatiPreventivoSection
          preventivoId={preventivoId}
          initialAllegati={allegati ?? undefined}
        />
      </div>

      <section>
        <SectionTitle className="mb-4">Riepilogo preventivo</SectionTitle>

        {righe.length === 0 ? (
          <Card compact>
            <p className="text-sm text-brand-muted">
              Nessun prodotto aggiunto ancora.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {gruppiRighe.map((gruppo) => {
              const subtotale = calcolaSubtotale(gruppo.righe);

              return (
              <div
                key={gruppo.key}
                className="overflow-hidden rounded-lg border border-brand-border bg-white"
              >
                <h3 className="border-b border-brand-border bg-brand-navy px-4 py-2.5 text-sm font-medium text-white">
                  {gruppo.categoriaNome}
                </h3>
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-brand-border bg-brand-surface text-brand-muted">
                    <tr>
                      <th className="w-10 px-2 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Prodotto</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">
                        Rif.
                      </th>
                      <th className="px-3 py-2 font-medium">Misure</th>
                      <th className="px-3 py-2 font-medium">Qtà</th>
                      <th className="px-3 py-2 font-medium text-right">
                        Prezzo
                      </th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {gruppo.righe.map((riga) => {
                      const categoriaNomeRiga =
                        riga.prodotti?.categorie?.nome ?? gruppo.categoriaNome;
                      const posaAvanzata = isCategoriaPosaAvanzata(
                        categoriaNomeRiga,
                      );
                      const posaImporto =
                        posaAvanzata && riga.posa && !riga.posa_riga_separata
                          ? (riga.posa_importo ?? 0)
                          : 0;
                      const importoMostrato =
                        riga.tipo_riga === "posa"
                          ? riga.prezzo_riga
                          : riga.posa_riga_separata
                            ? riga.prezzo_riga
                            : riga.prezzo_riga == null && posaImporto === 0
                              ? null
                              : importoRigaCompleto(
                                  riga.prezzo_riga,
                                  posaImporto,
                                );

                      return (
                        <tr
                          key={riga.id}
                          className="border-b border-zinc-100"
                        >
                        <td className="px-3 py-3 text-zinc-500 tabular-nums">
                          {riga.numero_posizione ?? "—"}
                        </td>
                        <td className="px-4 py-3">{nomeRiga(riga)}</td>
                        <td className="px-4 py-3 text-zinc-600">
                          {riga.riferimento_interno?.trim() || "—"}
                        </td>
                        <td className="px-4 py-3">{formatMisure(riga)}</td>
                        <td className="px-4 py-3">{riga.quantita}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          {importoMostrato != null
                            ? formatEuro(importoMostrato)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {riga.prodotto_id !== null && gruppo.categoriaId !== null && (
                            <Link
                              href={hrefFormRigaPreventivo(
                                preventivoId,
                                gruppo.categoriaId,
                                riga.prodotti?.sottocategoria_id,
                                riga.id,
                              )}
                              className="mr-3 text-xs text-brand-muted hover:text-brand-navy hover:underline"
                            >
                              Modifica
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEliminaRiga(riga.id)}
                            disabled={deletingId === riga.id}
                            className="text-xs text-brand-danger hover:underline disabled:opacity-50"
                          >
                            {deletingId === riga.id ? "..." : "Elimina"}
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                    <tr className="border-t border-brand-border bg-brand-surface font-semibold text-brand-navy">
                      <td className="px-3 py-2.5" colSpan={5}>
                        Subtotale {gruppo.categoriaNome}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatEuro(subtotale)}
                      </td>
                      <td className="px-3 py-2.5"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              );
            })}

            <div className="rounded-lg bg-brand-navy px-4 py-4 text-right text-white">
              <p className="text-xs uppercase tracking-wide text-white/70">
                Totale generale
              </p>
              <p className="text-2xl font-semibold tabular-nums text-white">
                {formatEuro(totaleGenerale)}
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
