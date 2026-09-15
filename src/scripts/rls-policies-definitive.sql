-- =============================================================================
-- RLS DEFINITIVE — Preventivatore
-- STATO: BOZZA DA VALIDARE — NON ESEGUIRE FINCHÉ NON DAI OK
-- =============================================================================
-- Helper già esistenti (non ricreate qui):
--   is_admin()
--   is_responsabile_sede()
--   commerciale_corrente_id()
--   sede_corrente_id()
--
-- Logica:
--   admin              → full access
--   responsabile_sede  → preventivi dei commerciali con stessa sede_id
--   commerciale        → solo preventivi con commerciale_id = commerciale_corrente_id()
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) BACKUP (eseguire per primi — fallisce se le tabelle backup esistono già)
-- -----------------------------------------------------------------------------
create table preventivi_backup_pre_rls as select * from preventivi;
create table righe_backup_pre_rls as select * from righe;


-- -----------------------------------------------------------------------------
-- 1) DROP policy di sviluppo `dev_all_*`
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like 'dev_all_%'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );
  end loop;
end $$;


-- -----------------------------------------------------------------------------
-- Helper SQL riusati nelle policy (inline, basati sulle funzioni esistenti)
-- -----------------------------------------------------------------------------
-- Preventivo visibile/scrivibile:
--   is_admin()
--   OR (is_responsabile_sede() AND commerciale_id IN (
--         SELECT c.id FROM commerciali c WHERE c.sede_id = sede_corrente_id()
--       ))
--   OR (commerciale_id = commerciale_corrente_id())


-- =============================================================================
-- 2) PREVENTIVI
-- =============================================================================
alter table preventivi enable row level security;

drop policy if exists preventivi_select on preventivi;
drop policy if exists preventivi_insert on preventivi;
drop policy if exists preventivi_update on preventivi;
drop policy if exists preventivi_delete on preventivi;

-- SELECT
create policy preventivi_select on preventivi
  for select
  to authenticated
  using (
    is_admin()
    or (
      is_responsabile_sede()
      and (
        commerciale_id is null
        or commerciale_id in (
          select c.id
          from commerciali c
          where c.sede_id = sede_corrente_id()
        )
      )
    )
    or commerciale_id = commerciale_corrente_id()
  );

-- INSERT
create policy preventivi_insert on preventivi
  for insert
  to authenticated
  with check (
    is_admin()
    or (
      is_responsabile_sede()
      and commerciale_id in (
        select c.id
        from commerciali c
        where c.sede_id = sede_corrente_id()
      )
    )
    or commerciale_id = commerciale_corrente_id()
  );

-- UPDATE
create policy preventivi_update on preventivi
  for update
  to authenticated
  using (
    is_admin()
    or (
      is_responsabile_sede()
      and (
        commerciale_id is null
        or commerciale_id in (
          select c.id
          from commerciali c
          where c.sede_id = sede_corrente_id()
        )
      )
    )
    or commerciale_id = commerciale_corrente_id()
    or (
      commerciale_id is null
      and commerciale_corrente_id() is not null
    )
  )
  with check (
    is_admin()
    or (
      is_responsabile_sede()
      and commerciale_id in (
        select c.id
        from commerciali c
        where c.sede_id = sede_corrente_id()
      )
    )
    or commerciale_id = commerciale_corrente_id()
  );

-- DELETE
create policy preventivi_delete on preventivi
  for delete
  to authenticated
  using (
    is_admin()
    or (
      is_responsabile_sede()
      and commerciale_id in (
        select c.id
        from commerciali c
        where c.sede_id = sede_corrente_id()
      )
    )
    or commerciale_id = commerciale_corrente_id()
  );


-- =============================================================================
-- 3) RIGHE (via preventivo_id → preventivi)
-- =============================================================================
alter table righe enable row level security;

drop policy if exists righe_select on righe;
drop policy if exists righe_insert on righe;
drop policy if exists righe_update on righe;
drop policy if exists righe_delete on righe;

