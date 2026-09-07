-- Eseguire nel SQL Editor di Supabase (Dashboard → SQL) prima di usare le nuove funzioni.
alter table righe add column if not exists modalita_mq text;
alter table righe add column if not exists mq_diretti numeric;
alter table righe add column if not exists numero_posizione int;
alter table righe add column if not exists riferimento_interno text;

-- Backfill numerazione su righe già presenti (esclude righe testo)
with numerate as (
  select
    id,
    row_number() over (
      partition by preventivo_id
      order by ordine nulls last, id
    ) as n
  from righe
  where coalesce(tipo_riga, 'prodotto') <> 'testo'
)
update righe r
set numero_posizione = numerate.n
from numerate
where r.id = numerate.id
  and r.numero_posizione is null;
