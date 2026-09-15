import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type ProfiloCommerciale = {
  id: number;
  nome: string;
  email: string | null;
  ruolo: string | null;
  user_id: string | null;
};

export type SessioneUtente = {
  user: User;
  commerciale: ProfiloCommerciale | null;
  displayName: string;
  isAdmin: boolean;
};

/** Sessione auth + riga commerciali collegata a user_id. */
export async function getSessioneUtente(): Promise<SessioneUtente | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: commerciale } = await supabase
    .from("commerciali")
    .select("id, nome, email, ruolo, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const profilo = (commerciale as ProfiloCommerciale | null) ?? null;
  const displayName =
    profilo?.nome?.trim() || user.email?.trim() || "Utente";

  return {
    user,
    commerciale: profilo,
    displayName,
    isAdmin: profilo?.ruolo === "admin",
  };
}
