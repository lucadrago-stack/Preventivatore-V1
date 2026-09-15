-- Fix RLS: servizi_complementari
-- Errore tipico in /componi:
--   new row violates row-level security policy for table "servizi_complementari"
--
-- Causa: RLS abilitata senza policy INSERT (o policy incomplete).
-- Stessa logica di accesso di "righe": via preventivo_id → preventivi.
--
-- Prerequisiti: is_admin(), is_responsabile_sede(),
--               commerciale_corrente_id(), sede_corrente_id()
-- Eseguire su Supabase SQL Editor, poi riprovare Componi.

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
