"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { calcolaPrezzoRiga } from "@/lib/calcolo-prezzo";
import { createSupabaseClient } from "@/lib/supabase";

type TipoPrezzo = "mq" | "pezzo" | "ml";
type TipoFlag = "fisso" | "percentuale";

type Prodotto = {
  id: number;
  categoria_id: number;
  nome: string;
  tipo_prezzo: TipoPrezzo;
  prezzo_unitario: number;
  minimo: number | null;
  posa_prezzo: number | null;
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
  quantita: number;
  posa: boolean;
  prezzo_riga: number | null;
  prodotti: {
    id: number;
    nome: string;
    tipo_prezzo: TipoPrezzo;
    categoria_id: number;
    prezzo_unitario: number;
    minimo: number | null;
    posa_prezzo: number | null;
  };
  righe_flag: {
    flag_id: number;
    flag_supplementi: { nome: string } | { nome: string }[];
  }[];
};

function formatEuro(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function normalizzaRelazione<T>(val: T | T[]): T {
  return Array.isArray(val) ? val[0] : val;
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
): {
  valid: boolean;
  larghezzaCm: number | null;
  altezzaCm: number | null;
  lunghezzaCm: number | null;
} {
  if (prodotto.tipo_prezzo === "mq") {
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
      };
    }
    return {
      valid: true,
      larghezzaCm: larghezzaNum,
      altezzaCm: altezzaNum,
      lunghezzaCm: null,
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
      };
    }
    return {
      valid: true,
      larghezzaCm: null,
      altezzaCm: null,
      lunghezzaCm: lunghezzaNum,
    };
  }

  return {
    valid: true,
    larghezzaCm: null,
    altezzaCm: null,
    lunghezzaCm: null,
  };
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
    setFlagEsclusivi: (v: Record<number, string>) => void;
    setFlagMultipli: (v: Record<number, boolean>) => void;
  },
) {
  setters.setProdottoId(String(riga.prodotto_id));
  setters.setLarghezza(
    riga.larghezza_cm != null ? String(riga.larghezza_cm) : "",
  );
  setters.setAltezza(riga.altezza_cm != null ? String(riga.altezza_cm) : "");
  setters.setLunghezza(
    riga.lunghezza_cm != null ? String(riga.lunghezza_cm) : "",
  );
  setters.setQuantita(String(riga.quantita));
  setters.setPosa(riga.posa);

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
) {
  setLarghezza("");
  setAltezza("");
  setLunghezza("");
  setPosa(false);
  setFlagEsclusivi({});
  setFlagMultipli({});
}

