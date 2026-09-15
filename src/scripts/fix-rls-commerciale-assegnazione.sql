-- =============================================================================
-- Fix RLS: commerciale può salvare scheda (claim commerciale_id null)
-- + responsabile_sede vede i commerciali della propria sede
-- =============================================================================
-- Sintomi:
--   - new row violates RLS / update blocked on preventivi (commerciale_id null)
--   - responsabile sede non vede altri commerciali nel dropdown
-- =============================================================================

-- 1) SELECT commerciali: admin / propria riga / stessa sede (resp. sede)
drop policy if exists commerciali_select on commerciali;
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

-- 2) UPDATE preventivi: permette di "reclamare" preventivi con commerciale_id null
--    (USING) e di assegnarli a sé stessi (WITH CHECK).
drop policy if exists preventivi_update on preventivi;
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

-- 3) SELECT preventivi: resp. sede / commerciale possono vedere anche orfani
--    della propria sede? Per semplicità: commerciale vede i propri + orfani
--    che sta reclamando non servono in lista. Orfani restano visibili ad admin
--    e resp. sede (null commerciale_id).
drop policy if exists preventivi_select on preventivi;
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
