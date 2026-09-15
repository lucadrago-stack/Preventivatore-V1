"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { dataOggiPerInput } from "@/lib/format";
import { createSupabaseClient } from "@/lib/supabase";

type ClienteRubrica = {
  id: number;
  nome: string;
  cantiere: string | null;
  telefono: string | null;
  email: string | null;
};

type NuovoPreventivoModalProps = {
  /** Classi CSS del pulsante trigger (override dello stile default). */
  buttonClassName?: string;
};

export default function NuovoPreventivoModal({
  buttonClassName,
}: NuovoPreventivoModalProps = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [riferimento, setRiferimento] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteCantiere, setClienteCantiere] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [clienti, setClienti] = useState<ClienteRubrica[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const supabase = createSupabaseClient();
    void supabase
      .from("clienti")
      .select("id, nome, cantiere, telefono, email")
      .order("nome")
      .then(({ data }) => {
        if (data) setClienti(data as ClienteRubrica[]);
      });
  }, [open]);

  function handleClose() {
    setOpen(false);
    setRiferimento("");
    setClienteNome("");
    setClienteCantiere("");
    setClienteTelefono("");
    setClienteEmail("");
    setClienteId(null);
    setError(null);
  }

  function handleSelezionaCliente(nome: string) {
    setClienteNome(nome);
    const match = clienti.find(
      (c) => c.nome.toLowerCase() === nome.toLowerCase(),
    );
    if (match) {
      setClienteId(match.id);
      setClienteCantiere(match.cantiere ?? "");
      setClienteTelefono(match.telefono ?? "");
      setClienteEmail(match.email ?? "");
    } else {
      setClienteId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const nomeCliente = clienteNome.trim();
    if (!nomeCliente) return;

    const riferimentoFinale = riferimento.trim() || nomeCliente;

    setLoading(true);
    setError(null);

    const supabase = createSupabaseClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      setLoading(false);
      setError("Sessione non valida. Effettua di nuovo l'accesso.");
      return;
    }

    const { data: profilo, error: profiloError } = await supabase
      .from("commerciali")
      .select("id, ruolo")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profiloError) {
      setLoading(false);
      setError(profiloError.message);
      return;
    }

    // RLS: commerciale_id deve coincidere con commerciale_corrente_id().
    // Admin può creare anche senza riga commerciali collegata.
    const commercialeId = profilo?.id ?? null;
    if (!commercialeId && profilo?.ruolo !== "admin") {
      setLoading(false);
      setError(
        "Profilo commerciale non collegato all'utente. Contatta l'amministratore.",
      );
      return;
    }

    const { data, error: insertError } = await supabase
      .from("preventivi")
      .insert({
        riferimento: riferimentoFinale,
        commerciale_id: commercialeId,
        cliente_id: clienteId,
        cliente_nome: nomeCliente,
        cliente_cantiere: clienteCantiere.trim() || null,
        cliente_telefono: clienteTelefono.trim() || null,
        cliente_email: clienteEmail.trim() || null,
        data_preventivo: dataOggiPerInput(),
        finanziamento_attivo: true,
      })
      .select("id")
      .single();

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push(`/preventivo/${data.id}`);
  }

  return (
    <>
      <Button
        type="button"
        variant="primary"
        onClick={() => setOpen(true)}
        className={buttonClassName}
      >
        Nuovo preventivo
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg border border-brand-border bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-brand-navy">
              Nuovo preventivo
            </h2>
            <p className="mt-1 text-sm text-brand-muted">
              Il cliente è obbligatorio. Gli altri campi sono facoltativi.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <Input
                label="Cliente *"
                type="text"
                value={clienteNome}
                list="nuovo-clienti-rubrica"
                onChange={(e) => handleSelezionaCliente(e.target.value)}
                placeholder="Cerca in rubrica o scrivi un nome nuovo"
                autoFocus
                required
              />
              <datalist id="nuovo-clienti-rubrica">
                {clienti.map((c) => (
                  <option key={c.id} value={c.nome} />
                ))}
              </datalist>
              <Input
                label="Riferimento"
                type="text"
                value={riferimento}
                onChange={(e) => setRiferimento(e.target.value)}
                placeholder="Se vuoto, usa il nome cliente"
              />
              <Input
                label="Cantiere"
                type="text"
                value={clienteCantiere}
                onChange={(e) => setClienteCantiere(e.target.value)}
              />
              <Input
                label="Telefono"
                type="tel"
                value={clienteTelefono}
                onChange={(e) => setClienteTelefono(e.target.value)}
              />
              <Input
                label="Email"
                type="email"
                value={clienteEmail}
                onChange={(e) => setClienteEmail(e.target.value)}
              />

              {error && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-brand-danger">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleClose}
                  disabled={loading}
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading || !clienteNome.trim()}
                >
                  {loading ? "Creazione..." : "Crea preventivo"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
