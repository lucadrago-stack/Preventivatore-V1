import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_PREVENTIVI_PDF = "preventivi-pdf";

const SIGNED_URL_EXPIRY_SEC = 3600;

export type VersionePreventivo = {
  id: number;
  preventivo_id: number;
  numero_versione: number;
  file_path: string;
  totale: number;
  created_at: string;
};

export async function caricaVersioniPreventivo(
  supabase: SupabaseClient,
  preventivoId: string | number,
): Promise<VersionePreventivo[]> {
  const { data, error } = await supabase
    .from("versioni_preventivo")
    .select("id, preventivo_id, numero_versione, file_path, totale, created_at")
    .eq("preventivo_id", preventivoId)
    .order("numero_versione", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function prossimoNumeroVersione(
  supabase: SupabaseClient,
  preventivoId: string | number,
): Promise<number> {
  const { data, error } = await supabase
    .from("versioni_preventivo")
    .select("numero_versione")
    .eq("preventivo_id", preventivoId)
    .order("numero_versione", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data?.numero_versione ?? 0) + 1;
}

export function percorsoFileVersione(
  preventivoId: string | number,
  numeroVersione: number,
): string {
  const timestamp = Date.now();
  return `preventivo_${preventivoId}/rev_${numeroVersione}_${timestamp}.pdf`;
}

export async function salvaVersionePreventivo(
  supabase: SupabaseClient,
  options: {
    preventivoId: string | number;
    pdfBytes: Uint8Array;
    totale: number;
  },
): Promise<{ numeroVersione: number; filePath: string }> {
  const numeroVersione = await prossimoNumeroVersione(
    supabase,
    options.preventivoId,
  );
  const filePath = percorsoFileVersione(options.preventivoId, numeroVersione);

  const blob = new Blob([new Uint8Array(options.pdfBytes)], {
    type: "application/pdf",
  });

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_PREVENTIVI_PDF)
    .upload(filePath, blob, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Upload PDF fallito: ${uploadError.message}`);
  }

  const { error: insertError } = await supabase
    .from("versioni_preventivo")
    .insert({
      preventivo_id: Number(options.preventivoId),
      numero_versione: numeroVersione,
      file_path: filePath,
      totale: options.totale,
    });

  if (insertError) {
    await supabase.storage.from(BUCKET_PREVENTIVI_PDF).remove([filePath]);
    throw new Error(`Salvataggio versione fallito: ${insertError.message}`);
  }

  return { numeroVersione, filePath };
}

export async function creaSignedUrlVersione(
  supabase: SupabaseClient,
  filePath: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET_PREVENTIVI_PDF)
    .createSignedUrl(filePath, SIGNED_URL_EXPIRY_SEC);

  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message ?? "Impossibile generare il link di download",
    );
  }

  return data.signedUrl;
}

export async function eliminaVersionePreventivo(
  supabase: SupabaseClient,
  versione: Pick<VersionePreventivo, "id" | "file_path">,
): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(BUCKET_PREVENTIVI_PDF)
    .remove([versione.file_path]);

  if (storageError) {
    throw new Error(`Eliminazione file fallita: ${storageError.message}`);
  }

  const { error: deleteError } = await supabase
    .from("versioni_preventivo")
    .delete()
    .eq("id", versione.id);

  if (deleteError) {
    throw new Error(`Eliminazione versione fallita: ${deleteError.message}`);
  }
}
