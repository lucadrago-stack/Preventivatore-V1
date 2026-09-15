-- =============================================================================
-- URGENTE: ripristina EXTRA / FLAG (guide, motori, ecc.)
-- =============================================================================
-- Sintomo: in categoria (es. Avvolgibili) non compare la sezione
--   "Supplementi / Flag" (guide, motori, ...).
--
-- Causa: RLS attiva su gruppi_flag / flag_supplementi SENZA policy SELECT
--   → Postgres restituisce 0 righe (non un errore).
--
-- Le tabelle corrette sono:
--   gruppi_flag
--   flag_supplementi
--   (NON "flag" / "prodotti_flag" usate per errore in uno script precedente)
--
-- Eseguire SUBITO su Supabase SQL Editor, poi ricaricare la pagina categoria.
-- =============================================================================

-- gruppi_flag: catalogo, lettura autenticati, write admin
do $$
begin
  if to_regclass('public.gruppi_flag') is null then
    raise notice 'gruppi_flag assente — skip';
    return;
  end if;

  alter table gruppi_flag enable row level security;

  drop policy if exists gruppi_flag_select on gruppi_flag;
  drop policy if exists gruppi_flag_write_admin on gruppi_flag;
  drop policy if exists gruppi_flag_all on gruppi_flag;
  drop policy if exists dev_all_gruppi_flag on gruppi_flag;

  create policy gruppi_flag_select on gruppi_flag
    for select to authenticated
    using (true);

  create policy gruppi_flag_write_admin on gruppi_flag
    for all to authenticated
    using (is_admin())
    with check (is_admin());
end $$;

-- flag_supplementi: catalogo, lettura autenticati, write admin
do $$
begin
  if to_regclass('public.flag_supplementi') is null then
    raise notice 'flag_supplementi assente — skip';
    return;
  end if;

  alter table flag_supplementi enable row level security;

  drop policy if exists flag_supplementi_select on flag_supplementi;
  drop policy if exists flag_supplementi_write_admin on flag_supplementi;
  drop policy if exists flag_supplementi_all on flag_supplementi;
  drop policy if exists dev_all_flag_supplementi on flag_supplementi;

  create policy flag_supplementi_select on flag_supplementi
    for select to authenticated
    using (true);

  create policy flag_supplementi_write_admin on flag_supplementi
    for all to authenticated
    using (is_admin())
    with check (is_admin());
end $$;

-- Verifica rapida (deve restituire righe per Avvolgibili se i dati ci sono)
-- select g.id, g.nome, g.categoria_id, count(f.id) as n_flag
-- from gruppi_flag g
-- left join flag_supplementi f on f.gruppo_id = g.id
-- group by g.id, g.nome, g.categoria_id
-- order by g.nome;
