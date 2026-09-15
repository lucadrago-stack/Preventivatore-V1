"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/components/ui";
import { etichettaRuolo, type RuoloUtente } from "@/lib/ruoli-utente";
import { normalizzaRelazione } from "@/lib/format";

export type SedeOption = {
  id: number;
  nome: string;
};

export type UtenteAdmin = {
  id: number;
  nome: string;
  email: string | null;
  telefono: string | null;
  ruolo: string | null;
  sede_id: number | null;
  user_id: string | null;
  attivo: boolean | null;
  sedi: { id: number; nome: string } | { id: number; nome: string }[] | null;
};

type Props = {
  initialUtenti: UtenteAdmin[];
  sedi: SedeOption[];
};

type Modale =
  | { tipo: "nuovo" }
  | { tipo: "modifica"; utente: UtenteAdmin }
  | { tipo: "password"; utente: UtenteAdmin }
  | null;

const RUOLI_OPTIONS: { value: RuoloUtente; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "responsabile_sede", label: "Responsabile sede" },
  { value: "commerciale", label: "Commerciale" },
];

function badgeRuoloClass(ruolo: string | null): string {
  switch (ruolo) {
    case "admin":
      return "bg-brand-navy text-white";
    case "responsabile_sede":
      return "bg-brand-accent text-white";
    default:
      return "bg-zinc-200 text-zinc-700";
  }
}

function nomeSede(utente: UtenteAdmin): string {
  const sede = normalizzaRelazione(utente.sedi);
  return sede?.nome?.trim() || "—";
}

