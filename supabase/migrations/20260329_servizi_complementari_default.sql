-- Template servizi complementari (default per nuovi preventivi).

create table if not exists servizi_complementari_default (
  id serial primary key,
  descrizione text not null,
  nota text not null default '',
  importo numeric not null default 0,
  ordine integer not null default 0
);

insert into servizi_complementari_default (descrizione, nota, importo, ordine)
select * from (values
  ('Pratica ENEA per detrazione fiscale', 'Non previsto', 0::numeric, 1),
  ('Pratica Finanziamento', 'Non previsto', 0::numeric, 2),
  ('Trasporto e allestimento cantiere', 'PREVISTO', 100::numeric, 3),
  ('Tiro al piano dei serramenti', 'SE PREVISTO', 0::numeric, 4)
) as v(descrizione, nota, importo, ordine)
where not exists (select 1 from servizi_complementari_default limit 1);

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
  ) then
    alter table servizi_complementari_default enable row level security;

    drop policy if exists servizi_complementari_default_select
      on servizi_complementari_default;
    drop policy if exists servizi_complementari_default_write_admin
      on servizi_complementari_default;

    create policy servizi_complementari_default_select
      on servizi_complementari_default
      for select to authenticated
      using (true);

    create policy servizi_complementari_default_write_admin
      on servizi_complementari_default
      for all to authenticated
      using (is_admin())
      with check (is_admin());
  end if;
end $$;
