import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase";

type Categoria = {
  id: number;
  nome: string;
  ordine: number;
};

export default async function PreventivoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseClient();

  const [preventivoResult, categorieResult] = await Promise.all([
    supabase.from("preventivi").select("id, riferimento").eq("id", id).single(),
    supabase.from("categorie").select("id, nome, ordine").order("ordine"),
  ]);

  if (preventivoResult.error || !preventivoResult.data) {
    notFound();
  }

  if (categorieResult.error) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          Errore nel caricamento delle categorie: {categorieResult.error.message}
        </p>
      </main>
    );
  }

  const preventivo = preventivoResult.data;
  const categorie = categorieResult.data as Categoria[];

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          ← Torna alla home
        </Link>
      </div>

      <header className="mb-8">
        <p className="text-sm text-zinc-500">Preventivo #{preventivo.id}</p>
        <h1 className="text-2xl font-semibold">{preventivo.riferimento}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Seleziona una categoria per aggiungere prodotti.
        </p>
      </header>

      {categorie.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categorie.map((categoria) => (
            <li key={categoria.id}>
              <Link
                href={`/preventivo/${id}/categoria/${categoria.id}`}
                className="block rounded-lg border border-zinc-200 bg-white px-4 py-5 text-center font-medium shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                {categoria.nome}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-zinc-600">
          Nessuna categoria disponibile.
        </p>
      )}
    </main>
  );
}
