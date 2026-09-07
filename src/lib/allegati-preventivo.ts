import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_PREVENTIVI_PDF } from "@/lib/versioni-preventivo";

const SIGNED_URL_EXPIRY_SEC = 3600;

const TIPI_ALLEGATO_ACCETTATI = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

export type TipoAllegato = "pdf" | "jpeg" | "png";

export type AllegatoPreventivo = {
  id: number;
  preventivo_id: number;
  nome: string;
  file_path: string;
  created_at: string;
};

export type AllegatoPerPdf = {
  nome: string;
  tipo: TipoAllegato;
  bytes: ArrayBuffer;
};

export function tipoAllegatoDaNome(nome: string): TipoAllegato | null {
  const lower = nome.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpeg";
  if (lower.endsWith(".png")) return "png";
  return null;
}

export function isTipoAllegatoAccettato(file: File): boolean {
  if (TIPI_ALLEGATO_ACCETTATI.has(file.type)) return true;
  return tipoAllegatoDaNome(file.name) !== null;
}

export function percorsoFileAllegato(
  preventivoId: string | number,
  fileName: string,
): string {
  const base = fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "allegato";
  return `allegati/preventivo_${preventivoId}/${Date.now()}_${base}`;
}

export async function caricaAllegatiPreventivo(
  supabase: SupabaseClient,
  preventivoId: string | number,
): Promise<AllegatoPreventivo[]> {
  const { data, error } = await supabase
    .from("allegati_preventivo")
    .select("id, preventivo_id, nome, file_path, created_at")
    .eq("preventivo_id", preventivoId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function creaSignedUrlAllegato(
  supabase: SupabaseClient,
  filePath: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET_PREVENTIVI_PDF)
    .createSignedUrl(filePath, SIGNED_URL_EXPIRY_SEC);

  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message ?? "Impossibile generare il link per l'allegato",
    );
  }

  return data.signedUrl;
}

export async function caricaAllegatiBytesPerPdf(
  supabase: SupabaseClient,
  preventivoId: string | number,
): Promise<AllegatoPerPdf[]> {
  let allegati: AllegatoPreventivo[] = [];
  try {
    allegati = await caricaAllegatiPreventivo(supabase, preventivoId);
  } catch (err) {
    console.warn("[PDF] Allegati non caricabili, proseguo senza:", err);
    return [];
  }

  const risultato: AllegatoPerPdf[] = [];

  for (const allegato of allegati) {
    try {
      const tipo = tipoAllegatoDaNome(allegato.nome);
      if (!tipo) {
        console.warn(`[PDF] Allegato saltato (tipo non supportato): ${allegato.nome}`);
        continue;
      }

      const signedUrl = await creaSignedUrlAllegato(
        supabase,
        allegato.file_path,
      );
      const response = await fetch(signedUrl);
      if (!response.ok) {
        console.warn(`[PDF] Allegato non leggibile, saltato: ${allegato.nome}`);
        continue;
      }

      risultato.push({
        nome: allegato.nome,
        tipo,
        bytes: await response.arrayBuffer(),
      });
    } catch (err) {
      console.warn(`[PDF] Allegato saltato (${allegato.nome}):`, err);
    }
  }

  return risultato;
}

export async function salvaAllegatoPreventivo(
  supabase: SupabaseClient,
  options: {
    preventivoId: string | number;
    file: File;
  },
): Promise<AllegatoPreventivo> {
  if (!isTipoAllegatoAccettato(options.file)) {
    throw new Error("Formato non supportato. Usa PDF, JPG o PNG.");
  }

  const filePath = percorsoFileAllegato(options.preventivoId, options.file.name);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_PREVENTIVI_PDF)
    .upload(filePath, options.file, {
      contentType: options.file.type || undefined,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Upload allegato fallito: ${uploadError.message}`);
  }

  const { data, error: insertError } = await supabase
    .from("allegati_preventivo")
    .insert({
      preventivo_id: Number(options.preventivoId),
      nome: options.file.name,
      file_path: filePath,
    })
    .select("id, preventivo_id, nome, file_path, created_at")
    .single();

  if (insertError || !data) {
    await supabase.storage.from(BUCKET_PREVENTIVI_PDF).remove([filePath]);
    throw new Error(
      insertError?.message ?? "Salvataggio record allegato fallito",
    );
  }

  return data;
}

export async function eliminaAllegatoPreventivo(
  supabase: SupabaseClient,
  allegato: Pick<AllegatoPreventivo, "id" | "file_path">,
): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(BUCKET_PREVENTIVI_PDF)
    .remove([allegato.file_path]);

  if (storageError) {
    throw new Error(`Eliminazione file fallita: ${storageError.message}`);
  }

  const { error: deleteError } = await supabase
    .from("allegati_preventivo")
    .delete()
    .eq("id", allegato.id);

  if (deleteError) {
    throw new Error(`Eliminazione allegato fallita: ${deleteError.message}`);
  }
}
