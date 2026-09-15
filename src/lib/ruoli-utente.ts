export const RUOLI_UTENTE = [
  "admin",
  "commerciale",
  "responsabile_sede",
] as const;

export type RuoloUtente = (typeof RUOLI_UTENTE)[number];

export function isRuoloUtente(value: string): value is RuoloUtente {
  return (RUOLI_UTENTE as readonly string[]).includes(value);
}

/** Admin / responsabile sede (capo area) possono assegnare altri commerciali. */
export function puoAssegnareAltriCommerciali(
  ruolo: string | null | undefined,
): boolean {
  return ruolo === "admin" || ruolo === "responsabile_sede";
}

export function etichettaRuolo(ruolo: string | null | undefined): string {
  switch (ruolo) {
    case "admin":
      return "Admin";
    case "responsabile_sede":
      return "Responsabile sede";
    case "commerciale":
      return "Commerciale";
    default:
      return ruolo?.trim() || "—";
  }
}
