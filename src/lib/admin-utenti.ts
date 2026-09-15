import { NextResponse } from "next/server";
import { getSessioneUtente } from "@/lib/auth";

export {
  etichettaRuolo,
  isRuoloUtente,
  RUOLI_UTENTE,
  type RuoloUtente,
} from "@/lib/ruoli-utente";

/** Verifica sessione admin; restituisce sessione o Response 401/403. */
export async function requireAdminApi() {
  const sessione = await getSessioneUtente();
  if (!sessione?.user) {
    return {
      error: NextResponse.json({ error: "Non autenticato" }, { status: 401 }),
    };
  }
  if (!sessione.isAdmin) {
    return {
      error: NextResponse.json({ error: "Accesso negato" }, { status: 403 }),
    };
  }
  return { sessione };
}
