import { redirect } from "next/navigation";
import AdminParametriClient from "@/components/admin-parametri/AdminParametriClient";
import type { ProdottoAdmin } from "@/components/admin-parametri/TabProdotti";
import type { GrigliaAdmin } from "@/components/admin-parametri/TabGriglie";
import type {
  ConfigFinanziamentoRow,
  ConvenzioneRow,
} from "@/components/admin-parametri/TabFinanziamento";
import type { OpzioneLista } from "@/components/admin-parametri/TabTendine";
import type { ServizioDefault } from "@/components/admin-parametri/TabServizi";
import { PageTitle } from "@/components/ui";
import { getSessioneUtente } from "@/lib/auth";
import {
  CHIAVE_DESCRIZIONE_POSA,
  DESCRIZIONE_POSA_DEFAULT_FALLBACK,
} from "@/lib/riga-posa";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function AdminParametriPage() {
  const sessione = await getSessioneUtente();
  if (!sessione?.isAdmin) {
    redirect("/");
  }

  const supabase = await createSupabaseServerClient();

  const [
    prodottiResult,
    griglieResult,
    configResult,
    convResult,
    coloriResult,
    vetriResult,
    serviziResult,
    posaResult,
  ] = await Promise.all([
    supabase
      .from("prodotti")
      .select(
        "id, nome, prezzo_unitario, regola_prezzo, regola_valore, ha_vetro, descrizione_cliente, categorie(id, nome)",
      )
      .order("nome"),
    supabase.from("griglie_prezzo").select("id, nome, attivo").order("id"),
    supabase
      .from("config_finanziamento")
      .select("chiave, valore, descrizione")
      .order("chiave"),
    supabase
      .from("convenzioni_finanziamento")
      .select(
        "id, durata_mesi, tan, tipo, regola_maggiorazione, famiglia, doppio_piano, attivo, ordine, tan_prima_meta",
      )
      .order("ordine"),
    supabase
      .from("opzioni_colore")
      .select("id, valore, ordine")
      .order("ordine"),
    supabase
      .from("opzioni_vetro")
      .select("id, valore, ordine")
      .order("ordine"),
    supabase
      .from("servizi_complementari_default")
      .select("id, descrizione, nota, importo, ordine")
      .order("ordine"),
    supabase
      .from("config_sistema")
      .select("valore")
      .eq("chiave", CHIAVE_DESCRIZIONE_POSA)
      .maybeSingle(),
  ]);

  if (prodottiResult.error) throw new Error(prodottiResult.error.message);
  if (configResult.error) throw new Error(configResult.error.message);
  if (convResult.error) throw new Error(convResult.error.message);
  if (coloriResult.error) throw new Error(coloriResult.error.message);
  if (vetriResult.error) throw new Error(vetriResult.error.message);

  const griglieMissing =
    Boolean(griglieResult.error) &&
    /does not exist|relation|schema cache/i.test(
      griglieResult.error?.message ?? "",
    );

  if (griglieResult.error && !griglieMissing) {
    throw new Error(griglieResult.error.message);
  }

  const serviziMissing =
    Boolean(serviziResult.error) &&
    /does not exist|relation|schema cache/i.test(
      serviziResult.error?.message ?? "",
    );

  if (serviziResult.error && !serviziMissing) {
    throw new Error(serviziResult.error.message);
  }

  const posaMissing =
    Boolean(posaResult.error) &&
    /does not exist|relation|schema cache/i.test(
      posaResult.error?.message ?? "",
    );

  if (posaResult.error && !posaMissing) {
    throw new Error(posaResult.error.message);
  }

  const descrizionePosa =
    posaResult.data?.valore?.trim() || DESCRIZIONE_POSA_DEFAULT_FALLBACK;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <PageTitle meta="Catalogo, griglie listino, finanziamento, tendine, servizi e posa.">
        Parametri
      </PageTitle>
      <div className="mt-6">
        <AdminParametriClient
          prodotti={(prodottiResult.data ?? []) as ProdottoAdmin[]}
          griglie={(griglieResult.data ?? []) as GrigliaAdmin[]}
          griglieTableMissing={griglieMissing}
          configFinanziamento={
            (configResult.data ?? []) as ConfigFinanziamentoRow[]
          }
          convenzioni={(convResult.data ?? []) as ConvenzioneRow[]}
          colori={(coloriResult.data ?? []) as OpzioneLista[]}
          vetri={(vetriResult.data ?? []) as OpzioneLista[]}
          serviziDefault={(serviziResult.data ?? []) as ServizioDefault[]}
          serviziTableMissing={serviziMissing}
          descrizionePosa={descrizionePosa}
          posaTableMissing={posaMissing}
        />
      </div>
    </main>
  );
}