export default function AdminUtentiClient({ initialUtenti, sedi }: Props) {
  const router = useRouter();
  const [utenti, setUtenti] = useState(initialUtenti);
  const [ricerca, setRicerca] = useState("");
  const [modale, setModale] = useState<Modale>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Form nuovo
  const [nuovoNome, setNuovoNome] = useState("");
  const [nuovoEmail, setNuovoEmail] = useState("");
  const [nuovoPassword, setNuovoPassword] = useState("");
  const [nuovoRuolo, setNuovoRuolo] = useState<RuoloUtente>("commerciale");
  const [nuovoSedeId, setNuovoSedeId] = useState("");
  const [nuovoTelefono, setNuovoTelefono] = useState("");

  // Form modifica
  const [editNome, setEditNome] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [editRuolo, setEditRuolo] = useState<RuoloUtente>("commerciale");
  const [editSedeId, setEditSedeId] = useState("");

  // Form password
  const [nuovaPassword, setNuovaPassword] = useState("");

  const filtrati = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    if (!q) return utenti;
    return utenti.filter((u) => {
      const nome = (u.nome ?? "").toLowerCase();
      const email = (u.email ?? "").toLowerCase();
      return nome.includes(q) || email.includes(q);
    });
  }, [utenti, ricerca]);

  function mostraFeedback(msg: string) {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2500);
  }

  function apriNuovo() {
    setError(null);
    setNuovoNome("");
    setNuovoEmail("");
    setNuovoPassword("");
    setNuovoRuolo("commerciale");
    setNuovoSedeId(sedi[0] ? String(sedi[0].id) : "");
    setNuovoTelefono("");
    setModale({ tipo: "nuovo" });
  }

  function apriModifica(utente: UtenteAdmin) {
    setError(null);
    setEditNome(utente.nome ?? "");
    setEditTelefono(utente.telefono ?? "");
    setEditRuolo(
      (utente.ruolo as RuoloUtente) || "commerciale",
    );
    setEditSedeId(utente.sede_id != null ? String(utente.sede_id) : "");
    setModale({ tipo: "modifica", utente });
  }

  function apriPassword(utente: UtenteAdmin) {
    setError(null);
    setNuovaPassword("");
    setModale({ tipo: "password", utente });
  }

  function chiudiModale() {
    if (saving) return;
    setModale(null);
    setError(null);
  }

  async function handleCrea(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/utenti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nuovoNome,
          email: nuovoEmail,
          password: nuovoPassword,
          ruolo: nuovoRuolo,
          sede_id: nuovoSedeId ? Number(nuovoSedeId) : null,
          telefono: nuovoTelefono,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        utente?: UtenteAdmin;
      };
      if (!res.ok || !data.utente) {
        throw new Error(data.error ?? "Creazione fallita");
      }
      setUtenti((prev) =>
        [...prev, data.utente!].sort((a, b) =>
          a.nome.localeCompare(b.nome, "it"),
        ),
      );
      setModale(null);
      mostraFeedback("Utente creato");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function handleModifica(e: FormEvent) {
    e.preventDefault();
    if (modale?.tipo !== "modifica") return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/utenti/${modale.utente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: editNome,
          telefono: editTelefono,
          ruolo: editRuolo,
          sede_id: editSedeId ? Number(editSedeId) : null,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        utente?: UtenteAdmin;
      };
      if (!res.ok || !data.utente) {
        throw new Error(data.error ?? "Aggiornamento fallito");
      }
      setUtenti((prev) =>
        prev.map((u) => (u.id === data.utente!.id ? data.utente! : u)),
      );
      setModale(null);
      mostraFeedback("Utente aggiornato");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    if (modale?.tipo !== "password") return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/utenti/${modale.utente.id}/password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: nuovaPassword }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Reset password fallito");
      }
      setModale(null);
      mostraFeedback("Password aggiornata");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAttivo(utente: UtenteAdmin) {
    const prossimo = !(utente.attivo ?? false);
    setTogglingId(utente.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/utenti/${utente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attivo: prossimo }),
      });
      const data = (await res.json()) as {
        error?: string;
        utente?: UtenteAdmin;
      };
      if (!res.ok || !data.utente) {
        throw new Error(data.error ?? "Operazione fallita");
      }
      setUtenti((prev) =>
        prev.map((u) => (u.id === data.utente!.id ? data.utente! : u)),
      );
      mostraFeedback(prossimo ? "Utente riattivato" : "Utente disattivato");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Input
          label="Cerca"
          type="search"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          placeholder="Nome o email..."
          wrapperClassName="sm:max-w-sm sm:flex-1"
        />
        <Button type="button" variant="primary" onClick={apriNuovo}>
          Nuovo utente
        </Button>
      </div>

      {feedback && (
        <p className="rounded-md border border-brand-accent/30 bg-brand-accent/5 px-3 py-2 text-sm text-brand-navy">
          {feedback}
        </p>
      )}
      {error && !modale && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-brand-danger">
          {error}
        </p>
      )}

      <Card compact className="overflow-x-auto p-0 sm:p-0">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-brand-border bg-brand-surface text-xs uppercase tracking-wide text-brand-muted">
            <tr>
              <th className="px-3 py-3 font-medium">Nome</th>
              <th className="px-3 py-3 font-medium">Email</th>
              <th className="px-3 py-3 font-medium">Ruolo</th>
              <th className="px-3 py-3 font-medium">Sede</th>
              <th className="px-3 py-3 font-medium">Telefono</th>
              <th className="px-3 py-3 font-medium">Stato</th>
              <th className="px-3 py-3 font-medium">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filtrati.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-brand-muted"
                >
                  Nessun utente trovato.
                </td>
              </tr>
            ) : (
              filtrati.map((utente) => {
                const attivo = utente.attivo !== false;
                return (
                  <tr
                    key={utente.id}
                    className="border-b border-brand-border/70 last:border-0"
                  >
                    <td className="px-3 py-3 font-medium text-brand-text">
                      {utente.nome}
                    </td>
                    <td className="px-3 py-3 text-brand-muted">
                      {utente.email || "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeRuoloClass(utente.ruolo)}`}
                      >
                        {etichettaRuolo(utente.ruolo)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-brand-muted">
                      {nomeSede(utente)}
                    </td>
                    <td className="px-3 py-3 text-brand-muted">
                      {utente.telefono || "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          attivo
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {attivo ? "Attivo" : "Disattivato"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-[36px] px-2.5 py-1 text-xs"
                          onClick={() => apriModifica(utente)}
                        >
                          Modifica
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-[36px] px-2.5 py-1 text-xs"
                          disabled={togglingId === utente.id}
                          onClick={() => toggleAttivo(utente)}
                        >
                          {togglingId === utente.id
                            ? "..."
                            : attivo
                              ? "Disattiva"
                              : "Riattiva"}
                        </Button>
                        <Button
                          type="button"
                          variant="tertiary"
                          className="min-h-[36px] px-2.5 py-1 text-xs"
                          onClick={() => apriPassword(utente)}
                          disabled={!utente.user_id}
                        >
                          Reimposta password
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {modale && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={chiudiModale}
        >
          <div
            className="w-full max-w-md rounded-lg border border-brand-border bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {modale.tipo === "nuovo" && (
              <form onSubmit={handleCrea} className="space-y-4">
                <h2 className="text-lg font-semibold text-brand-navy">
                  Nuovo utente
                </h2>
                <Input
                  label="Nome"
                  required
                  value={nuovoNome}
                  onChange={(e) => setNuovoNome(e.target.value)}
                />
                <Input
                  label="Email"
                  type="email"
                  required
                  value={nuovoEmail}
                  onChange={(e) => setNuovoEmail(e.target.value)}
                />
                <Input
                  label="Password iniziale"
                  type="password"
                  required
                  minLength={8}
                  value={nuovoPassword}
                  onChange={(e) => setNuovoPassword(e.target.value)}
                  hint="Minimo 8 caratteri"
                />
                <Input
                  as="select"
                  label="Ruolo"
                  required
                  value={nuovoRuolo}
                  onChange={(e) =>
                    setNuovoRuolo(e.target.value as RuoloUtente)
                  }
                >
                  {RUOLI_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Input>
                <Input
                  as="select"
                  label="Sede"
                  value={nuovoSedeId}
                  onChange={(e) => setNuovoSedeId(e.target.value)}
                >
                  <option value="">— Nessuna —</option>
                  {sedi.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </Input>
                <Input
                  label="Telefono"
                  value={nuovoTelefono}
                  onChange={(e) => setNuovoTelefono(e.target.value)}
                />
                {error && (
                  <p className="text-sm text-brand-danger" role="alert">
                    {error}
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" onClick={chiudiModale}>
                    Annulla
                  </Button>
                  <Button type="submit" variant="primary" disabled={saving}>
                    {saving ? "Salvataggio..." : "Crea utente"}
                  </Button>
                </div>
              </form>
            )}

            {modale.tipo === "modifica" && (
              <form onSubmit={handleModifica} className="space-y-4">
                <h2 className="text-lg font-semibold text-brand-navy">
                  Modifica utente
                </h2>
                <Input
                  label="Email"
                  value={modale.utente.email ?? ""}
                  disabled
                  hint="L'email non è modificabile"
                />
                <Input
                  label="Nome"
                  required
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                />
                <Input
                  label="Telefono"
                  value={editTelefono}
                  onChange={(e) => setEditTelefono(e.target.value)}
                />
                <Input
                  as="select"
                  label="Ruolo"
                  required
                  value={editRuolo}
                  onChange={(e) =>
                    setEditRuolo(e.target.value as RuoloUtente)
                  }
                >
                  {RUOLI_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Input>
                <Input
                  as="select"
                  label="Sede"
                  value={editSedeId}
                  onChange={(e) => setEditSedeId(e.target.value)}
                >
                  <option value="">— Nessuna —</option>
                  {sedi.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </Input>
                {error && (
                  <p className="text-sm text-brand-danger" role="alert">
                    {error}
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" onClick={chiudiModale}>
                    Annulla
                  </Button>
                  <Button type="submit" variant="primary" disabled={saving}>
                    {saving ? "Salvataggio..." : "Salva"}
                  </Button>
                </div>
              </form>
            )}

            {modale.tipo === "password" && (
              <form onSubmit={handlePassword} className="space-y-4">
                <h2 className="text-lg font-semibold text-brand-navy">
                  Reimposta password
                </h2>
                <p className="text-sm text-brand-muted">
                  Nuova password per{" "}
                  <span className="font-medium text-brand-text">
                    {modale.utente.nome}
                  </span>
                </p>
                <Input
                  label="Nuova password"
                  type="password"
                  required
                  minLength={8}
                  value={nuovaPassword}
                  onChange={(e) => setNuovaPassword(e.target.value)}
                  hint="Minimo 8 caratteri"
                />
                {error && (
                  <p className="text-sm text-brand-danger" role="alert">
                    {error}
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" onClick={chiudiModale}>
                    Annulla
                  </Button>
                  <Button type="submit" variant="primary" disabled={saving}>
                    {saving ? "Salvataggio..." : "Aggiorna password"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
