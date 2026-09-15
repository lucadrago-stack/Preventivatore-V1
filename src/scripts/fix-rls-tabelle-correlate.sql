-- =============================================================================
-- Audit + fix RLS per tabelle a rischio (stesso tipo di servizi_complementari)
-- =============================================================================
-- Sintomo tipico: "new row violates row-level security policy for table X"
-- Cause: RLS ON + nessuna policy INSERT (o policy incomplete).
--
-- 1) Esegui la sezione AUDIT e leggi i risultati.
-- 2) Se vedi tabelle con RLS senza policy insert/update → esegui FIX sotto.
-- Prerequisiti helper: is_admin(), is_responsabile_sede(),
--   commerciale_corrente_id(), sede_corrente_id()
-- =============================================================================

-- -----------------------------------------------------------------------------
-- AUDIT: tabelle public con RLS attiva e policy per comando
-- -----------------------------------------------------------------------------
select
  c.relname as tabella,
  c.relrowsecurity as rls_attiva,
  coalesce(
    (
      select string_agg(distinct pol.polcmd::text, ', ' order by pol.polcmd::text)
      from pg_policy pol
      where pol.polrelid = c.oid
    ),
    '(nessuna policy)'
  ) as comandi_coperto,
  exists (
    select 1 from pg_policy pol
    where pol.polrelid = c.oid and pol.polcmd in ('r', '*')
  ) as ha_select,
  exists (
    select 1 from pg_policy pol
    where pol.polrelid = c.oid and pol.polcmd in ('a', '*')
  ) as ha_insert,
  exists (
    select 1 from pg_policy pol
    where pol.polrelid = c.oid and pol.polcmd in ('w', '*')
  ) as ha_update,
  exists (
    select 1 from pg_policy pol
    where pol.polrelid = c.oid and pol.polcmd in ('d', '*')
  ) as ha_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true
order by c.relname;

-- polcmd: r=SELECT a=INSERT w=UPDATE d=DELETE *=ALL


-- -----------------------------------------------------------------------------
-- FIX: clienti (usata in home / preventivo / nuovo preventivo)
-- Lettura autenticati; scrittura autenticati (anagrafica condivisa).
-- Se preferisci solo admin in write, restringi dopo.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.clienti') is null then
    raise notice 'tabella clienti assente — skip';
    return;
  end if;

  alter table clienti enable row level security;

  drop policy if exists clienti_select on clienti;
  drop policy if exists clienti_insert on clienti;
  drop policy if exists clienti_update on clienti;
  drop policy if exists clienti_delete on clienti;

  create policy clienti_select on clienti
    for select to authenticated using (true);
  create policy clienti_insert on clienti
    for insert to authenticated with check (true);
  create policy clienti_update on clienti
    for update to authenticated using (true) with check (true);
  create policy clienti_delete on clienti
    for delete to authenticated using (is_admin());
end $$;


