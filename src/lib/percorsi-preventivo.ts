export function hrefFormRigaPreventivo(
  preventivoId: string | number,
  categoriaId: number,
  sottocategoriaId?: number | null,
  rigaId?: number | null,
) {
  const base =
    sottocategoriaId != null
      ? `/preventivo/${preventivoId}/categoria/${categoriaId}/sottocategoria/${sottocategoriaId}`
      : `/preventivo/${preventivoId}/categoria/${categoriaId}`;
  return rigaId != null ? `${base}?riga=${rigaId}` : base;
}
