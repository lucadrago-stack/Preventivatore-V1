-- =============================================================================
-- Riga posa indipendente: schema + backfill
-- Eseguire interamente nel SQL Editor di Supabase, poi verificareare lo schema API
-- (Settings → API → Reload schema, oppure attendere ~1 minuto).
-- =============================================================================

-- 1) Colonna parent: collega posa → riga prodotto padre
alter table righe
  add column if not exists parent_riga_id bigint references righe(id) on delete set null;

create index if not exists righe_parent_riga_id_idx
  on righe (parent_riga_id)
  where parent_riga_id is not null;

-- Compatibilità: se esisteva origine_riga_id, copia i valori
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'righe' and column_name = 'origine_riga_id'
  ) then
    update righe
    set parent_riga_id = origine_riga_id
    where parent_riga_id is null
      and origine_riga_id is not null;
  end if;
end $$;

-- 2) Accetta tipo_riga = 'posa'
alter table righe drop constraint if exists righe_tipo_riga_check;
alter table righe
  add constraint righe_tipo_riga_check
  check (tipo_riga in ('prodotto', 'testo', 'posa'));

-- 3) Descrizione posa default configurabile
create table if not exists config_sistema (
  chiave text primary key,
  valore text not null,
  updated_at timestamptz not null default now()
);

insert into config_sistema (chiave, valore)
values (
  'descrizione_posa_default',
  E'POSA IN OPERA\nIN RISTRUTTURAZIONE SENZA OPERE MURARIE CON SISTEMA POSACLIMA CERTIFICATO'
)
on conflict (chiave) do nothing;

-- 4) Backfill retroattivo: prodotti con posa separata senza riga posa figlia
--    (include preventivo 9 / riga 41 e tutti i casi analoghi)
insert into righe (
  preventivo_id,
  prodotto_id,
  tipo_riga,
  parent_riga_id,
  quantita,
  prezzo_riga,
  posa,
  posa_importo,
  posa_riga_separata,
  descrizione_cliente,
  descrizione_libera,
  descrizione_tecnica,
  visibile_pdf,
  numero_posizione,
  ordine
)
select
  p.preventivo_id,
  null,
  'posa',
  p.id,
  coalesce(nullif(p.quantita, 0), 1),
  p.posa_importo, -- già = unitario × quantità sul prodotto
  false,
  null,
  false,
  '<div>POSA IN OPERA</div><div>IN RISTRUTTURAZIONE SENZA OPERE MURARIE CON SISTEMA POSACLIMA CERTIFICATO</div>',
  E'POSA IN OPERA\nIN RISTRUTTURAZIONE SENZA OPERE MURARIE CON SISTEMA POSACLIMA CERTIFICATO',
  'Posa in opera',
  true,
  coalesce(
    (select max(r2.numero_posizione) from righe r2 where r2.preventivo_id = p.preventivo_id),
    0
  ) + row_number() over (partition by p.preventivo_id order by p.id),
  coalesce(
    (select max(r3.ordine) from righe r3 where r3.preventivo_id = p.preventivo_id),
    0
  ) + row_number() over (partition by p.preventivo_id order by p.id)
from righe p
where coalesce(p.posa_riga_separata, false) = true
  and coalesce(p.posa, false) = true
  and coalesce(p.posa_importo, 0) > 0
  and coalesce(p.tipo_riga, 'prodotto') = 'prodotto'
  and not exists (
    select 1
    from righe x
    where x.parent_riga_id = p.id
      and x.tipo_riga = 'posa'
  );

-- 5) Verifica
select tipo_riga, count(*) as n
from righe
group by tipo_riga
order by tipo_riga;

select id, preventivo_id, parent_riga_id, quantita, prezzo_riga, left(descrizione_libera, 40) as desc_lib
from righe
where tipo_riga = 'posa'
order by id;