-- -----------------------------------------------------------------------------
-- FIX: righe_flag (figlia di righe → via riga → preventivo)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.righe_flag') is null then
    raise notice 'tabella righe_flag assente — skip';
    return;
  end if;

  alter table righe_flag enable row level security;

  drop policy if exists righe_flag_select on righe_flag;
  drop policy if exists righe_flag_insert on righe_flag;
  drop policy if exists righe_flag_update on righe_flag;
  drop policy if exists righe_flag_delete on righe_flag;

  create policy righe_flag_select on righe_flag
    for select to authenticated
    using (
      exists (
        select 1
        from righe r
        join preventivi p on p.id = r.preventivo_id
        where r.id = righe_flag.riga_id
          and (
            is_admin()
            or (
              is_responsabile_sede()
              and p.commerciale_id in (
                select c.id from commerciali c where c.sede_id = sede_corrente_id()
              )
            )
            or p.commerciale_id = commerciale_corrente_id()
          )
      )
    );

  create policy righe_flag_insert on righe_flag
    for insert to authenticated
    with check (
      exists (
        select 1
        from righe r
        join preventivi p on p.id = r.preventivo_id
        where r.id = righe_flag.riga_id
          and (
            is_admin()
            or (
              is_responsabile_sede()
              and p.commerciale_id in (
                select c.id from commerciali c where c.sede_id = sede_corrente_id()
              )
            )
            or p.commerciale_id = commerciale_corrente_id()
          )
      )
    );

  create policy righe_flag_update on righe_flag
    for update to authenticated
    using (
      exists (
        select 1
        from righe r
        join preventivi p on p.id = r.preventivo_id
        where r.id = righe_flag.riga_id
          and (
            is_admin()
            or (
              is_responsabile_sede()
              and p.commerciale_id in (
                select c.id from commerciali c where c.sede_id = sede_corrente_id()
              )
            )
            or p.commerciale_id = commerciale_corrente_id()
          )
      )
    )
    with check (
      exists (
        select 1
        from righe r
        join preventivi p on p.id = r.preventivo_id
        where r.id = righe_flag.riga_id
          and (
            is_admin()
            or (
              is_responsabile_sede()
              and p.commerciale_id in (
                select c.id from commerciali c where c.sede_id = sede_corrente_id()
              )
            )
            or p.commerciale_id = commerciale_corrente_id()
          )
      )
    );

  create policy righe_flag_delete on righe_flag
    for delete to authenticated
    using (
      exists (
        select 1
        from righe r
        join preventivi p on p.id = r.preventivo_id
        where r.id = righe_flag.riga_id
          and (
            is_admin()
            or (
              is_responsabile_sede()
              and p.commerciale_id in (
                select c.id from commerciali c where c.sede_id = sede_corrente_id()
              )
            )
            or p.commerciale_id = commerciale_corrente_id()
          )
      )
    );
end $$;


-- -----------------------------------------------------------------------------
-- FIX: gruppi_flag / flag_supplementi (EXTRA: guide, motori, …)
-- Catalogo — lettura autenticati, write admin
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.gruppi_flag') is not null then
    alter table gruppi_flag enable row level security;
    drop policy if exists gruppi_flag_select on gruppi_flag;
    drop policy if exists gruppi_flag_write_admin on gruppi_flag;
    create policy gruppi_flag_select on gruppi_flag
      for select to authenticated using (true);
    create policy gruppi_flag_write_admin on gruppi_flag
      for all to authenticated
      using (is_admin()) with check (is_admin());
  end if;

  if to_regclass('public.flag_supplementi') is not null then
    alter table flag_supplementi enable row level security;
    drop policy if exists flag_supplementi_select on flag_supplementi;
    drop policy if exists flag_supplementi_write_admin on flag_supplementi;
    create policy flag_supplementi_select on flag_supplementi
      for select to authenticated using (true);
    create policy flag_supplementi_write_admin on flag_supplementi
      for all to authenticated
      using (is_admin()) with check (is_admin());
  end if;

  -- Alias legacy eventualmente presenti
  if to_regclass('public.flag') is not null then
    alter table flag enable row level security;
    drop policy if exists flag_select on flag;
    drop policy if exists flag_write_admin on flag;
    create policy flag_select on flag
      for select to authenticated using (true);
    create policy flag_write_admin on flag
      for all to authenticated
      using (is_admin()) with check (is_admin());
  end if;

  if to_regclass('public.prodotti_flag') is not null then
    alter table prodotti_flag enable row level security;
    drop policy if exists prodotti_flag_select on prodotti_flag;
    drop policy if exists prodotti_flag_write_admin on prodotti_flag;
    create policy prodotti_flag_select on prodotti_flag
      for select to authenticated using (true);
    create policy prodotti_flag_write_admin on prodotti_flag
      for all to authenticated
      using (is_admin()) with check (is_admin());
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- Pulizia dati spurii: prezzo_netto_target = 0 azzerava i totali in UI
-- -----------------------------------------------------------------------------
update preventivi
set prezzo_netto_target = null
where prezzo_netto_target is not null
  and prezzo_netto_target <= 0;
