import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageTitle } from "@/components/ui";
import { getSessioneUtente } from "@/lib/auth";

export default async function AdminPage() {
  const sessione = await getSessioneUtente();
  if (!sessione?.isAdmin) {
    redirect("/");
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <PageTitle meta="Area riservata agli amministratori.">
        Amministrazione
      </PageTitle>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link href="/admin/utenti" className="block">
          <Card className="h-full transition-colors hover:border-brand-accent/50 hover:ring-1 hover:ring-brand-accent/20">
            <h2 className="text-lg font-semibold text-brand-navy">
              Gestione utenti
            </h2>
            <p className="mt-2 text-sm text-brand-muted">
              Crea e gestisci gli accessi dei commerciali.
            </p>
          </Card>
        </Link>

        <Link href="/admin/parametri" className="block">
          <Card className="h-full transition-colors hover:border-brand-accent/50 hover:ring-1 hover:ring-brand-accent/20">
            <h2 className="text-lg font-semibold text-brand-navy">
              Parametri
            </h2>
            <p className="mt-2 text-sm text-brand-muted">
              Configurazioni generali del preventivatore.
            </p>
          </Card>
        </Link>
      </div>
    </main>
  );
}