create policy righe_select on righe
  for select
  to authenticated
  using (
    exists (
      select 1
      from preventivi p
      where p.id = righe.preventivo_id
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

create policy righe_insert on righe
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from preventivi p
      where p.id = righe.preventivo_id
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

create policy righe_update on righe
  for update
  to authenticated
  using (
    exists (
      select 1
      from preventivi p
      where p.id = righe.preventivo_id
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
      from preventivi p
      where p.id = righe.preventivo_id
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

create policy righe_delete on righe
  for delete
  to authenticated
  using (
    exists (
      select 1
      from preventivi p
      where p.id = righe.preventivo_id
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


-- =============================================================================
-- 3b) SERVIZI_COMPLEMENTARI (via preventivo_id → preventivi, come righe)
-- =============================================================================
alter table servizi_complementari enable row level security;

drop policy if exists servizi_complementari_select on servizi_complementari;
drop policy if exists servizi_complementari_insert on servizi_complementari;
drop policy if exists servizi_complementari_update on servizi_complementari;
drop policy if exists servizi_complementari_delete on servizi_complementari;

create policy servizi_complementari_select on servizi_complementari
  for select
  to authenticated
  using (
    exists (
      select 1
      from preventivi p
      where p.id = servizi_complementari.preventivo_id
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

create policy servizi_complementari_insert on servizi_complementari
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from preventivi p
      where p.id = servizi_complementari.preventivo_id
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

create policy servizi_complementari_update on servizi_complementari
  for update
  to authenticated
  using (
    exists (
      select 1
      from preventivi p
      where p.id = servizi_complementari.preventivo_id
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
      from preventivi p
      where p.id = servizi_complementari.preventivo_id
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

create policy servizi_complementari_delete on servizi_complementari
  for delete
  to authenticated
  using (
    exists (
      select 1
      from preventivi p
      where p.id = servizi_complementari.preventivo_id
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


-- =============================================================================
-- 4) VERSIONI_PREVENTIVO
-- =============================================================================
alter table versioni_preventivo enable row level security;

drop policy if exists versioni_preventivo_select on versioni_preventivo;
drop policy if exists versioni_preventivo_insert on versioni_preventivo;
drop policy if exists versioni_preventivo_update on versioni_preventivo;
drop policy if exists versioni_preventivo_delete on versioni_preventivo;

create policy versioni_preventivo_select on versioni_preventivo
  for select
  to authenticated
  using (
    exists (
      select 1
      from preventivi p
      where p.id = versioni_preventivo.preventivo_id
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

create policy versioni_preventivo_insert on versioni_preventivo
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from preventivi p
      where p.id = versioni_preventivo.preventivo_id
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

create policy versioni_preventivo_update on versioni_preventivo
  for update
  to authenticated
  using (
    exists (
      select 1
      from preventivi p
      where p.id = versioni_preventivo.preventivo_id
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
      from preventivi p
      where p.id = versioni_preventivo.preventivo_id
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

create policy versioni_preventivo_delete on versioni_preventivo
  for delete
  to authenticated
  using (
    exists (
      select 1
      from preventivi p
      where p.id = versioni_preventivo.preventivo_id
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


-- =============================================================================
-- 5) ALLEGATI_PREVENTIVO
-- =============================================================================
alter table allegati_preventivo enable row level security;

drop policy if exists allegati_preventivo_select on allegati_preventivo;
drop policy if exists allegati_preventivo_insert on allegati_preventivo;
drop policy if exists allegati_preventivo_update on allegati_preventivo;
drop policy if exists allegati_preventivo_delete on allegati_preventivo;

create policy allegati_preventivo_select on allegati_preventivo
  for select
  to authenticated
  using (
    exists (
      select 1
      from preventivi p
      where p.id = allegati_preventivo.preventivo_id
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

create policy allegati_preventivo_insert on allegati_preventivo
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from preventivi p
      where p.id = allegati_preventivo.preventivo_id
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

create policy allegati_preventivo_update on allegati_preventivo
  for update
  to authenticated
  using (
    exists (
      select 1
      from preventivi p
      where p.id = allegati_preventivo.preventivo_id
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
      from preventivi p
      where p.id = allegati_preventivo.preventivo_id
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

create policy allegati_preventivo_delete on allegati_preventivo
  for delete
  to authenticated
  using (
    exists (
      select 1
      from preventivi p
      where p.id = allegati_preventivo.preventivo_id
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


-- =============================================================================
-- 6) CATALOGO — sola lettura per autenticati, scrittura solo admin
--    prodotti, categorie, sottocategorie,
--    opzioni_colore, opzioni_vetro,
--    convenzioni_finanziamento, config_finanziamento, config_sistema
-- =============================================================================

-- --- prodotti ---
alter table prodotti enable row level security;
drop policy if exists prodotti_select on prodotti;
drop policy if exists prodotti_write_admin on prodotti;
create policy prodotti_select on prodotti
  for select to authenticated using (true);
create policy prodotti_write_admin on prodotti
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- --- categorie ---
alter table categorie enable row level security;
drop policy if exists categorie_select on categorie;
drop policy if exists categorie_write_admin on categorie;
create policy categorie_select on categorie
  for select to authenticated using (true);
create policy categorie_write_admin on categorie
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- --- sottocategorie ---
alter table sottocategorie enable row level security;
drop policy if exists sottocategorie_select on sottocategorie;
drop policy if exists sottocategorie_write_admin on sottocategorie;
create policy sottocategorie_select on sottocategorie
  for select to authenticated using (true);
create policy sottocategorie_write_admin on sottocategorie
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- --- opzioni_colore ---
alter table opzioni_colore enable row level security;
drop policy if exists opzioni_colore_select on opzioni_colore;
drop policy if exists opzioni_colore_write_admin on opzioni_colore;
create policy opzioni_colore_select on opzioni_colore
  for select to authenticated using (true);
create policy opzioni_colore_write_admin on opzioni_colore
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- --- opzioni_vetro ---
alter table opzioni_vetro enable row level security;
drop policy if exists opzioni_vetro_select on opzioni_vetro;
drop policy if exists opzioni_vetro_write_admin on opzioni_vetro;
create policy opzioni_vetro_select on opzioni_vetro
  for select to authenticated using (true);
create policy opzioni_vetro_write_admin on opzioni_vetro
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- --- gruppi_flag (extra: guide, motori, …) ---
alter table gruppi_flag enable row level security;
drop policy if exists gruppi_flag_select on gruppi_flag;
drop policy if exists gruppi_flag_write_admin on gruppi_flag;
create policy gruppi_flag_select on gruppi_flag
  for select to authenticated using (true);
create policy gruppi_flag_write_admin on gruppi_flag
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- --- flag_supplementi ---
alter table flag_supplementi enable row level security;
drop policy if exists flag_supplementi_select on flag_supplementi;
drop policy if exists flag_supplementi_write_admin on flag_supplementi;
create policy flag_supplementi_select on flag_supplementi
  for select to authenticated using (true);
create policy flag_supplementi_write_admin on flag_supplementi
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- --- convenzioni_finanziamento ---
alter table convenzioni_finanziamento enable row level security;
drop policy if exists convenzioni_finanziamento_select on convenzioni_finanziamento;
drop policy if exists convenzioni_finanziamento_write_admin on convenzioni_finanziamento;
create policy convenzioni_finanziamento_select on convenzioni_finanziamento
  for select to authenticated using (true);
create policy convenzioni_finanziamento_write_admin on convenzioni_finanziamento
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- --- config_finanziamento ---
alter table config_finanziamento enable row level security;
drop policy if exists config_finanziamento_select on config_finanziamento;
drop policy if exists config_finanziamento_write_admin on config_finanziamento;
create policy config_finanziamento_select on config_finanziamento
  for select to authenticated using (true);
create policy config_finanziamento_write_admin on config_finanziamento
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- --- config_sistema ---
alter table config_sistema enable row level security;
drop policy if exists config_sistema_select on config_sistema;
drop policy if exists config_sistema_write_admin on config_sistema;
create policy config_sistema_select on config_sistema
  for select to authenticated using (true);
create policy config_sistema_write_admin on config_sistema
  for all to authenticated
  using (is_admin())
  with check (is_admin());


-- =============================================================================
-- 7) SEDI — lettura tutti autenticati, scrittura solo admin
-- =============================================================================
alter table sedi enable row level security;
drop policy if exists sedi_select on sedi;
drop policy if exists sedi_write_admin on sedi;
create policy sedi_select on sedi
  for select to authenticated using (true);
create policy sedi_write_admin on sedi
  for all to authenticated
  using (is_admin())
  with check (is_admin());


-- =============================================================================
-- 8) COMMERCIALI
--    - SELECT: propria riga (user_id = auth.uid()) OR admin (tutto)
--    - INSERT/UPDATE/DELETE: solo admin
-- =============================================================================
alter table commerciali enable row level security;

drop policy if exists commerciali_select on commerciali;
drop policy if exists commerciali_insert_admin on commerciali;
drop policy if exists commerciali_update_admin on commerciali;
drop policy if exists commerciali_delete_admin on commerciali;

create policy commerciali_select on commerciali
  for select
  to authenticated
  using (
    is_admin()
    or user_id = auth.uid()
    or (
      is_responsabile_sede()
      and sede_id is not null
      and sede_id = sede_corrente_id()
    )
  );

create policy commerciali_insert_admin on commerciali
  for insert
  to authenticated
  with check (is_admin());

create policy commerciali_update_admin on commerciali
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy commerciali_delete_admin on commerciali
  for delete
  to authenticated
  using (is_admin());


-- =============================================================================
-- FINE SCRIPT
-- =============================================================================
-- NOTE POST-VALIDAZIONE:
-- 1) Le API admin utenti usano SERVICE_ROLE → bypassano RLS (ok).
-- 2) Tabelle catalogo flag: gruppi_flag + flag_supplementi
--    (policy select autenticati / write admin) — vedi
--    src/scripts/fix-rls-gruppi-flag.sql
--    Altri da valutare: storage bucket policies.
--    NUOVO: servizi_complementari_default → vedi
--    src/scripts/add-servizi-complementari-default.sql (include RLS admin write).
--    servizi_complementari: policy come righe (sez. 3b) — fix standalone in
--    src/scripts/fix-rls-servizi-complementari.sql
--    clienti / righe_flag: src/scripts/fix-rls-tabelle-correlate.sql
-- 3) Per responsabile_sede: sede_corrente_id() deve restituire la sede del
--    commerciale collegato all'utente loggato.
-- =============================================================================
