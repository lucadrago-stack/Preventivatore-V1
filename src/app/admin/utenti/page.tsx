import { redirect } from "next/navigation";
import AdminUtentiClient, {
  type SedeOption,
  type UtenteAdmin,
} from "@/components/AdminUtentiClient";
import { PageTitle } from "@/components/ui";
import { getSessioneUtente } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function AdminUtentiPage() {
  const sessione = await getSessioneUtente();
  if (!sessione?.isAdmin) {
    redirect("/");
  }

  const supabase = await createSupabaseServerClient();

  const [utentiResult, sediResult] = await Promise.all([
    supabase
      .from("commerciali")
      .select(
        "id, nome, email, telefono, ruolo, sede_id, user_id, attivo, sedi(id, nome)",
      )
      .order("nome"),
    supabase.from("sedi").select("id, nome").order("nome"),
  ]);

  if (utentiResult.error) {
    throw new Error(utentiResult.error.message);
  }
  if (sediResult.error) {
    throw new Error(sediResult.error.message);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <PageTitle meta="Gestione accessi dei commerciali.">
        Gestione utenti
      </PageTitle>
      <div className="mt-6">
        <AdminUtentiClient
          initialUtenti={(utentiResult.data ?? []) as UtenteAdmin[]}
          sedi={(sediResult.data ?? []) as SedeOption[]}
        />
      </div>
    </main>
  );
}
