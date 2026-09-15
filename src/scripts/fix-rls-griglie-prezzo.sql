-- RLS lettura griglie listino (usate dal form commerciale)
-- Senza queste policy il client autenticato riceve 0 righe (range L/H 0–0).

alter table griglie_prezzo enable row level security;
alter table griglie_prezzo_celle enable row level security;
alter table griglie_prezzo_extra_colore enable row level security;

drop policy if exists griglie_prezzo_select on griglie_prezzo;
drop policy if exists griglie_prezzo_write_admin on griglie_prezzo;
create policy griglie_prezzo_select on griglie_prezzo
  for select to authenticated using (true);
create policy griglie_prezzo_write_admin on griglie_prezzo
  for all to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists griglie_prezzo_celle_select on griglie_prezzo_celle;
drop policy if exists griglie_prezzo_celle_write_admin on griglie_prezzo_celle;
create policy griglie_prezzo_celle_select on griglie_prezzo_celle
  for select to authenticated using (true);
create policy griglie_prezzo_celle_write_admin on griglie_prezzo_celle
  for all to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists griglie_prezzo_extra_colore_select on griglie_prezzo_extra_colore;
drop policy if exists griglie_prezzo_extra_colore_write_admin on griglie_prezzo_extra_colore;
create policy griglie_prezzo_extra_colore_select on griglie_prezzo_extra_colore
  for select to authenticated using (true);
create policy griglie_prezzo_extra_colore_write_admin on griglie_prezzo_extra_colore
  for all to authenticated
  using (is_admin())
  with check (is_admin());
