"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Breadcrumb, PageTitle } from "@/components/ui";
import PreventivoCategoriaFormPage from "@/components/PreventivoCategoriaForm";
import { createSupabaseClient } from "@/lib/supabase";

type Sottocategoria = {
  id: number;
  categoria_id: number;
  nome: string;
  ordine: number;
};

export default function PreventivoCategoriaPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-4xl px-6 py-10">
          <p className="text-zinc-600">Caricamento...</p>
        </main>
      }
    >
      <CategoriaGate />
    </Suspense>
  );
}

function CategoriaGate() {
  const params = useParams<{ id: string; catId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const preventivoId = params.id;
  const categoriaId = params.catId;
  const rigaDaUrl = searchParams.get("riga");

  const [riferimento, setRiferimento] = useState<string | null>(null);
  const [nomeCategoria, setNomeCategoria] = useState<string | null>(null);
  const [sottocategorie, setSottocategorie] = useState<Sottocategoria[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setError(null);
      const supabase = createSupabaseClient();

      try {
        const [preventivoResult, categoriaResult, sottoResult, rigaResult] =
          await Promise.all([
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
              .from("sottocategorie")
              .select("id, categoria_id, nome, ordine")
              .eq("categoria_id", categoriaId)
              .order("ordine")
              .order("nome"),
            rigaDaUrl
              ? supabase
                  .from("righe")
                  .select("id, prodotti!inner(sottocategoria_id)")
                  .eq("id", rigaDaUrl)
                  .eq("preventivo_id", preventivoId)
                  .single()
              : Promise.resolve({ data: null, error: null }),
          ]);

        if (preventivoResult.error) throw new Error(preventivoResult.error.message);
        if (categoriaResult.error) throw new Error(categoriaResult.error.message);
        if (sottoResult.error) throw new Error(sottoResult.error.message);

        setRiferimento(preventivoResult.data.riferimento);
        setNomeCategoria(categoriaResult.data.nome);
        const elenco = (sottoResult.data ?? []) as Sottocategoria[];
        setSottocategorie(elenco);

        if (rigaDaUrl && elenco.length > 0) {
          if (rigaResult.error) throw new Error(rigaResult.error.message);

          const riga = rigaResult.data;
          const prodotto = Array.isArray(riga?.prodotti)
            ? riga.prodotti[0]
            : riga?.prodotti;
          const subId = prodotto?.sottocategoria_id;
          if (subId != null) {
            router.replace(
              `/preventivo/${preventivoId}/categoria/${categoriaId}/sottocategoria/${subId}?riga=${rigaDaUrl}`,
            );
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore sconosciuto");
        setSottocategorie([]);
      }
    }

    loadData();
  }, [preventivoId, categoriaId, rigaDaUrl, router]);

  if (error && sottocategorie === null) {
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

  if (sottocategorie === null) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <p className="text-zinc-600">Caricamento...</p>
      </main>
    );
  }

  if (sottocategorie.length === 0) {
    return <PreventivoCategoriaFormPage />;
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Breadcrumb
        items={[
          {
            label: riferimento ? `Preventivo ${riferimento}` : "Preventivo",
            href: `/preventivo/${preventivoId}`,
          },
          { label: nomeCategoria ?? "Categoria" },
        ]}
      />

      <PageTitle meta="Scegli una sottocategoria.">
        {nomeCategoria}
      </PageTitle>

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-brand-danger">
          {error}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sottocategorie.map((sotto) => (
          <li key={sotto.id}>
            <Link
              href={`/preventivo/${preventivoId}/categoria/${categoriaId}/sottocategoria/${sotto.id}`}
              prefetch={false}
              className="flex min-h-[72px] items-center justify-center rounded-lg border border-brand-border bg-white px-4 py-5 text-center font-medium text-brand-navy transition hover:border-brand-accent hover:text-brand-accent"
            >
              {sotto.nome}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