export default function PreventivoCategoriaPage() {
  const params = useParams<{ id: string; catId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const preventivoId = params.id;
  const categoriaId = params.catId;
  const rigaDaUrl = searchParams.get("riga");

  const [riferimento, setRiferimento] = useState<string | null>(null);
  const [nomeCategoria, setNomeCategoria] = useState<string | null>(null);
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

  const [prodottoId, setProdottoId] = useState("");
  const [larghezza, setLarghezza] = useState("");
  const [altezza, setAltezza] = useState("");
  const [lunghezza, setLunghezza] = useState("");
  const [quantita, setQuantita] = useState("1");
  const [posa, setPosa] = useState(false);
  const [flagEsclusivi, setFlagEsclusivi] = useState<Record<number, string>>(
    {},
  );
  const [flagMultipli, setFlagMultipli] = useState<Record<number, boolean>>({});

  const isModifica = editingRigaId !== null;

  const formSetters = {
    setProdottoId,
    setLarghezza,
    setAltezza,
    setLunghezza,
    setQuantita,
    setPosa,
    setFlagEsclusivi,
    setFlagMultipli,
  };

  const prodottoSelezionato = useMemo(
    () => prodotti.find((p) => String(p.id) === prodottoId),
    [prodotti, prodottoId],
  );

  const prodottiFiltrati = useMemo(() => {
    const query = ricercaProdotto.trim().toLowerCase();
    if (!query) return prodotti;
    return prodotti.filter((p) => p.nome.toLowerCase().includes(query));
  }, [prodotti, ricercaProdotto]);

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
    const { data, error: righeError } = await supabase
      .from("righe")
      .select(
        `id, preventivo_id, prodotto_id, larghezza_cm, altezza_cm, lunghezza_cm, quantita, posa, prezzo_riga,
        prodotti!inner(id, nome, tipo_prezzo, categoria_id, prezzo_unitario, minimo, posa_prezzo),
        righe_flag(flag_id, flag_supplementi(nome))`,
      )
      .eq("preventivo_id", preventivoId)
      .eq("prodotti.categoria_id", categoriaId);

    if (righeError) throw new Error(righeError.message);

    const righeNormalizzate: RigaSalvata[] = (data ?? []).map((riga) => ({
      ...riga,
      prodotti: normalizzaRelazione(riga.prodotti),
      righe_flag: (riga.righe_flag ?? []).map((rf) => ({
        ...rf,
        flag_supplementi: normalizzaRelazione(rf.flag_supplementi),
      })),
    }));

    setRighe(righeNormalizzate);
    return righeNormalizzate;
  }, [preventivoId, categoriaId]);

  const loadTotalePreventivo = useCallback(async () => {
    const supabase = createSupabaseClient();
    const { data, error: totaleError } = await supabase
      .from("righe")
      .select("prezzo_riga")
      .eq("preventivo_id", preventivoId);

    if (totaleError) throw new Error(totaleError.message);

    const totale = (data ?? []).reduce(
      (sum, riga) => sum + (riga.prezzo_riga ?? 0),
      0,
    );
    setTotalePreventivo(totale);
    return totale;
  }, [preventivoId]);

  const refreshTotali = useCallback(async () => {
    await Promise.all([loadRighe(), loadTotalePreventivo()]);
  }, [loadRighe, loadTotalePreventivo]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      const supabase = createSupabaseClient();

      try {
        const [
          preventivoResult,
          categoriaResult,
          prodottiResult,
          gruppiResult,
        ] = await Promise.all([
          supabase
            .from("preventivi")
            .select("riferimento")
            .eq("id", preventivoId)
            .single(),
          supabase
            .from("categorie")
            .select("nome")
            .eq("id", categoriaId)
            .single(),
          supabase
            .from("prodotti")
            .select(
              "id, categoria_id, nome, tipo_prezzo, prezzo_unitario, minimo, posa_prezzo",
            )
            .eq("categoria_id", categoriaId)
            .order("nome"),
          supabase
            .from("gruppi_flag")
            .select(
              "id, categoria_id, nome, esclusivo, flag_supplementi(id, gruppo_id, nome, tipo, valore)",
            )
            .eq("categoria_id", categoriaId)
            .order("nome"),
        ]);

        if (preventivoResult.error) throw new Error(preventivoResult.error.message);
        if (categoriaResult.error) throw new Error(categoriaResult.error.message);
        if (prodottiResult.error) throw new Error(prodottiResult.error.message);
        if (gruppiResult.error) throw new Error(gruppiResult.error.message);

        const gruppiNormalizzati: GruppoFlag[] = (gruppiResult.data ?? []).map(
          (gruppo) => ({
            ...gruppo,
            flag_supplementi: (gruppo.flag_supplementi ?? []).map(
              (flag: FlagSupplemento) => flag,
            ),
          }),
        );

        setRiferimento(preventivoResult.data.riferimento);
        setNomeCategoria(categoriaResult.data.nome);
        setProdotti(prodottiResult.data as Prodotto[]);
        setGruppiFlag(gruppiNormalizzati);
        const righeCaricate = await loadRighe();
        await loadTotalePreventivo();

        if (rigaDaUrl) {
          const riga = righeCaricate.find((r) => String(r.id) === rigaDaUrl);
          if (riga) {
            setEditingRigaId(riga.id);
            popolaFormDaRiga(riga, gruppiNormalizzati, formSetters);
            setRicercaProdotto(riga.prodotti.nome);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore sconosciuto");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [preventivoId, categoriaId, loadRighe, loadTotalePreventivo, rigaDaUrl]);

  const prezzoAnteprima = useMemo(() => {
    if (!prodottoSelezionato) return null;

    const quantitaNum = Number(quantita);
    if (!Number.isFinite(quantitaNum) || quantitaNum <= 0) return null;

    const misure = parseMisureForm(
      prodottoSelezionato,
      larghezza,
      altezza,
      lunghezza,
    );
    if (!misure.valid) return null;

    return calcolaPrezzoRiga(
      prodottoSelezionato,
      {
        larghezza_cm: misure.larghezzaCm,
        altezza_cm: misure.altezzaCm,
        lunghezza_cm: misure.lunghezzaCm,
      },
      quantitaNum,
      posa,
      flagAttivi,
    );
  }, [
    prodottoSelezionato,
    larghezza,
    altezza,
    lunghezza,
    quantita,
    posa,
    flagAttivi,
  ]);

  const totaleCategoria = useMemo(
    () => righe.reduce((sum, riga) => sum + (riga.prezzo_riga ?? 0), 0),
    [righe],
  );

  function resetForm() {
    setProdottoId("");
    setRicercaProdotto("");
    setLarghezza("");
    setAltezza("");
    setLunghezza("");
    setQuantita("1");
    setPosa(false);
    setFlagEsclusivi({});
    setFlagMultipli({});
    setEditingRigaId(null);
  }

  function selezionaProdotto(prodotto: Prodotto) {
    setProdottoId(String(prodotto.id));
    setRicercaProdotto(prodotto.nome);
    resetCampiProdotto(
      setLarghezza,
      setAltezza,
      setLunghezza,
      setPosa,
      setFlagEsclusivi,
      setFlagMultipli,
    );
  }

  function handleModificaRiga(riga: RigaSalvata) {
    setEditingRigaId(riga.id);
    popolaFormDaRiga(riga, gruppiFlag, formSetters);
    setRicercaProdotto(riga.prodotti.nome);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleAnnullaModifica() {
    resetForm();
    router.replace(`/preventivo/${preventivoId}/categoria/${categoriaId}`);
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
    if (!prodottoSelezionato || prezzoAnteprima === null) return;

    const quantitaNum = Number(quantita);
    if (!Number.isFinite(quantitaNum) || quantitaNum <= 0) return;

    const misure = parseMisureForm(
      prodottoSelezionato,
      larghezza,
      altezza,
      lunghezza,
    );
    if (!misure.valid) return;

    setSaving(true);
    setError(null);

    const supabase = createSupabaseClient();

    if (isModifica && editingRigaId !== null) {
      const { error: updateError } = await supabase
        .from("righe")
        .update({
          prodotto_id: prodottoSelezionato.id,
          larghezza_cm: misure.larghezzaCm,
          altezza_cm: misure.altezzaCm,
          lunghezza_cm: misure.lunghezzaCm,
          quantita: quantitaNum,
          posa,
          prezzo_riga: prezzoAnteprima,
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

      await refreshTotali();
      resetForm();
      router.replace(`/preventivo/${preventivoId}/categoria/${categoriaId}`);
      setSaving(false);
      return;
    }

    const { data: nuovaRiga, error: insertError } = await supabase
      .from("righe")
      .insert({
        preventivo_id: Number(preventivoId),
        prodotto_id: prodottoSelezionato.id,
        larghezza_cm: misure.larghezzaCm,
        altezza_cm: misure.altezzaCm,
        lunghezza_cm: misure.lunghezzaCm,
        quantita: quantitaNum,
        posa,
        prezzo_riga: prezzoAnteprima,
      })
      .select("id")
      .single();

    if (insertError || !nuovaRiga) {
      setError(insertError?.message ?? "Errore nel salvataggio della riga");
      setSaving(false);
      return;
    }

    if (flagAttivi.length > 0) {
      const { error: flagError } = await supabase.from("righe_flag").insert(
        flagAttivi.map((flag) => ({
          riga_id: nuovaRiga.id,
          flag_id: flag.id,
        })),
      );

      if (flagError) {
        setError(flagError.message);
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

    await refreshTotali();
    setDuplicatingId(null);
  }

  async function handleEliminaRiga(rigaId: number) {
    setError(null);

    if (editingRigaId === rigaId) {
      resetForm();
    }

    const supabase = createSupabaseClient();

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
      return `${riga.larghezza_cm} × ${riga.altezza_cm} cm`;
    }
    if (riga.prodotti.tipo_prezzo === "ml") {
      return `${riga.lunghezza_cm} cm`;
    }
    return "—";
  }

  function formatFlagRiga(riga: RigaSalvata) {
    const nomi = riga.righe_flag
      .map((rf) => normalizzaRelazione(rf.flag_supplementi).nome)
      .filter(Boolean);
    return nomi.length > 0 ? nomi.join(", ") : "—";
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <p className="text-zinc-600">Caricamento...</p>
      </main>
    );
  }

  if (error && !riferimento) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          Errore: {error}
        </p>
        <Link
          href={`/preventivo/${preventivoId}`}
          className="mt-4 inline-block text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          Torna alle categorie
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6">
        <Link
          href={`/preventivo/${preventivoId}`}
          className="text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          ← Torna alle categorie
        </Link>
      </div>

      <header className="mb-8">
        <p className="text-sm text-zinc-500">{riferimento}</p>
        <h1 className="text-2xl font-semibold">{nomeCategoria}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {isModifica
            ? "Modifica la riga selezionata."
            : "Aggiungi prodotti al preventivo."}
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <p>
            <span className="text-zinc-500">Totale categoria: </span>
            <span className="font-semibold">{formatEuro(totaleCategoria)}</span>
          </p>
          <p>
            <span className="text-zinc-500">Totale preventivo: </span>
            <span className="font-semibold">{formatEuro(totalePreventivo)}</span>
          </p>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <section
        className={`mb-8 rounded-lg border bg-white p-4 ${
          isModifica ? "border-amber-300 ring-1 ring-amber-200" : "border-zinc-200"
        }`}
      >
        <h2 className="mb-4 text-sm font-medium text-zinc-700">
          {isModifica ? "Modifica riga" : "Nuova riga"}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm text-zinc-600">Prodotto</span>
            <input
              type="text"
              value={ricercaProdotto}
              onChange={(e) => {
                setRicercaProdotto(e.target.value);
                if (prodottoId) {
                  setProdottoId("");
                  resetCampiProdotto(
                    setLarghezza,
                    setAltezza,
                    setLunghezza,
                    setPosa,
                    setFlagEsclusivi,
                    setFlagMultipli,
                  );
                }
              }}
              placeholder="Cerca prodotto..."
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            {ricercaProdotto.trim() && !prodottoId && (
              <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-zinc-200 bg-white">
                {prodottiFiltrati.length > 0 ? (
                  prodottiFiltrati.map((prodotto) => (
                    <li key={prodotto.id}>
                      <button
                        type="button"
                        onClick={() => selezionaProdotto(prodotto)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                      >
                        {prodotto.nome}
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-2 text-sm text-zinc-500">
                    Nessun prodotto trovato.
                  </li>
                )}
              </ul>
            )}
            {prodottoSelezionato && (
              <p className="text-sm text-zinc-600">
                Selezionato:{" "}
                <span className="font-medium text-zinc-900">
                  {prodottoSelezionato.nome}
                </span>
              </p>
            )}
          </div>

          {prodottoSelezionato?.tipo_prezzo === "mq" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-zinc-600">Larghezza (cm)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={larghezza}
                  onChange={(e) => setLarghezza(e.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-zinc-600">Altezza (cm)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={altezza}
                  onChange={(e) => setAltezza(e.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
            </>
          )}

          {prodottoSelezionato?.tipo_prezzo === "ml" && (
            <label className="flex flex-col gap-1">
              <span className="text-sm text-zinc-600">Lunghezza (cm)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={lunghezza}
                onChange={(e) => setLunghezza(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600">Quantità</span>
            <input
              type="number"
              min="1"
              step="1"
              value={quantita}
              onChange={(e) => setQuantita(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>

          {prodottoSelezionato?.posa_prezzo != null && (
            <label className="flex items-center gap-2 self-end pb-2">
              <input
                type="checkbox"
                checked={posa}
                onChange={(e) => setPosa(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <span className="text-sm text-zinc-700">
                Posa ({formatEuro(prodottoSelezionato.posa_prezzo)})
              </span>
            </label>
          )}

          {gruppiFlag.map((gruppo) => (
            <fieldset
              key={gruppo.id}
              className="rounded-md border border-zinc-200 p-3 sm:col-span-2"
            >
              <legend className="px-1 text-sm font-medium text-zinc-700">
                {gruppo.nome}
              </legend>

              {gruppo.esclusivo ? (
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2">
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
                      className="h-4 w-4 border-zinc-300"
                    />
                    <span className="text-sm text-zinc-700">Nessuno</span>
                  </label>
                  {gruppo.flag_supplementi.map((flag) => (
                    <label key={flag.id} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`gruppo-${gruppo.id}`}
                        checked={flagEsclusivi[gruppo.id] === String(flag.id)}
                        onChange={() =>
                          setFlagEsclusivi((prev) => ({
                            ...prev,
                            [gruppo.id]: String(flag.id),
                          }))
                        }
                        className="h-4 w-4 border-zinc-300"
                      />
                      <span className="text-sm text-zinc-700">
                        {flag.nome}{" "}
                        {flag.tipo === "percentuale"
                          ? `(+${flag.valore}%)`
                          : `(+${formatEuro(flag.valore)})`}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  {gruppo.flag_supplementi.map((flag) => (
                    <label key={flag.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!flagMultipli[flag.id]}
                        onChange={(e) =>
                          setFlagMultipli((prev) => ({
                            ...prev,
                            [flag.id]: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                      <span className="text-sm text-zinc-700">
                        {flag.nome}{" "}
                        {flag.tipo === "percentuale"
                          ? `(+${flag.valore}%)`
                          : `(+${formatEuro(flag.valore)})`}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          ))}
        </div>

        <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
          <p className="text-sm text-zinc-600">
            Prezzo riga:{" "}
            <span className="text-base font-semibold text-zinc-900">
              {prezzoAnteprima !== null ? formatEuro(prezzoAnteprima) : "—"}
            </span>
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSalvaRiga}
            disabled={!prodottoSelezionato || prezzoAnteprima === null || saving}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : isModifica ? "Aggiorna" : "Aggiungi"}
          </button>
          {isModifica && (
            <button
              type="button"
              onClick={handleAnnullaModifica}
              disabled={saving}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              Annulla
            </button>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-700">
          Righe salvate ({righe.length})
        </h2>

        {righe.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
            Nessuna riga salvata in questa categoria.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">Prodotto</th>
                    <th className="px-4 py-2 font-medium">Misure</th>
                    <th className="px-4 py-2 font-medium">Flag</th>
                    <th className="px-4 py-2 font-medium">Qtà</th>
                    <th className="px-4 py-2 font-medium">Posa</th>
                    <th className="px-4 py-2 font-medium text-right">Prezzo</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((riga) => (
                    <tr
                      key={riga.id}
                      className={`border-b border-zinc-100 last:border-0 ${
                        editingRigaId === riga.id ? "bg-amber-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3">{riga.prodotti.nome}</td>
                      <td className="px-4 py-3">{formatMisure(riga)}</td>
                      <td className="px-4 py-3">{formatFlagRiga(riga)}</td>
                      <td className="px-4 py-3">{riga.quantita}</td>
                      <td className="px-4 py-3">{riga.posa ? "Sì" : "No"}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {riga.prezzo_riga != null
                          ? formatEuro(riga.prezzo_riga)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleModificaRiga(riga)}
                          className="mr-3 text-sm text-zinc-600 underline hover:text-zinc-900"
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicaRiga(riga)}
                          disabled={duplicatingId === riga.id}
                          className="mr-3 text-sm text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50"
                        >
                          {duplicatingId === riga.id ? "..." : "Duplica"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEliminaRiga(riga.id)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Elimina
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-right text-base font-semibold">
              Totale categoria: {formatEuro(totaleCategoria)}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
