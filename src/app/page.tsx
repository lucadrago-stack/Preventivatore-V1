import Link from "next/link";
import NuovoPreventivoModal from "@/components/NuovoPreventivoModal";
import { createSupabaseClient } from "@/lib/supabase";

type Preventivo = {
  id: number;
  riferimento: string;
  created_at: string;
};

function formatData(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function Home() {
  const supabase = createSupabaseClient();

  const { data: preventivi, error } = await supabase
    .from("preventivi")
    .select("id, riferimento, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Preventivatore</h1>
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          Errore nel caricamento dei preventivi: {error.message}
        </p>
      </main>
    );
  }

  const lista = (preventivi ?? []) as Preventivo[];

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-8">
        <div className="mb-4">
          <NuovoPreventivoModal />
        </div>
        <h1 className="text-2xl font-semibold">Preventivatore</h1>
        <p className="mt-1 text-sm text-zinc-600">
          I tuoi preventivi salvati.
        </p>
      </header>

      {lista.length > 0 ? (
        <ul className="space-y-2">
          {lista.map((preventivo) => (
            <li key={preventivo.id}>
              <Link
                href={`/preventivo/${preventivo.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-4 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                <span className="font-medium">{preventivo.riferimento}</span>
                <span className="text-sm text-zinc-500">
                  {formatData(preventivo.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-zinc-600">
          Nessun preventivo. Creane uno nuovo per iniziare.
        </p>
      )}
    </main>
  );
}
